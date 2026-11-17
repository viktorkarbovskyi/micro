import type { FastifyInstance } from 'fastify';
import { validationError } from '../errors';
import { jsonBody, noQuery } from '../http/hooks';
import { parseInstant } from '../time';

/** Validates the exact body `{ now }` and freezes the clock; returns the frozen ISO value. */
function freezeFromBody(app: FastifyInstance, body: unknown): string {
  const fields = body as Record<string, unknown>;
  const extra = Object.keys(fields).find((key) => key !== 'now');
  if (extra !== undefined) {
    throw validationError('body', [
      { field: extra, message: 'Unknown field' },
    ]);
  }
  if (!('now' in fields)) {
    throw validationError('body', [
      { field: 'now', message: 'now is required' },
    ]);
  }
  if (parseInstant(fields.now, { allowNumber: true }) === null) {
    throw validationError('body', [
      { field: 'now', message: 'now must be an ISO 8601 date-time string or epoch milliseconds' },
    ]);
  }
  return app.deps.clock.freeze(fields.now as string | number).iso;
}

/** specs/http-api.md §4.2–§4.3. No identity headers. */
export function testRoutes(app: FastifyInstance): void {
  app.post('/api/test/reset', { preValidation: [jsonBody, noQuery] }, async (request) => {
    const fields = request.body as Record<string, unknown>;
    // Validate first so a bad request leaves data and clock untouched.
    const now = freezeFromBody(app, fields);
    app.deps.store.wipe();
    return { now };
  });

  app.post('/api/test/set-now', { preValidation: [jsonBody, noQuery] }, async (request) => ({
    now: freezeFromBody(app, request.body),
  }));
}
