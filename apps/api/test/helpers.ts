import type { FastifyInstance } from 'fastify';
import supertest from 'supertest';
import type { Role } from '@app/shared';
import { buildApp, type AppDeps } from '../src/app';

export async function makeApp(): Promise<{ app: FastifyInstance; http: supertest.Agent; deps: AppDeps }> {
  const app = buildApp({ dbPath: ':memory:' });
  await app.ready();
  return { app, http: supertest(app.server), deps: app.deps };
}

export const as = (u: { id: string; role: Role }): Record<string, string> => ({
  'X-User-Id': u.id,
  'X-User-Role': u.role,
});
