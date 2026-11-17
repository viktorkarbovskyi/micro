import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

const INDEX = '<!doctype html><title>SPA</title>';
const ASSET = 'console.log("app");';

describe('static web serving', () => {
  let dir: string;
  let app: FastifyInstance;
  let http: supertest.Agent;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), INDEX);
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), ASSET);
    app = buildApp({ dbPath: ':memory:', webDir: dir });
    await app.ready();
    http = supertest(app.server);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('/ -> index.html', async () => {
    const res = await http.get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.text).toBe(INDEX);
  });

  it('/assets/app.js -> the file', async () => {
    const res = await http.get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toBe(ASSET);
  });

  it('unknown non-API path -> index.html (SPA fallback)', async () => {
    const res = await http.get('/some/deep/path');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.text).toBe(INDEX);
  });

  it('unknown API path -> problem 404', async () => {
    const res = await http.get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('known API path, wrong method -> problem 405', async () => {
    const res = await http.get('/api/test/reset');
    expect(res.status).toBe(405);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.headers.allow).toBe('POST');
  });

  it('API routes still work', async () => {
    const res = await http.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(5);
  });

  for (const p of ['/api//reports', '/api/reports//x', '/api/%2e%2e/x', '/api//users']) {
    it(`non-canonical API path ${p} -> problem 404, not the static plugin's 403`, async () => {
      const res = await http.get(p).set({ 'X-User-Id': 'u1', 'X-User-Role': 'admin' });
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  }

  for (const p of ['/foo//bar', '/%2e%2e/x', '/assets//app.js']) {
    it(`non-canonical non-API path ${p} -> index.html (SPA fallback), not 403`, async () => {
      const res = await http.get(p);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/html/);
      expect(res.text).toBe(INDEX);
    });
  }

  it('non-GET outside /api -> problem 404', async () => {
    const res = await http.post('/some/deep/path');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  });
});

describe('static web serving disabled', () => {
  for (const [name, webDir] of [
    ['no webDir', undefined],
    ['missing webDir', path.join(os.tmpdir(), 'web-dist-does-not-exist-9f3c')],
  ] as const) {
    it(`${name}: non-API paths are problem 404`, async () => {
      const app = buildApp({ dbPath: ':memory:', ...(webDir ? { webDir } : {}) });
      await app.ready();
      const res = await supertest(app.server).get('/');
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      await app.close();
    });
  }
});
