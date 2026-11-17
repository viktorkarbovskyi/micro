import { randomUUID } from 'node:crypto';
import type { Actor, AuditEvent, Report } from '@app/shared';
import type { AppDeps } from './app';
import { canSee, decideCreate, decideEdit, decideTransition } from './domain/rules';
import { outcomeError } from './errors';
import type { StoredReport } from './store';
import type { CreateInput, ListFilter, PatchInput, TransitionInput } from './validate';

/** A well-formed UUID (any version, either case). Anything else cannot name a report. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The public representation (http-api.md §1.5): exactly the 8 report fields. */
function toReport(r: StoredReport): Report {
  return {
    id: r.id,
    ownerId: r.ownerId,
    title: r.title,
    amountCents: r.amountCents,
    currency: r.currency,
    state: r.state,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Report operations on already-validated input (check order steps 5–7). Throws `ApiError`.
 * Each operation takes at most one `clock.now()` stamp; every write runs inside `store.tx`.
 */
export function createReportService(deps: AppDeps) {
  const { store, clock } = deps;

  /** Step 5: a malformed id, a missing report and a hidden report are all 404 NOT_FOUND. */
  function findVisible(actor: Actor, id: string): StoredReport {
    const report = UUID_RE.test(id) ? store.getReport(id) : undefined;
    if (!report || !canSee(actor, report)) throw outcomeError('NOT_VISIBLE', {});
    return report;
  }

  return {
    /** state-machine.md §3. */
    create(actor: Actor, input: CreateInput): Report {
      const outcome = decideCreate(actor);
      if (outcome !== 'OK') throw outcomeError(outcome, {});
      const now = clock.now();
      const report: StoredReport = {
        id: randomUUID(),
        ownerId: actor.id,
        title: input.title,
        amountCents: input.amountCents,
        currency: input.currency,
        state: 'draft',
        createdAt: now.iso,
        createdAtMs: now.ms,
        updatedAt: now.iso,
      };
      store.tx(() => {
        store.insertReport(report);
        store.appendEvent({
          id: randomUUID(),
          reportId: report.id,
          from: null,
          to: 'draft',
          actorId: actor.id,
          role: actor.role,
          at: now.iso,
        });
      });
      return toReport(report);
    },

    /** http-api.md §2.6: visibility first, then AND-ed filters; newest first, ties by id. */
    list(actor: Actor, filter: ListFilter): Report[] {
      const needle = filter.q?.toLowerCase();
      return store
        .listReports()
        .filter((r) => canSee(actor, r))
        .filter(
          (r) =>
            (needle === undefined || r.title.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle)) &&
            (filter.states === undefined || filter.states.includes(r.state)) &&
            (filter.createdFromMs === undefined || r.createdAtMs >= filter.createdFromMs) &&
            (filter.createdToMs === undefined || r.createdAtMs <= filter.createdToMs) &&
            (filter.ownerId === undefined || r.ownerId === filter.ownerId),
        )
        .sort((a, b) => b.createdAtMs - a.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(toReport);
    },

    get(actor: Actor, id: string): Report {
      return toReport(findVisible(actor, id));
    },

    /** state-machine.md §5: owner-employee edits a draft; no audit event. */
    edit(actor: Actor, id: string, patch: PatchInput): Report {
      const report = findVisible(actor, id);
      const outcome = decideEdit(actor, report);
      if (outcome !== 'OK') throw outcomeError(outcome, { state: report.state });
      const now = clock.now();
      const fields: { title?: string; amountCents?: number; updatedAt: string } = { updatedAt: now.iso };
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.amountCents !== undefined) fields.amountCents = patch.amountCents;
      store.updateReport(report.id, fields);
      return toReport({ ...report, ...fields });
    },

    /** state-machine.md §4: decision, state update and audit event in one transaction, one stamp. */
    transition(actor: Actor, id: string, input: TransitionInput): Report {
      const report = findVisible(actor, id);
      const outcome = decideTransition(actor, report, input.to);
      if (outcome !== 'OK') throw outcomeError(outcome, { from: report.state, to: input.to });
      const now = clock.now();
      store.tx(() => {
        store.updateReport(report.id, { state: input.to, updatedAt: now.iso });
        const event: AuditEvent = {
          id: randomUUID(),
          reportId: report.id,
          from: report.state,
          to: input.to,
          actorId: actor.id,
          role: actor.role,
          at: now.iso,
        };
        if (input.note !== undefined) event.note = input.note;
        store.appendEvent(event);
      });
      return toReport({ ...report, state: input.to, updatedAt: now.iso });
    },

    /** state-machine.md AU4–AU5: insertion order, subject to visibility. */
    audit(actor: Actor, id: string): AuditEvent[] {
      const report = findVisible(actor, id);
      return store.listEvents(report.id);
    },
  };
}

export type ReportService = ReturnType<typeof createReportService>;
