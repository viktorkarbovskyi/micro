import type { AuditEvent, DemoUser, Report } from '@app/shared';
import type { Db } from './db';

export interface StoredReport extends Report {
  createdAtMs: number;
}

export interface Store {
  tx<T>(fn: () => T): T;
  insertReport(r: StoredReport): void;
  getReport(id: string): StoredReport | undefined;
  updateReport(id: string, fields: Partial<Pick<Report, 'title' | 'amountCents' | 'state' | 'updatedAt'>>): void;
  appendEvent(e: AuditEvent): void;
  listEvents(reportId: string): AuditEvent[];
  listReports(): StoredReport[];
  listUsers(): DemoUser[];
  wipe(): void;
}

const REPORT_COLUMNS = {
  title: 'title',
  amountCents: 'amount_cents',
  state: 'state',
  updatedAt: 'updated_at',
} as const;

const REPORT_SELECT = `SELECT id, owner_id AS ownerId, title, amount_cents AS amountCents, currency, state,
  created_at AS createdAt, created_at_ms AS createdAtMs, updated_at AS updatedAt FROM reports`;

export function createStore(db: Db): Store {
  const insertReport = db.prepare(
    `INSERT INTO reports (id, owner_id, title, amount_cents, currency, state, created_at, created_at_ms, updated_at)
     VALUES (@id, @ownerId, @title, @amountCents, @currency, @state, @createdAt, @createdAtMs, @updatedAt)`,
  );
  const getReport = db.prepare(`${REPORT_SELECT} WHERE id = ?`);
  const listReports = db.prepare(`${REPORT_SELECT} ORDER BY rowid`);
  const insertEvent = db.prepare(
    `INSERT INTO audit_events (id, report_id, from_state, to_state, actor_id, role, at, note)
     VALUES (@id, @reportId, @from, @to, @actorId, @role, @at, @note)`,
  );
  const listEvents = db.prepare(
    `SELECT id, report_id AS reportId, from_state AS "from", to_state AS "to", actor_id AS actorId, role, at, note
     FROM audit_events WHERE report_id = ? ORDER BY seq`,
  );
  const listUsers = db.prepare('SELECT id, name, role FROM users ORDER BY position');

  return {
    tx: (fn) => db.transaction(fn)(),
    insertReport: (r) => void insertReport.run(r),
    getReport: (id) => getReport.get(id) as StoredReport | undefined,
    updateReport(id, fields) {
      const keys = (Object.keys(REPORT_COLUMNS) as (keyof typeof REPORT_COLUMNS)[]).filter(
        (k) => fields[k] !== undefined,
      );
      if (keys.length === 0) return;
      const set = keys.map((k) => `${REPORT_COLUMNS[k]} = @${k}`).join(', ');
      db.prepare(`UPDATE reports SET ${set} WHERE id = @id`).run({ ...fields, id });
    },
    appendEvent: (e) => void insertEvent.run({ ...e, note: e.note ?? null }),
    listEvents(reportId) {
      return (listEvents.all(reportId) as (Omit<AuditEvent, 'note'> & { note: string | null })[]).map(
        ({ note, ...rest }) => (note === null ? rest : { ...rest, note }),
      );
    },
    listReports: () => listReports.all() as StoredReport[],
    listUsers: () => listUsers.all() as DemoUser[],
    wipe() {
      db.transaction(() => {
        db.exec('DELETE FROM audit_events; DELETE FROM reports;');
      })();
    },
  };
}
