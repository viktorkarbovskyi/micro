import type { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@app/shared';
import { buildApp } from '../src/app';
import { ApiError, outcomeError } from '../src/errors';
import { jsonBody, requireActor } from '../src/http/hooks';
import { as, makeApp } from './helpers';

const EMPLOYEE = DEMO_USERS[0]!;
const ID = '6c1e2f0a-0000-4000-8000-000000000001';

let app: FastifyInstance;
let http: supertest.Agent;

beforeEach(async () => {
  ({ app, http } = await makeApp());
});
afterEach(async () => {
  await app.close();
});

function expectProblem(res: supertest.Response, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(res.body).toMatchObject({ type: 'about:blank', status, code });
  expect(typeof res.body.title).toBe('string');
  expect(typeof res.body.detail).toBe('string');
  if (code !== 'VALIDATION_ERROR') expect(res.body).not.toHaveProperty('errors');
}

describe('reference endpoints', () => {
  it('GET /api/users returns the demo users without identity headers', async () => {
    const res = await http.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ users: DEMO_USERS.map(({ id, name, role }) => ({ id, name, role })) });
  });

  it('GET /api/currencies returns the supported currencies and the default', async () => {
    const res = await http.get('/api/currencies');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currencies: ['USD', 'EUR', 'UAH'], default: 'USD' });
  });

  it('ignores invalid identity headers', async () => {
    const bad = { 'X-User-Id': '   ', 'X-User-Role': 'Boss' };
    expect((await http.get('/api/users').set(bad)).status).toBe(200);
    expect((await http.get('/api/currencies').set(bad)).status).toBe(200);
  });
});

describe('route and method (step 1)', () => {
  it('unknown route -> 404 problem', async () => {
    const res = await http.get('/api/nope');
    expectProblem(res, 404, 'NOT_FOUND');
    expect(res.body.title).toBe('Not Found');
  });

  it('unknown route with a body and no headers -> still 404', async () => {
    const res = await http.post('/api/nope').set('Content-Type', 'text/plain').send('x');
    expectProblem(res, 404, 'NOT_FOUND');
  });

  it('DELETE /api/reports -> 405 with Allow listing GET and POST', async () => {
    const res = await http.delete('/api/reports');
    expectProblem(res, 405, 'METHOD_NOT_ALLOWED');
    expect(res.body.title).toBe('Method Not Allowed');
    const allow = String(res.headers['allow']).split(/,\s*/);
    expect(allow).toEqual(expect.arrayContaining(['GET', 'POST']));
    expect(allow).not.toContain('DELETE');
  });

  it('405 on a parameterised path lists its methods', async () => {
    const res = await http.put(`/api/reports/${ID}`).set(as(EMPLOYEE));
    expectProblem(res, 405, 'METHOD_NOT_ALLOWED');
    const allow = String(res.headers['allow']).split(/,\s*/);
    expect(allow).toEqual(expect.arrayContaining(['GET', 'PATCH']));
    expect(allow).not.toContain('POST');
  });

  it('GET on the transition path -> 405 with Allow POST', async () => {
    const res = await http.get(`/api/reports/${ID}/transition`);
    expectProblem(res, 405, 'METHOD_NOT_ALLOWED');
    expect(String(res.headers['allow']).split(/,\s*/)).toEqual(['POST']);
  });

  it('extra path segment -> 404, not 405', async () => {
    expectProblem(await http.get(`/api/reports/${ID}/audit/x`), 404, 'NOT_FOUND');
  });
});

describe('framework URL errors', () => {
  const LONG_ID = 'a'.repeat(101);
  const BAD_URL = '/api/reports/%E0%A4%A';

  it('101-char report id with valid headers reaches the route: 404 at visibility (not 414)', async () => {
    for (const path of [`/api/reports/${LONG_ID}`, `/api/reports/${LONG_ID}/audit`]) {
      expectProblem(await http.get(path).set(as(EMPLOYEE)), 404, 'NOT_FOUND');
    }
  });

  it('101-char report id without headers -> 400 INVALID_HEADERS', async () => {
    expectProblem(await http.get(`/api/reports/${LONG_ID}`), 400, 'INVALID_HEADERS');
  });

  it('report id over maxParamLength -> problem, headers checked first', async () => {
    const path = `/api/reports/${'a'.repeat(1001)}`;
    expectProblem(await http.get(path), 400, 'INVALID_HEADERS');
    expectProblem(await http.get(path).set(as(EMPLOYEE)), 404, 'NOT_FOUND');
  });

  it('bad percent-encoding under /api/reports without headers -> 400 INVALID_HEADERS', async () => {
    expectProblem(await http.get(BAD_URL), 400, 'INVALID_HEADERS');
  });

  it('bad percent-encoding under /api/reports with valid headers -> 404 NOT_FOUND', async () => {
    expectProblem(await http.get(BAD_URL).set(as(EMPLOYEE)), 404, 'NOT_FOUND');
    expectProblem(await http.get(`${BAD_URL}/audit`).set(as(EMPLOYEE)), 404, 'NOT_FOUND');
  });

  it('bad percent-encoding elsewhere -> 404 NOT_FOUND without a header check', async () => {
    expectProblem(await http.get('/api/users/%E0%A4%A'), 404, 'NOT_FOUND');
  });
});

