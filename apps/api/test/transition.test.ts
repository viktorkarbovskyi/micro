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

const move = (actor: U, id: string, body: unknown) =>
  http.post(`/api/reports/${id}/transition`).set(as(actor)).send(body as object);

async function step(actor: U, id: string, to: State): Promise<void> {
  const res = await move(actor, id, { to });
  expect(res.status).toBe(200);
}

async function create(): Promise<string> {
  const res = await http.post('/api/reports').set(as(H)).send({ title: 'Taxi', amountCents: 2350 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function moveTo(state: State): Promise<string> {
  const id = await create();
  const path: [U, State][] = [];
  if (state === 'draft') return id;
  path.push([H, 'submitted']);
  if (state === 'manager_approved' || state === 'finance_approved' || state === 'paid') path.push([M, 'manager_approved']);
  if (state === 'finance_approved' || state === 'paid') path.push([F, 'finance_approved']);
  if (state === 'paid') path.push([F, 'paid']);
  if (state === 'rejected') path.push([M, 'rejected']);
  for (const [a, to] of path) await step(a, id, to);
  return id;
}

const events = async (id: string) => {
  const res = await http.get(`/api/reports/${id}/audit`).set(as(A));
  expect(res.status).toBe(200);
  return res.body.events as Array<Record<string, unknown>>;
};

async function setNow(iso: string): Promise<void> {
  const res = await http.post('/api/test/set-now').send({ now: iso });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ now: iso });
}

const ROWS: [State, State, U][] = [
  ['draft', 'submitted', H],
  ['submitted', 'draft', H],
  ['submitted', 'manager_approved', M],
  ['submitted', 'rejected', M],
  ['manager_approved', 'finance_approved', F],
  ['manager_approved', 'rejected', F],
  ['finance_approved', 'paid', F],
];

describe('POST /api/reports/:id/transition', () => {
  it.each(ROWS)('%s -> %s by the allowed actor', async (from, to, actor) => {
    const id = await moveTo(from);
    const res = await move(actor, id, { to });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe(to);
    expect(res.body.id).toBe(id);
  });

  it.each(ROWS)('%s -> %s by admin records role admin', async (from, to) => {
    const id = await moveTo(from);
    const res = await move(A, id, { to });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe(to);
    const evs = await events(id);
    expect(evs[evs.length - 1]).toMatchObject({ from, to, actorId: A.id, role: 'admin' });
  });

  it('records the full happy path in order', async () => {
    const id = await create();
    const path: [U, State][] = [[H, 'submitted'], [M, 'manager_approved'], [F, 'finance_approved'], [F, 'paid']];
    let t = 1;
    for (const [a, to] of path) {
      await setNow(`2026-01-0${t++}T10:00:00.000Z`);
      await step(a, id, to);
    }
    const evs = await events(id);
    expect(evs.map((e) => e.to)).toEqual(['draft', 'submitted', 'manager_approved', 'finance_approved', 'paid']);
    expect(evs).toHaveLength(5);
    for (let i = 1; i < evs.length; i++) expect(evs[i]!.from).toBe(evs[i - 1]!.to);
    const get = await http.get(`/api/reports/${id}`).set(as(A));
    expect(get.body.updatedAt).toBe('2026-01-04T10:00:00.000Z');
  });

  it('wrong role on a visible report is 409 ILLEGAL_TRANSITION', async () => {
    const id = await moveTo('submitted');
    const res = await move(F, id, { to: 'manager_approved' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ILLEGAL_TRANSITION');
    expect(res.body.detail).toBe('Cannot transition from submitted to manager_approved');
    expect(await events(id)).toHaveLength(2);
  });

  it('terminal and same-state transitions are 409', async () => {
    const paid = await moveTo('paid');
    expect((await move(A, paid, { to: 'draft' })).status).toBe(409);
    const rejected = await moveTo('rejected');
    expect((await move(A, rejected, { to: 'submitted' })).status).toBe(409);
    const draft = await create();
    const same = await move(A, draft, { to: 'draft' });
    expect(same.status).toBe(409);
    expect(await events(draft)).toHaveLength(1);
  });

  it('hidden reports are 404 and leave no event', async () => {
    const id = await create();
    expect((await move(G, id, { to: 'submitted' })).status).toBe(404);
    expect((await move(M, id, { to: 'manager_approved' })).status).toBe(404);
    expect(await events(id)).toHaveLength(1);
  });

  it('validation errors are 400 and leave no event', async () => {
    const id = await create();
    const bad = await move(H, id, { to: 'banana' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors).toEqual(expect.arrayContaining([{ field: 'to', message: expect.any(String) }]));
    expect((await move(H, id, {})).status).toBe(400);
    const long = await move(H, id, { to: 'submitted', note: 'x'.repeat(1001) });
    expect(long.status).toBe(400);
    expect(long.body.errors[0].field).toBe('note');
    expect((await move(H, id, { to: 'submitted', note: 5 })).status).toBe(400);
    const unk = await move(H, id, { to: 'submitted', extra: 1 });
    expect(unk.status).toBe(400);
    expect(unk.body.errors).toEqual(expect.arrayContaining([{ field: 'extra', message: expect.any(String) }]));
    expect(await events(id)).toHaveLength(1);
  });

  it('validation runs before visibility', async () => {
    const id = await create();
    expect((await move(G, id, { to: 'banana' })).status).toBe(400);
  });

  it('accepts a 1000-character note', async () => {
    const id = await create();
    const res = await move(H, id, { to: 'submitted', note: 'x'.repeat(1000) });
    expect(res.status).toBe(200);
  });

  it('stores a trimmed note; blank or null notes are absent', async () => {
    const a = await create();
    await move(H, a, { to: 'submitted', note: '  No receipt  ' });
    expect((await events(a))[1]!.note).toBe('No receipt');
    const b = await create();
    await move(H, b, { to: 'submitted', note: '   ' });
    expect((await events(b))[1]).not.toHaveProperty('note');
    const c = await create();
    await move(H, c, { to: 'submitted', note: null });
    expect((await events(c))[1]).not.toHaveProperty('note');
  });

  it('submitting twice: second is 409 and only 2 events exist', async () => {
    const id = await create();
    expect((await move(H, id, { to: 'submitted' })).status).toBe(200);
    expect((await move(H, id, { to: 'submitted' })).status).toBe(409);
    expect(await events(id)).toHaveLength(2);
  });

  it('keeps insertion order when the clock moves backwards', async () => {
    const id = await create();
    await setNow('2026-05-01T10:00:00.000Z');
    await step(H, id, 'submitted');
    await setNow('2026-01-01T10:00:00.000Z');
    const res = await move(M, id, { to: 'manager_approved' });
    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBe('2026-01-01T10:00:00.000Z');
    const evs = await events(id);
    expect(evs.map((e) => e.to)).toEqual(['draft', 'submitted', 'manager_approved']);
    // The clock really went backwards: the later event's instant precedes the earlier one's.
    expect(evs[1]!.at).toBe('2026-05-01T10:00:00.000Z');
    expect(evs[2]!.at).toBe('2026-01-01T10:00:00.000Z');
    expect(Date.parse(evs[2]!.at as string)).toBeLessThan(Date.parse(evs[1]!.at as string));
    // The audit chain stays coherent: each event starts where the previous one ended.
    expect(evs.map((e) => e.from)).toEqual([null, 'draft', 'submitted']);
    for (let i = 1; i < evs.length; i++) expect(evs[i]!.from).toBe(evs[i - 1]!.to);
    expect(evs.map((e) => e.reportId)).toEqual([id, id, id]);
  });
});
