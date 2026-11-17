import type { FastifyInstance } from 'fastify';
import type supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@app/shared';
import type { AppDeps } from '../src/app';
import { as, makeApp } from './helpers';

const [H, G, M, F, A] = DEMO_USERS as [
  (typeof DEMO_USERS)[number],
  (typeof DEMO_USERS)[number],
  (typeof DEMO_USERS)[number],
  (typeof DEMO_USERS)[number],
  (typeof DEMO_USERS)[number],
];
const REPORT_FIELDS = ['amountCents', 'createdAt', 'currency', 'id', 'ownerId', 'state', 'title', 'updatedAt'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let app: FastifyInstance;
let http: supertest.Agent;
let deps: AppDeps;

beforeEach(async () => {
  ({ app, http, deps } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

const create = (actor: { id: string; role: (typeof DEMO_USERS)[number]['role'] }, body: unknown) =>
  http.post('/api/reports').set(as(actor)).send(body as object);

async function createAsHarry(body: object = { title: 'Taxi', amountCents: 2350 }): Promise<string> {
  const res = await create(H, body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function expectProblem(res: supertest.Response, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(res.body).toMatchObject({ type: 'about:blank', status, code });
  if (code !== 'VALIDATION_ERROR') expect(res.body).not.toHaveProperty('errors');
}

function expectValidation(res: supertest.Response, field: string): void {
  expectProblem(res, 400, 'VALIDATION_ERROR');
  expect(res.body.errors).toEqual(expect.arrayContaining([{ field, message: expect.any(String) }]));
}

describe('POST /api/reports', () => {
  it('creates a draft for the employee with a trimmed title and the default currency', async () => {
    const res = await create(H, { title: '  Taxi  ', amountCents: 2350 });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(REPORT_FIELDS);
    expect(res.body).toMatchObject({
      title: 'Taxi',
      amountCents: 2350,
      currency: 'USD',
      state: 'draft',
      ownerId: H.id,
    });
    expect(res.body.id).toMatch(UUID);
    expect(res.headers['location']).toBe(`/api/reports/${res.body.id}`);
  });

  it('stamps createdAt and updatedAt from the frozen clock', async () => {
    await http.post('/api/test/set-now').send({ now: '2026-01-01T00:00:00Z' }).expect(200);
    const res = await create(H, { title: 'Taxi', amountCents: 2350 });
    expect(res.status).toBe(201);
    expect(res.body.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(res.body.updatedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('writes the creation audit event with the same timestamp and no note', async () => {
    await http.post('/api/test/set-now').send({ now: '2026-01-01T00:00:00Z' }).expect(200);
    const id = await createAsHarry();
    const res = await http.get(`/api/reports/${id}/audit`).set(as(H));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      events: [
        {
          id: expect.stringMatching(UUID),
          reportId: id,
          from: null,
          to: 'draft',
          actorId: H.id,
          role: 'employee',
          at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    expect(res.body.events[0]).not.toHaveProperty('note');
  });

  it('uses real time with milliseconds when the clock is not frozen', async () => {
    const res = await create(H, { title: 'Taxi', amountCents: 2350 });
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(res.body.updatedAt).toBe(res.body.createdAt);
  });

  it('assigns a distinct id to each report', async () => {
    const a = await createAsHarry();
    const b = await createAsHarry();
    expect(a).not.toBe(b);
  });

  describe('validation', () => {
    it.each([
      ['a numeric string', '2350'],
      ['a fraction', 23.5],
      ['zero', 0],
      ['a negative', -1],
      ['2^53 (unsafe)', 2 ** 53],
      ['null', null],
      ['a boolean', true],
    ])('amountCents as %s -> 400', async (_name, amountCents) => {
      expectValidation(await create(H, { title: 'Taxi', amountCents }), 'amountCents');
    });

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['201 chars', 'x'.repeat(201)],
      ['201 chars after trimming', ` ${'x'.repeat(201)} `],
      ['a number', 5],
      ['null', null],
    ])('title %s -> 400', async (_name, title) => {
      expectValidation(await create(H, { title, amountCents: 2350 }), 'title');
    });

    it('missing title -> 400', async () => {
      expectValidation(await create(H, { amountCents: 2350 }), 'title');
    });

    it('missing amountCents -> 400', async () => {
      expectValidation(await create(H, { title: 'Taxi' }), 'amountCents');
    });

    it.each(['GBP', 'usd', '', null, 1])('currency %j -> 400', async (currency) => {
      expectValidation(await create(H, { title: 'Taxi', amountCents: 2350, currency }), 'currency');
    });

    it('extra field state -> 400 on that field', async () => {
      expectValidation(await create(H, { title: 'Taxi', amountCents: 2350, state: 'paid' }), 'state');
    });

    it('an own __proto__ key is an unknown field and is never applied', async () => {
      const res = await http
        .post('/api/reports')
        .set(as(H))
        .set('Content-Type', 'application/json')
        .send('{"title":"Taxi","amountCents":2350,"__proto__":{"state":"paid"}}');
      expectValidation(res, '__proto__');
    });

    it('reports one error per invalid field', async () => {
      const res = await create(H, { title: '', amountCents: 0, currency: 'GBP', extra: 1 });
      expectProblem(res, 400, 'VALIDATION_ERROR');
      expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(
        ['amountCents', 'currency', 'extra', 'title'],
      );
    });

    it('detail names each failing field and its message (errors[] unchanged)', async () => {
      const res = await create(H, { title: '', amountCents: 0, extra: 1 });
      expectProblem(res, 400, 'VALIDATION_ERROR');
      expect(res.body.errors).toEqual([
        { field: 'title', message: 'title must be 1–200 characters after trimming' },
        { field: 'amountCents', message: 'amountCents must be a positive safe integer' },
        { field: 'extra', message: 'Unknown field' },
      ]);
      expect(res.body.detail).toBe(
        'Request body is invalid: title must be 1–200 characters after trimming; ' +
          'amountCents must be a positive safe integer; extra: Unknown field',
      );
    });

    it('a failed create writes nothing', async () => {
      await create(H, { title: '', amountCents: 2350 });
      expect(deps.store.listReports()).toHaveLength(0);
    });
  });

  describe('boundaries that succeed', () => {
    it('title of exactly 200 chars', async () => {
      const res = await create(H, { title: 'x'.repeat(200), amountCents: 1 });
      expect(res.status).toBe(201);
      expect(res.body.title).toHaveLength(200);
    });

    it('title of 200 chars surrounded by spaces', async () => {
      const res = await create(H, { title: `  ${'x'.repeat(200)}  `, amountCents: 1 });
      expect(res.status).toBe(201);
    });

    it('amountCents = Number.MAX_SAFE_INTEGER', async () => {
      const res = await create(H, { title: 'Yacht', amountCents: Number.MAX_SAFE_INTEGER });
      expect(res.status).toBe(201);
      expect(res.body.amountCents).toBe(Number.MAX_SAFE_INTEGER);
    });

    it.each(['EUR', 'UAH', 'USD'])('currency %s', async (currency) => {
      const res = await create(H, { title: 'Taxi', amountCents: 2350, currency });
      expect(res.status).toBe(201);
      expect(res.body.currency).toBe(currency);
    });
  });

  describe('permission', () => {
    it.each([
      ['manager', M],
      ['finance', F],
      ['admin', A],
    ])('%s with a valid body -> 403 FORBIDDEN, nothing written', async (_name, actor) => {
      expectProblem(await create(actor, { title: 'Taxi', amountCents: 2350 }), 403, 'FORBIDDEN');
      expect(deps.store.listReports()).toHaveLength(0);
    });

    it('manager with an invalid body -> 400 (validation before permission)', async () => {
      expectValidation(await create(M, { title: '', amountCents: 2350 }), 'title');
    });
  });
});

describe('GET /api/reports/:id', () => {
  it('owner -> 200 with the report', async () => {
    const created = await create(H, { title: 'Taxi', amountCents: 2350, currency: 'EUR' });
    const res = await http.get(`/api/reports/${created.body.id}`).set(as(H));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
    expect(Object.keys(res.body).sort()).toEqual(REPORT_FIELDS);
  });

  it('another employee -> 404', async () => {
    const id = await createAsHarry();
    expectProblem(await http.get(`/api/reports/${id}`).set(as(G)), 404, 'NOT_FOUND');
  });

  it('manager or finance on a draft -> 404', async () => {
    const id = await createAsHarry();
    expectProblem(await http.get(`/api/reports/${id}`).set(as(M)), 404, 'NOT_FOUND');
    expectProblem(await http.get(`/api/reports/${id}`).set(as(F)), 404, 'NOT_FOUND');
  });

  it('manager and finance on a submitted report -> 200', async () => {
    const id = await createAsHarry();
    deps.store.updateReport(id, { state: 'submitted' });
    expect((await http.get(`/api/reports/${id}`).set(as(M))).status).toBe(200);
    expect((await http.get(`/api/reports/${id}`).set(as(F))).status).toBe(200);
  });

  it('admin on a draft -> 200', async () => {
    const id = await createAsHarry();
    const res = await http.get(`/api/reports/${id}`).set(as(A));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('the owner id acting in another role still sees the report', async () => {
    const id = await createAsHarry();
    expect((await http.get(`/api/reports/${id}`).set(as({ id: H.id, role: 'manager' }))).status).toBe(200);
  });

  it.each([
    ['not-a-uuid', 'not-a-uuid'],
    ['a 101-char id', 'a'.repeat(101)],
    ['a random UUID', '5f0c3a8e-1b2d-4c3e-8f9a-0b1c2d3e4f50'],
    ['a UUID with a trailing character', '5f0c3a8e-1b2d-4c3e-8f9a-0b1c2d3e4f50x'],
  ])('%s -> 404 NOT_FOUND', async (_name, id) => {
    expectProblem(await http.get(`/api/reports/${id}`).set(as(A)), 404, 'NOT_FOUND');
  });

  it('a malformed id without identity headers -> 400 INVALID_HEADERS (headers first)', async () => {
    expectProblem(await http.get('/api/reports/not-a-uuid'), 400, 'INVALID_HEADERS');
  });
});

describe('GET /api/reports/:id/audit', () => {
  it('another employee -> 404', async () => {
    const id = await createAsHarry();
    expectProblem(await http.get(`/api/reports/${id}/audit`).set(as(G)), 404, 'NOT_FOUND');
  });

  it('manager on a draft -> 404; admin on a draft -> 200', async () => {
    const id = await createAsHarry();
    expectProblem(await http.get(`/api/reports/${id}/audit`).set(as(M)), 404, 'NOT_FOUND');
    const res = await http.get(`/api/reports/${id}/audit`).set(as(A));
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });

  it.each([
    ['not-a-uuid', 'not-a-uuid'],
    ['a 101-char id', 'a'.repeat(101)],
    ['a random UUID', '5f0c3a8e-1b2d-4c3e-8f9a-0b1c2d3e4f50'],
  ])('%s -> 404 NOT_FOUND', async (_name, id) => {
    expectProblem(await http.get(`/api/reports/${id}/audit`).set(as(A)), 404, 'NOT_FOUND');
  });

  it('events are only those of the requested report', async () => {
    const a = await createAsHarry();
    await createAsHarry();
    const res = await http.get(`/api/reports/${a}/audit`).set(as(H));
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].reportId).toBe(a);
  });
});

describe('unknown query parameters on report routes', () => {
  it('GET /api/reports/:id?x=1 -> 400 on x', async () => {
    const id = await createAsHarry();
    const res = await http.get(`/api/reports/${id}?x=1`).set(as(H));
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body.errors).toEqual([{ field: 'x', message: expect.any(String) }]);
  });

  it('validation precedes visibility: a malformed id with a query param -> 400', async () => {
    expectValidation(await http.get('/api/reports/not-a-uuid?x=1').set(as(H)), 'x');
  });

  it('GET audit?x=1 -> 400', async () => {
    const id = await createAsHarry();
    expectValidation(await http.get(`/api/reports/${id}/audit?x=1`).set(as(H)), 'x');
  });

  it('POST /api/reports?x=1 with a valid body -> 400, nothing created', async () => {
    const res = await http.post('/api/reports?x=1').set(as(H)).send({ title: 'Taxi', amountCents: 2350 });
    expectValidation(res, 'x');
    expect(deps.store.listReports()).toHaveLength(0);
  });

  it('a parameter without a value (?x) is rejected too', async () => {
    const id = await createAsHarry();
    expectValidation(await http.get(`/api/reports/${id}?x`).set(as(H)), 'x');
  });

  it('a bare "?" is not a parameter', async () => {
    const id = await createAsHarry();
    expect((await http.get(`/api/reports/${id}?`).set(as(H))).status).toBe(200);
  });

  it('headers and content type are checked before the query', async () => {
    expectProblem(await http.get('/api/reports/not-a-uuid?x=1'), 400, 'INVALID_HEADERS');
    const res = await http.post('/api/reports?x=1').set(as(H)).set('Content-Type', 'text/plain').send('x');
    expectProblem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('PATCH and transition reject query params as well', async () => {
    const id = await createAsHarry();
    expectValidation(await http.patch(`/api/reports/${id}?x=1`).set(as(H)).send({ title: 'Bus' }), 'x');
    expectValidation(
      await http.post(`/api/reports/${id}/transition?x=1`).set(as(H)).send({ to: 'submitted' }),
      'x',
    );
  });
});
