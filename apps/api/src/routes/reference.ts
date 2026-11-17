import type { FastifyInstance } from 'fastify';
import { CURRENCIES, DEFAULT_CURRENCY } from '@app/shared';
import { noQuery } from '../http/hooks';

/** specs/http-api.md §3. No identity headers; no query parameters (§1). */
export function referenceRoutes(app: FastifyInstance): void {
  app.get('/api/users', { preValidation: noQuery }, async () => ({ users: app.deps.store.listUsers() }));

  app.get('/api/currencies', { preValidation: noQuery }, async () => ({
    currencies: [...CURRENCIES],
    default: DEFAULT_CURRENCY,
  }));
}
