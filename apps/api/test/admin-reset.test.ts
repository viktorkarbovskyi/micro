import { describe, expect, it } from 'vitest';
import { as, makeApp } from './helpers';

const ADMIN = { id: 'adm-1', role: 'admin' } as const;
const MANAGER = { id: 'mgr-1', role: 'manager' } as const;
const EMPLOYEE = { id: 'emp-1', role: 'employee' } as const;

const expectProblem = (res: { status: number; body: { code?: string }; headers: Record<string, string> }, status: number, code: string) => {
  expect(res.status).toBe(status);
  expect(res.body.code).toBe(code);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
};

describe('POST /api/admin/reset', () => {
  it('admin -> 204 with no body; reports are gone, demo users are kept', async () => {
    const { http } = await makeApp();
    const created = await http.post('/api/reports').set(as(EMPLOYEE)).send({ title: 'Taxi', amountCents: 2350 });
    expect(created.status).toBe(201);

    const res = await http.post('/api/admin/reset').set(as(ADMIN));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    const list = await http.get('/api/reports').set(as(ADMIN));
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ reports: [] });
    const audit = await http.get(`/api/reports/${created.body.id}/audit`).set(as(ADMIN));
    expect(audit.status).toBe(404);
    const users = await http.get('/api/users');
    expect(users.status).toBe(200);
    expect(users.body.users).toHaveLength(5);
  });

  it('returns the clock to real time', async () => {
    const { http } = await makeApp();
    const frozen = await http.post('/api/test/set-now').send({ now: '2020-01-01T00:00:00Z' });
    expect(frozen.status).toBe(200);

    const reset = await http.post('/api/admin/reset').set(as(ADMIN));
    expect(reset.status).toBe(204);

    const created = await http.post('/api/reports').set(as(EMPLOYEE)).send({ title: 'Taxi', amountCents: 2350 });
    expect(created.status).toBe(201);
    expect(created.body.createdAt).not.toBe('2020-01-01T00:00:00Z');
    expect(created.body.createdAt).toMatch(/Z$/);
  });

  it('non-admin -> 403 FORBIDDEN and nothing is wiped', async () => {
    const { http } = await makeApp();
    const created = await http.post('/api/reports').set(as(EMPLOYEE)).send({ title: 'Taxi', amountCents: 2350 });
    expect(created.status).toBe(201);

    for (const actor of [MANAGER, EMPLOYEE, { id: 'fin-1', role: 'finance' } as const]) {
      const res = await http.post('/api/admin/reset').set(as(actor));
      expectProblem(res, 403, 'FORBIDDEN');
    }
    const read = await http.get(`/api/reports/${created.body.id}`).set(as(EMPLOYEE));
    expect(read.status).toBe(200);
  });

  it('no identity headers -> 400 INVALID_HEADERS', async () => {
    const { http } = await makeApp();
    const res = await http.post('/api/admin/reset');
    expectProblem(res, 400, 'INVALID_HEADERS');
  });

  it('ignores a text/plain body', async () => {
    const { http } = await makeApp();
    const res = await http.post('/api/admin/reset').set(as(ADMIN)).set('Content-Type', 'text/plain').send('garbage');
    expect(res.status).toBe(204);
  });

  it('ignores an invalid JSON body sent as application/json', async () => {
    const { http } = await makeApp();
    const res = await http
      .post('/api/admin/reset')
      .set(as(ADMIN))
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(204);
  });

  it('ignores a malformed Content-Type', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset',
      headers: { ...as(ADMIN), 'content-type': 'not a media type' },
      payload: 'garbage',
    });
    expect(res.statusCode).toBe(204);
  });

  it('ignores a body without Content-Type', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset',
      headers: as(ADMIN),
      payload: 'garbage',
    });
    expect(res.statusCode).toBe(204);
  });

  it('ignores a body over the size limit', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset',
      headers: { ...as(ADMIN), 'content-type': 'application/json' },
      payload: 'x'.repeat(2 * 1024 * 1024),
    });
    expect(res.statusCode).toBe(204);
  });

  it('identity headers are checked before anything else, even with a malformed Content-Type', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/reset',
      headers: { 'content-type': 'not a media type' },
      payload: 'garbage',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_HEADERS');
  });

  it('rejects query parameters -> 400 VALIDATION_ERROR', async () => {
    const { http } = await makeApp();
    const res = await http.post('/api/admin/reset?x=1').set(as(ADMIN));
    expectProblem(res, 400, 'VALIDATION_ERROR');
    expect(res.body.errors).toEqual([{ field: 'x', message: 'Unknown query parameter' }]);
  });

  it('GET -> 405 with Allow: POST', async () => {
    const { http } = await makeApp();
    const res = await http.get('/api/admin/reset').set(as(ADMIN));
    expectProblem(res, 405, 'METHOD_NOT_ALLOWED');
    expect(res.headers.allow).toBe('POST');
  });
});