describe('identity headers (step 2)', () => {
  it('POST /api/reports without identity headers -> 400 INVALID_HEADERS', async () => {
    const res = await http.post('/api/reports').set('Content-Type', 'application/json').send('{"title":"x"}');
    expectProblem(res, 400, 'INVALID_HEADERS');
    expect(res.body.title).toBe('Bad Request');
  });

  it.each([
    ['role with wrong case', { 'X-User-Id': EMPLOYEE.id, 'X-User-Role': 'Manager' }],
    ['unknown role', { 'X-User-Id': EMPLOYEE.id, 'X-User-Role': 'boss' }],
    ['missing role', { 'X-User-Id': EMPLOYEE.id }],
    ['missing id', { 'X-User-Role': 'employee' }],
    ['id of 101 chars', { 'X-User-Id': 'a'.repeat(101), 'X-User-Role': 'employee' }],
    ['blank id', { 'X-User-Id': '   ', 'X-User-Role': 'employee' }],
  ])('%s -> 400 INVALID_HEADERS', async (_name, headers) => {
    const res = await http.post('/api/reports').set(headers).set('Content-Type', 'application/json').send('{}');
    expectProblem(res, 400, 'INVALID_HEADERS');
  });

  it('id of 100 chars after trimming is accepted', async () => {
    const res = await http
      .post('/api/reports')
      .set({ 'X-User-Id': `  ${'a'.repeat(100)}  `, 'X-User-Role': 'employee' })
      .set('Content-Type', 'application/json')
      .send('{"title":"Taxi","amountCents":2350}');
    expect(res.status).toBe(201);
    expect(res.body.ownerId).toBe('a'.repeat(100));
  });

  it('headers are checked before content type: no headers, no Content-Type -> INVALID_HEADERS', async () => {
    expectProblem(await http.post('/api/reports'), 400, 'INVALID_HEADERS');
  });

  it('headers are checked before content type: no headers, text/plain body -> INVALID_HEADERS', async () => {
    const res = await http.post('/api/reports').set('Content-Type', 'text/plain').send('hello');
    expectProblem(res, 400, 'INVALID_HEADERS');
  });

  it.each([
    ['GET', '/api/reports'],
    ['GET', `/api/reports/${ID}`],
    ['GET', `/api/reports/${ID}/audit`],
    ['PATCH', `/api/reports/${ID}`],
    ['POST', `/api/reports/${ID}/transition`],
  ])('%s %s requires identity headers', async (method, path) => {
    const res = await http[method.toLowerCase() as 'get'](path);
    expectProblem(res, 400, 'INVALID_HEADERS');
  });
});

