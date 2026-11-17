import { CURRENCIES, DEFAULT_CURRENCY, STATES, type Currency, type State } from '@app/shared';
import { validationError, type FieldError } from './errors';
import { parseInstant } from './time';

/**
 * Request validation (specs/http-api.md §2, check order step 4). Validators read only the fields
 * they know, by own-property lookup, and build their result field by field; every other own key
 * of the input (including a literal `__proto__` from `JSON.parse`) is an unknown field.
 */

export type Result<T> = { value: T } | { errors: FieldError[] };

export interface CreateInput {
  title: string;
  amountCents: number;
  currency: Currency;
}

export interface ListFilter {
  q?: string;
  states?: State[];
  createdFromMs?: number;
  createdToMs?: number;
  ownerId?: string;
}

export interface TransitionInput {
  to: State;
  note?: string;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 1000;

/** Returns the value, or throws 400 VALIDATION_ERROR with the collected field errors. */
export function valueOrThrow<T>(result: Result<T>, source: 'body' | 'query' = 'body'): T {
  if ('errors' in result) {
    throw validationError(source, result.errors);
  }
  return result.value;
}

const has = (obj: object, key: string): boolean => Object.hasOwn(obj, key);

function unknownFields(body: object, known: readonly string[]): FieldError[] {
  return Object.keys(body)
    .filter((key) => !known.includes(key))
    .map((field) => ({ field, message: 'Unknown field' }));
}

/** domain.md §4: string, trimmed, 1–200 characters after trimming. */
function checkTitle(raw: unknown): { value: string } | { message: string } {
  if (typeof raw !== 'string') return { message: 'title must be a string' };
  const title = raw.trim();
  if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    return { message: `title must be 1–${MAX_TITLE_LENGTH} characters after trimming` };
  }
  return { value: title };
}

/** domain.md §4: a JSON number that is a safe integer > 0. */
function checkAmountCents(raw: unknown): { value: number } | { message: string } {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    return { message: 'amountCents must be a positive safe integer' };
  }
  return { value: raw };
}

const CREATE_FIELDS = ['title', 'amountCents', 'currency'] as const;

export function validateCreate(body: object): Result<CreateInput> {
  const fields = body as Record<string, unknown>;
  const errors: FieldError[] = [];

  let title = '';
  if (!has(body, 'title')) {
    errors.push({ field: 'title', message: 'title is required' });
  } else {
    const r = checkTitle(fields.title);
    if ('message' in r) errors.push({ field: 'title', message: r.message });
    else title = r.value;
  }

  let amountCents = 0;
  if (!has(body, 'amountCents')) {
    errors.push({ field: 'amountCents', message: 'amountCents is required' });
  } else {
    const r = checkAmountCents(fields.amountCents);
    if ('message' in r) errors.push({ field: 'amountCents', message: r.message });
    else amountCents = r.value;
  }

  let currency: Currency = DEFAULT_CURRENCY;
  if (has(body, 'currency')) {
    const raw = fields.currency;
    if (typeof raw === 'string' && (CURRENCIES as readonly string[]).includes(raw)) {
      currency = raw as Currency;
    } else {
      errors.push({ field: 'currency', message: `currency must be one of ${CURRENCIES.join(', ')}` });
    }
  }

  errors.push(...unknownFields(body, CREATE_FIELDS));
  if (errors.length > 0) return { errors };
  return { value: { title, amountCents, currency } };
}

const TRANSITION_FIELDS = ['to', 'note'] as const;

