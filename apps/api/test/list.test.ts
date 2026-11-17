import type { FastifyInstance } from 'fastify';
import type supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS, type State } from '@app/shared';
import { as, makeApp } from './helpers';

type U = (typeof DEMO_USERS)[number];
const [H, G, M, F, A] = DEMO_USERS as [U, U, U, U, U];

let app: FastifyInstance;
let http: supertest.Agent;

beforeEach(async () => {
  ({ app, http } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

async function create(owner: U, title = 'Taxi'): Promise<string> {
  const res = await http.post('/api/reports').set(as(owner)).send({ title, amountCents: 100 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function submit(owner: U, id: string): Promise<void> {
  const res = await http.post(`/api/reports/${id}/transition`).set(as(owner)).send({ to: 'submitted' });
  expect(res.status).toBe(200);
}

async function to(actor: U, id: string, state: State): Promise<void> {
  const res = await http.post(`/api/reports/${id}/transition`).set(as(actor)).send({ to: state });
  expect(res.status).toBe(200);
}

async function setNow(now: string | number): Promise<void> {
  const res = await http.post('/api/test/set-now').send({ now });
  expect(res.status).toBe(200);
}

const list = (actor: U, qs = '') => http.get(`/api/reports${qs}`).set(as(actor));
const ids = (res: { body: { reports: Array<{ id: string }> } }) => res.body.reports.map((r) => r.id);

describe('GET /api/reports: visibility', () => {
  it('shows each role only what it may see', async () => {
    const hDraft = await create(H);
    const hSub = await create(H);
    await submit(H, hSub);
    const gDraft = await create(G);
    const gSub = await create(G);
    await submit(G, gSub);

    expect(ids(await list(H)).sort()).toEqual([hDraft, hSub].sort());
    expect(ids(await list(M)).sort()).toEqual([hSub, gSub].sort());
    expect(ids(await list(F)).sort()).toEqual([hSub, gSub].sort());
    expect(ids(await list(A)).sort()).toEqual([hDraft, hSub, gDraft, gSub].sort());
  });

  it('does not reveal a draft through ?ownerId', async () => {
    await create(G);
    const res = await list(M, `?ownerId=${G.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reports: [] });
  });
});

describe('GET /api/reports: search and states', () => {
  it('matches q against the title, case-insensitively', async () => {
    const taxi = await create(H, 'Airport taxi');
    await create(H, 'Hotel');
    expect(ids(await list(H, '?q=TAXI'))).toEqual([taxi]);
  });

  it('matches q against the id', async () => {
    const a = await create(H, 'One');
    await create(H, 'Two');
    const res = await list(H, `?q=${a.slice(0, 6).toUpperCase()}`);
    expect(ids(res)).toContain(a);
  });

  it('returns the union of repeated state values', async () => {
    const d = await create(H);
    const s = await create(H);
    await submit(H, s);
    const p = await create(H);
    await submit(H, p);
    await to(M, p, 'manager_approved');
    await to(F, p, 'finance_approved');
    await to(F, p, 'paid');
    expect(ids(await list(H, '?state=submitted&state=paid')).sort()).toEqual([s, p].sort());
    expect(ids(await list(H, '?state=draft'))).toEqual([d]);
  });

  it('treats empty state and q as no restriction', async () => {
    await create(H);
    await create(H);
    expect((await list(H, '?state=&q=')).body.reports).toHaveLength(2);
    expect((await list(H, '?state=&state=draft')).body.reports).toHaveLength(2);
  });
});

describe('GET /api/reports: dates', () => {
  it('createdFrom and createdTo are inclusive at the exact millisecond', async () => {
    await setNow('2026-01-01T00:00:00.000Z');
    const a = await create(H);
    await setNow('2026-01-01T00:00:00.001Z');
    const b = await create(H);
    expect(ids(await list(H, '?createdFrom=2026-01-01T00:00:00.001Z'))).toEqual([b]);
    expect(ids(await list(H, '?createdTo=2026-01-01T00:00:00.000Z'))).toEqual([a]);
    expect(ids(await list(H, '?createdFrom=2026-01-01T00:00:00.000Z&createdTo=2026-01-01T00:00:00.001Z'))).toEqual([b, a]);
  });

  it('accepts filter instants with more than millisecond precision (truncated to ms)', async () => {
    await setNow('2026-01-01T00:00:00.000Z');
    const a = await create(H);
    await setNow('2026-01-01T00:00:00.001Z');
    const b = await create(H);
    const from = await list(H, '?createdFrom=2026-01-01T00:00:00.000999Z');
    expect(from.status).toBe(200);
    expect(ids(from)).toEqual([b, a]);
    expect(ids(await list(H, '?createdFrom=2026-01-01T00:00:00.001000%2B00:00'))).toEqual([b]);
    expect(ids(await list(H, '?createdTo=2026-01-01t00:00:00.000999z'))).toEqual([a]);
  });

  it('treats an offset-less createdTo as UTC', async () => {
    await setNow('2026-01-01T00:00:00.000Z');
    const a = await create(H);
    await setNow('2026-01-01T00:00:00.001Z');
    await create(H);
    expect(ids(await list(H, '?createdTo=2026-01-01T00:00:00'))).toEqual([a]);
  });

  it('orders by instant, not by the textual timestamp (mixed formats)', async () => {
    await setNow('2026-01-01T02:00:00+03:00');
    const a = await create(H);
    await setNow(1767225600000);
    const b = await create(H);
    expect(ids(await list(H))).toEqual([b, a]);
    expect(ids(await list(H, '?createdFrom=2026-01-01T00:00:00Z'))).toEqual([b]);
  });

  it('orders ties by id ascending', async () => {
    await setNow('2026-01-01T00:00:00.000Z');
    const created = [await create(H), await create(H), await create(H)];
    expect(ids(await list(H))).toEqual([...created].sort());
  });
});

describe('GET /api/reports: errors', () => {
  const fieldOf = (res: { body: { errors?: Array<{ field: string }> } }) =>
    res.body.errors?.map((d) => d.field);

  it.each([
    ['state=banana', 'state'],
    ['createdFrom=yesterday', 'createdFrom'],
    ['createdTo=1767225600000', 'createdTo'],
    ['foo=1', 'foo'],
    ['q=a&q=b', 'q'],
    ['ownerId=a&ownerId=b', 'ownerId'],
    ['createdFrom=2026-01-01T00:00:00Z&createdFrom=2026-01-02T00:00:00Z', 'createdFrom'],
    ['state=draft&state=banana', 'state'],
  ])('rejects ?%s', async (qs, field) => {
    const res = await list(H, `?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(fieldOf(res)).toContain(field);
  });

  it('detail lists the failing query parameters', async () => {
    const res = await list(H, '?state=banana&createdFrom=yesterday');
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe(
      'Request query is invalid: createdFrom must be an ISO 8601 date-time; ' +
        'state must be one of draft, submitted, manager_approved, finance_approved, paid, rejected',
    );
  });
});