describe('content type and JSON (step 3)', () => {
  const post = () => http.post('/api/reports').set(as(EMPLOYEE));

  it('text/plain -> 415', async () => {
    const res = await post().set('Content-Type', 'text/plain').send('{"title":"x"}');
    expectProblem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    expect(res.body.title).toBe('Unsupported Media Type');
  });

  it('body without Content-Type -> 415', async () => {
    // inject sends a string payload without adding a Content-Type header.
    const res = await app.inject({ method: 'POST', url: '/api/reports', headers: as(EMPLOYEE), payload: '{"title":"x"}' });
    expect(res.statusCode).toBe(415);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('no body and no Content-Type -> 415', async () => {
    expectProblem(await post(), 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('application/json-like but different media type -> 415', async () => {
    const res = await post().set('Content-Type', 'application/json-patch+json').send('{"title":"x"}');
    expectProblem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('unparseable JSON -> 400 INVALID_JSON', async () => {
    const res = await post().set('Content-Type', 'application/json').send('{bad');
    expectProblem(res, 400, 'INVALID_JSON');
  });

  it('empty body with application/json -> 400 INVALID_JSON', async () => {
    const res = await post().set('Content-Type', 'application/json').send('');
    expectProblem(res, 400, 'INVALID_JSON');
  });

  it.each(['[]', '"x"', '1', 'null', 'true'])('JSON %s that is not an object -> 400 VALIDATION_ERROR', async (body) => {
    const res = await post().set('Content-Type', 'application/json').send(body);
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body.errors).toEqual([{ field: 'body', message: 'Body must be a JSON object' }]);
    expect(res.body.detail).toBe('Request body is invalid: body: Body must be a JSON object');
  });

  it('media type is case-insensitive and parameters are ignored', async () => {
    const res = await post().set('Content-Type', 'Application/JSON; charset=utf-8').send('{"title":"x","amountCents":1}');
    expect(res.status).toBe(201);
  });

  it('PATCH and transition expect a JSON body', async () => {
    expectProblem(
      await http.patch(`/api/reports/${ID}`).set(as(EMPLOYEE)).set('Content-Type', 'text/plain').send('x'),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
    expectProblem(
      await http.post(`/api/reports/${ID}/transition`).set(as(EMPLOYEE)).send(''),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });

  it('GET endpoints do not check the content type', async () => {
    const res = await http.get('/api/reports').set(as(EMPLOYEE)).set('Content-Type', 'text/plain');
    expect(res.status).not.toBe(415);
  });

  it('malformed Content-Type rejected by Fastify -> 415 problem', async () => {
    const res = await post().set('Content-Type', 'not a media type').send('{}');
    expectProblem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('body over the size limit -> 413 problem', async () => {
    // inject, not a socket: the server answers 413 before the client finishes writing, which can
    // surface as ECONNRESET over a real connection.
    const res = await app.inject({
      method: 'POST',
      url: '/api/reports',
      headers: { ...as(EMPLOYEE), 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.json()).toMatchObject({ type: 'about:blank', status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });
});

describe('error handling', () => {
  let custom: FastifyInstance;
  afterEach(async () => {
    await custom.close();
  });

  async function customApp(): Promise<supertest.Agent> {
    custom = buildApp({ dbPath: ':memory:' });
    custom.log.level = 'silent';
    custom.get('/api/whoami', { onRequest: requireActor }, async (request) => request.actor);
    custom.post('/api/echo', { onRequest: requireActor, preValidation: jsonBody }, async (request) => request.body);
    custom.get('/api/api-error', async () => {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request is invalid', [{ field: 'title', message: 'Required' }]);
    });
    custom.get('/api/boom', async () => {
      throw new Error('secret internals');
    });
    await custom.ready();
    return supertest(custom.server);
  }

  it('requireActor sets a trimmed actor', async () => {
    const h = await customApp();
    const res = await h.get('/api/whoami').set({ 'X-User-Id': '  u-1  ', 'X-User-Role': 'finance' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u-1', role: 'finance' });
  });

  it('jsonBody hands the parsed object to the handler', async () => {
    const h = await customApp();
    const res = await h.post('/api/echo').set(as(EMPLOYEE)).set('Content-Type', 'application/json').send('{"a":[1]}');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: [1] });
  });

  it('ApiError with field errors -> problem with errors', async () => {
    const h = await customApp();
    const res = await h.get('/api/api-error');
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Request is invalid',
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'title', message: 'Required' }],
    });
  });

  it('unexpected error -> 500 INTERNAL_ERROR without leaking the message', async () => {
    const h = await customApp();
    const res = await h.get('/api/boom');
    expectProblem(res, 500, 'INTERNAL_ERROR');
    expect(res.body.title).toBe('Internal Server Error');
    expect(res.body.detail).not.toContain('secret');
  });
});

describe('unknown query parameters', () => {
  it.each(['/api/users', '/api/currencies'])('GET %s?x=1 -> 400 VALIDATION_ERROR on x', async (path) => {
    const res = await http.get(`${path}?x=1`);
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body.errors).toEqual([{ field: 'x', message: expect.any(String) }]);
  });

  it('each unknown parameter is reported', async () => {
    const res = await http.get('/api/users?a=1&b=2');
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(['a', 'b']);
    expect(res.body.detail).toBe('Request query is invalid: a: Unknown query parameter; b: Unknown query parameter');
  });

  it.each(['/api/test/reset', '/api/test/set-now'])('POST %s?x=1 -> 400, clock untouched', async (path) => {
    const { clock } = app.deps;
    const before = clock.now().iso;
    const res = await http.post(`${path}?x=1`).send({ now: '2020-01-01T00:00:00Z' });
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body.errors).toEqual([{ field: 'x', message: expect.any(String) }]);
    expect(clock.now().iso).not.toBe('2020-01-01T00:00:00Z');
    expect(before).not.toBe('2020-01-01T00:00:00Z');
  });

  it('test endpoints check the content type before the query', async () => {
    const res = await http.post('/api/test/set-now?x=1').set('Content-Type', 'text/plain').send('x');
    expectProblem(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('a bare "?" is accepted', async () => {
    expect((await http.get('/api/users?')).status).toBe(200);
  });
});

describe('outcomeError', () => {
  it('maps NOT_VISIBLE to 404 NOT_FOUND', () => {
    expect(outcomeError('NOT_VISIBLE', {})).toMatchObject({ status: 404, code: 'NOT_FOUND', detail: 'Report not found' });
  });

  it('maps FORBIDDEN to 403 FORBIDDEN', () => {
    expect(outcomeError('FORBIDDEN', {})).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('maps NOT_EDITABLE to 409 REPORT_NOT_EDITABLE with the state', () => {
    expect(outcomeError('NOT_EDITABLE', { state: 'submitted' })).toMatchObject({
      status: 409,
      code: 'REPORT_NOT_EDITABLE',
      detail: 'Only draft reports can be edited (current state: submitted)',
    });
  });

  it('maps ILLEGAL_TRANSITION to 409 with from and to', () => {
    const err = outcomeError('ILLEGAL_TRANSITION', { from: 'paid', to: 'finance_approved' });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: 'ILLEGAL_TRANSITION',
      detail: 'Cannot transition from paid to finance_approved',
    });
  });
});
