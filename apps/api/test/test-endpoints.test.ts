import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

describe('test endpoints', () => {
  it('reset freezes the clock and echoes a string now unchanged', async () => {
    const { http, deps } = await makeApp();
    const res = await http.post('/api/test/reset').send({ now: '2026-01-01T00:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ now: '2026-01-01T00:00:00Z' });
    expect(deps.clock.now().iso).toBe('2026-01-01T00:00:00Z');
  });

  it('reset and set-now accept microsecond precision and lowercase t/z, echoing the string unchanged', async () => {
    const { http, deps } = await makeApp();
    const reset = await http.post('/api/test/reset').send({ now: '2026-03-01T10:00:00.123456Z' });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ now: '2026-03-01T10:00:00.123456Z' });
    expect(deps.clock.now()).toEqual({ iso: '2026-03-01T10:00:00.123456Z', ms: Date.UTC(2026, 2, 1, 10, 0, 0, 123) });
    const setNow = await http.post('/api/test/set-now').send({ now: '2026-03-01t10:00:00.123456+00:00' });
    expect(setNow.status).toBe(200);
    expect(setNow.body).toEqual({ now: '2026-03-01t10:00:00.123456+00:00' });
    const lowerZ = await http.post('/api/test/set-now').send({ now: '2026-03-01t10:00:00z' });
    expect(lowerZ.status).toBe(200);
    expect(lowerZ.body).toEqual({ now: '2026-03-01t10:00:00z' });
  });

  it('set-now accepts epoch milliseconds', async () => {
    const { http } = await makeApp();
    const res = await http.post('/api/test/set-now').send({ now: 1767225600000 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ now: '2026-01-01T00:00:00.000Z' });
  });

  for (const path of ['/api/test/reset', '/api/test/set-now']) {
    it(`${path} rejects invalid bodies`, async () => {
      const { http } = await makeApp();
      const banana = await http.post(path).send({ now: 'banana' });
      expect(banana.status).toBe(400);
      expect(banana.body.code).toBe('VALIDATION_ERROR');
      expect(banana.body.errors[0].field).toBe('now');
      expect(banana.body.detail).toBe(
        'Request body is invalid: now must be an ISO 8601 date-time string or epoch milliseconds',
      );
      const missing = await http.post(path).send({});
      expect(missing.status).toBe(400);
      expect(missing.body.errors[0].field).toBe('now');
      const extra = await http.post(path).send({ now: '2026-01-01T00:00:00Z', x: 1 });
      expect(extra.status).toBe(400);
      expect(extra.body.code).toBe('VALIDATION_ERROR');
      expect(extra.body.errors[0].field).toBe('x');
    });
  }

  it('reset deletes reports but keeps users', async () => {
    const { http, deps } = await makeApp();
    deps.store.insertReport({
      id: 'r1',
      ownerId: 'u1',
      title: 'Trip',
      amountCents: 100,
      currency: 'USD',
      state: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAtMs: 1767225600000,
    });
    expect(deps.store.listReports()).toHaveLength(1);
    await http.post('/api/test/reset').send({ now: '2026-01-01T00:00:00Z' }).expect(200);
    expect(deps.store.listReports()).toHaveLength(0);
    expect(deps.store.listUsers()).toHaveLength(5);
  });

  it('set-now leaves data untouched', async () => {
    const { http, deps } = await makeApp();
    deps.store.insertReport({
      id: 'r1',
      ownerId: 'u1',
      title: 'Trip',
      amountCents: 100,
      currency: 'USD',
      state: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAtMs: 1767225600000,
    });
    await http.post('/api/test/set-now').send({ now: 1767225600000 }).expect(200);
    expect(deps.store.listReports()).toHaveLength(1);
  });
});
