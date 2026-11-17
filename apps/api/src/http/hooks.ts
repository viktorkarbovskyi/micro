import type { IncomingHttpHeaders } from 'node:http';
import type { onRequestHookHandler, preParsingHookHandler, preValidationHookHandler } from 'fastify';
import { ROLES, type Actor, type Role } from '@app/shared';
import { ApiError, validationError } from '../errors';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireActor`; only meaningful on routes that use that hook. */
    actor: Actor;
  }
}

const MAX_USER_ID_LENGTH = 100;

const invalidHeaders = (detail: string) => new ApiError(400, 'INVALID_HEADERS', detail);

/**
 * Identity header rules (specs/http-api.md §1.1). Returns the actor with a trimmed id, or throws
 * 400 INVALID_HEADERS. Shared by `requireActor` and the framework-error handler in `app.ts`.
 */
export function actorFromHeaders(headers: IncomingHttpHeaders): Actor {
  const rawId = headers['x-user-id'];
  const role = headers['x-user-role'];
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (id === '') throw invalidHeaders('X-User-Id header is required');
  if (id.length > MAX_USER_ID_LENGTH) {
    throw invalidHeaders(`X-User-Id must be at most ${MAX_USER_ID_LENGTH} characters`);
  }
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) {
    throw invalidHeaders(`X-User-Role must be one of ${ROLES.join(', ')}`);
  }
  return { id, role: role as Role };
}

/** Check order step 2 (specs/http-api.md §1.3). Runs as `onRequest`, before the body is read. */
export const requireActor: onRequestHookHandler = async (request) => {
  request.actor = actorFromHeaders(request.headers);
};

/**
 * Check order step 3 (specs/http-api.md §1.3, §1.4). Runs as `preValidation`; the catch-all
 * content-type parser has left the raw body string (or `undefined` when there is no body).
 * Replaces `request.body` with the parsed JSON object.
 */
export const jsonBody: preValidationHookHandler = async (request) => {
  const mediaType = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
  const raw = typeof request.body === 'string' ? request.body : '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw validationError('body', [{ field: 'body', message: 'Body must be a JSON object' }]);
  }
  request.body = parsed;
};

/**
 * Check order step 4 for endpoints without query parameters (specs/http-api.md §1): any query
 * parameter is unknown → 400 VALIDATION_ERROR, one error per parameter. Runs as `preValidation`,
 * after `jsonBody` where both apply.
 */
export const noQuery: preValidationHookHandler = async (request) => {
  const names = Object.keys((request.query ?? {}) as object);
  if (names.length > 0) {
    throw validationError(
      'query',
      names.map((field) => ({ field, message: 'Unknown query parameter' })),
    );
  }
};

/**
 * For endpoints whose body is ignored (specs/http-api.md §5). Runs as `preParsing`, after
 * `requireActor`. Fastify validates the Content-Type and reads the body right after this hook, so a
 * malformed media type would be rejected with 415 and an oversized body with 413 before the route
 * runs. Dropping the body-describing headers makes Fastify treat the request as bodyless; Node
 * discards the unread body once the response is sent.
 */
export const ignoreBody: preParsingHookHandler = async (request) => {
  const headers = request.raw.headers;
  delete headers['content-type'];
  delete headers['content-length'];
  delete headers['transfer-encoding'];
};
