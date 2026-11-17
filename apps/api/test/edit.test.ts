import type { FastifyInstance } from 'fastify';
import type supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@app/shared';
import { as, makeApp } from './helpers';

type U = (typeof DEMO_USERS)[number];
const [H, G, M, , A] = DEMO_USERS as [U, U, U, U, U];

let app: FastifyInstance;
let http: supertest.Agent;

beforeEach(async () => {
  ({ app, http } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

const setNow = async (now: string) => {
  const res = await http.post('/api/test/set-now').send({ now });
  expect(res.status).toBe(200);
};

async function create(): Promise<string> {
  const res = await http.post('/api/reports').set(as(H)).send({ title: 'Taxi', amountCents: 2350 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const patch = (actor: { id: string; role: U['role'] }, id: string, body: unknown) =>
  http.patch(`/api/reports/${id}`).set(as(actor)).send(body as object);

const auditCount = async (id: string) => {
  const res = await http.get(`/api/reports/${id}/audit`).set(as(A));
  expect(res.status).toBe(200);
  return (res.body.events as unknown[]).length;
};

async function submit(id: string): Promise<void> {
  const res = await http.post(`/api/reports/${id}/transition`).set(as(H)).send({ to: 'submitted' });
  expect(res.status).toBe(200);
}

describe('PATCH /api/reports/:id', () => {
  it('owner edits a draft: fields and updatedAt change, createdAt does not, no audit event', async () => {
    await setNow('2026-01-01T00:00:00Z');
    const id = await create();
    const before = await auditCount(id);
    await setNow('2026-01-02T00:00:00Z');
    const res = await patch(H, id, { title: ' New ', amountCents: 999 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
    expect(res.body.amountCents).toBe(999);
    expect(res.body.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(res.body.updatedAt).toBe('2026-01-02T00:00:00Z');
    expect(await auditCount(id)).toBe(before);
    const got = await http.get(`/api/reports/${id}`).set(as(H));
    expect(got.body).toEqual(res.body);
  });

  it('a single field leaves the other untouched', async () => {
    const id = await create();
    const res = await patch(H, id, { amountCents: 5 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Taxi');
    expect(res.body.amountCents).toBe(5);
  });

  it('rejects an empty body, currency, state and other keys with 400', async () => {
    const id = await create();
    const empty = await patch(H, id, {});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');
    expect(empty.body.errors[0].field).toBe('body');
    const cur = await patch(H, id, { currency: 'EUR' });
    expect(cur.status).toBe(400);
    expect(cur.body.errors[0].field).toBe('currency');
    const st = await patch(H, id, { state: 'paid' });
    expect(st.status).toBe(400);
    expect(st.body.errors[0].field).toBe('state');
    const bad = await patch(H, id, { title: '  ', amountCents: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { field: string }) => e.field)).toEqual(['title', 'amountCents']);
  });

  it('validation (400) comes before 404', async () => {
    const res = await patch(H, '00000000-0000-4000-8000-000000000000', {});
    expect(res.status).toBe(400);
  });

  it('admin and manager on a draft they can see or not', async () => {
    const id = await create();
    const admin = await patch(A, id, { title: 'X' });
    expect(admin.status).toBe(403);
    expect(admin.body.code).toBe('FORBIDDEN');
    const mgr = await patch(M, id, { title: 'X' });
    expect(mgr.status).toBe(404);
  });

  it('owner id with a non-employee role is 403', async () => {
    const id = await create();
    const res = await patch({ id: H.id, role: 'manager' }, id, { title: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('manager on a submitted report is 403; owner on it is 409', async () => {
    const id = await create();
    await submit(id);
    const mgr = await patch(M, id, { title: 'X' });
    expect(mgr.status).toBe(403);
    const own = await patch(H, id, { title: 'X' });
    expect(own.status).toBe(409);
    expect(own.body.code).toBe('REPORT_NOT_EDITABLE');
  });

  it("another employee's report is 404", async () => {
    const id = await create();
    const res = await patch(G, id, { title: 'X' });
    expect(res.status).toBe(404);
  });
});
