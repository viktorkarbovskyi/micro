import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_USERS, type AuditEvent } from '@app/shared';
import { openDb } from '../src/db';
import { createStore, type StoredReport } from '../src/store';

const U = DEMO_USERS[0]!;
const report = (id = 'r1'): StoredReport => ({
  id,
  ownerId: U.id,
  title: 'Taxi',
  amountCents: 1250,
  currency: 'EUR',
  state: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  createdAtMs: Date.UTC(2026, 0, 1),
  updatedAt: '2026-01-01T00:00:00Z',
});
const event = (id: string, at: string, note?: string): AuditEvent => ({
  id,
  reportId: 'r1',
  from: null,
  to: 'draft',
  actorId: U.id,
  role: 'employee',
  at,
  ...(note !== undefined ? { note } : {}),
});
const mk = () => createStore(openDb(':memory:'));

describe('store', () => {
  it('round-trips a report', () => {
    const s = mk();
    s.insertReport(report());
    expect(s.getReport('r1')).toEqual(report());
    expect(s.getReport('nope')).toBeUndefined();
    expect(s.listReports()).toEqual([report()]);
  });
  it('updates report fields', () => {
    const s = mk();
    s.insertReport(report());
    s.updateReport('r1', { title: 'New', state: 'submitted', updatedAt: '2026-01-02T00:00:00Z' });
    expect(s.getReport('r1')).toMatchObject({ title: 'New', state: 'submitted', amountCents: 1250 });
  });
  it('lists the demo users in order', () => {
    expect(mk().listUsers()).toEqual(DEMO_USERS);
  });
  it('returns events in insertion order, not by at', () => {
    const s = mk();
    s.insertReport(report());
    s.appendEvent(event('e1', '2026-01-02T00:00:00Z'));
    s.appendEvent(event('e2', '2026-01-01T00:00:00Z'));
    expect(s.listEvents('r1').map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('omits note when absent and keeps it when present', () => {
    const s = mk();
    s.insertReport(report());
    s.appendEvent(event('e1', '2026-01-01T00:00:00Z'));
    s.appendEvent(event('e2', '2026-01-01T00:00:00Z', 'why'));
    const [a, b] = s.listEvents('r1');
    expect('note' in a!).toBe(false);
    expect('seq' in a!).toBe(false);
    expect(b!.note).toBe('why');
    expect(a).toEqual(event('e1', '2026-01-01T00:00:00Z'));
  });
  it('rolls back a failed transaction', () => {
    const s = mk();
    expect(() =>
      s.tx(() => {
        s.insertReport(report());
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(s.getReport('r1')).toBeUndefined();
  });
  it('wipe clears reports and events but keeps users', () => {
    const s = mk();
    s.insertReport(report());
    s.appendEvent(event('e1', '2026-01-01T00:00:00Z'));
    s.wipe();
    expect(s.listReports()).toEqual([]);
    expect(s.listEvents('r1')).toEqual([]);
    expect(s.listUsers()).toHaveLength(5);
  });
  it('creates the parent directory for a file path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
    try {
      const file = path.join(dir, 'missing', 'sub', 'app.db');
      const db = openDb(file);
      db.close();
      expect(fs.existsSync(file)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
