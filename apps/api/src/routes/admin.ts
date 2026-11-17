import type { FastifyInstance } from 'fastify';
import { ApiError } from '../errors';
import { ignoreBody, noQuery, requireActor } from '../http/hooks';

/** specs/http-api.md §5. Identity headers required; any body and Content-Type are ignored. */
export function adminRoutes(app: FastifyInstance): void {
  app.post(
    '/api/admin/reset',
    { onRequest: requireActor, preParsing: ignoreBody, preValidation: noQuery },
    async (request, reply) => {
      if (request.actor.role !== 'admin') {
        throw new ApiError(403, 'FORBIDDEN', 'Only an admin can reset the data');
      }
      app.deps.store.wipe();
      app.deps.clock.unfreeze();
      return reply.code(204).send();
    },
  );
}