/** http-api.md §2.3: `to` is a state; `note` is optional, trimmed, null or blank means absent. */
export function validateTransition(body: object): Result<TransitionInput> {
  const fields = body as Record<string, unknown>;
  const errors: FieldError[] = [];

  let to: State = 'draft';
  if (!has(body, 'to')) {
    errors.push({ field: 'to', message: 'to is required' });
  } else if (typeof fields.to === 'string' && (STATES as readonly string[]).includes(fields.to)) {
    to = fields.to as State;
  } else {
    errors.push({ field: 'to', message: `to must be one of ${STATES.join(', ')}` });
  }

  let note: string | undefined;
  if (has(body, 'note') && fields.note !== null) {
    if (typeof fields.note !== 'string') {
      errors.push({ field: 'note', message: 'note must be a string or null' });
    } else {
      const trimmed = fields.note.trim();
      if (trimmed.length > MAX_NOTE_LENGTH) {
        errors.push({ field: 'note', message: `note must be at most ${MAX_NOTE_LENGTH} characters after trimming` });
      } else if (trimmed.length > 0) {
        note = trimmed;
      }
    }
  }

  errors.push(...unknownFields(body, TRANSITION_FIELDS));
  if (errors.length > 0) return { errors };
  return { value: note === undefined ? { to } : { to, note } };
}

export interface PatchInput {
  title?: string;
  amountCents?: number;
}

const PATCH_FIELDS = ['title', 'amountCents'] as const;

/** http-api.md §2.2: at least one of `title` / `amountCents`; `currency`, `state` and the rest are unknown. */
export function validatePatch(body: object): Result<PatchInput> {
  const fields = body as Record<string, unknown>;
  const errors: FieldError[] = [];
  const value: PatchInput = {};

  if (has(body, 'title')) {
    const r = checkTitle(fields.title);
    if ('message' in r) errors.push({ field: 'title', message: r.message });
    else value.title = r.value;
  }
  if (has(body, 'amountCents')) {
    const r = checkAmountCents(fields.amountCents);
    if ('message' in r) errors.push({ field: 'amountCents', message: r.message });
    else value.amountCents = r.value;
  }

  errors.push(...unknownFields(body, PATCH_FIELDS));
  if (Object.keys(body).length === 0) {
    errors.push({ field: 'body', message: 'Provide at least one of: title, amountCents' });
  }
  if (errors.length > 0) return { errors };
  return { value };
}

const LIST_PARAMS = ['q', 'state', 'createdFrom', 'createdTo', 'ownerId'] as const;

/**
 * http-api.md §2.6: known params `q`, `state` (repeatable), `createdFrom`, `createdTo`, `ownerId`.
 * An empty value restricts nothing; any other param given twice is rejected.
 */
export function validateListQuery(query: Record<string, string | string[]>): Result<ListFilter> {
  const errors: FieldError[] = [];
  const value: ListFilter = {};

  for (const field of Object.keys(query)) {
    if (!(LIST_PARAMS as readonly string[]).includes(field)) errors.push({ field, message: 'Unknown query parameter' });
  }

  const single = (field: (typeof LIST_PARAMS)[number]): string | undefined => {
    if (!has(query, field)) return undefined;
    const raw = query[field];
    if (Array.isArray(raw)) {
      errors.push({ field, message: `${field} may be given only once` });
      return undefined;
    }
    return raw === '' ? undefined : raw;
  };

  const q = single('q');
  if (q !== undefined) value.q = q;
  const ownerId = single('ownerId');
  if (ownerId !== undefined) value.ownerId = ownerId;

  for (const [field, key] of [
    ['createdFrom', 'createdFromMs'],
    ['createdTo', 'createdToMs'],
  ] as const) {
    const raw = single(field);
    if (raw === undefined) continue;
    const ms = parseInstant(raw);
    if (ms === null) errors.push({ field, message: `${field} must be an ISO 8601 date-time` });
    else value[key] = ms;
  }

  if (has(query, 'state')) {
    const raw = query.state;
    const states: State[] = [];
    for (const s of Array.isArray(raw) ? raw : [raw]) {
      if (s === '') continue;
      if ((STATES as readonly string[]).includes(s)) states.push(s as State);
      else errors.push({ field: 'state', message: `state must be one of ${STATES.join(', ')}` });
    }
    if (states.length > 0) value.states = states;
  }

  if (errors.length > 0) return { errors };
  return { value };
}
