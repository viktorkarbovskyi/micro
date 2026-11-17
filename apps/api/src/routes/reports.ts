import type { FastifyInstance } from 'fastify';
import { jsonBody, noQuery, requireActor } from '../http/hooks';
import { createReportService } from '../service';
import { validateCreate, validateListQuery, validatePatch, validateTransition, valueOrThrow } from '../validate';

type IdParams = { Params: { id: string } };

/**
 * specs/http-api.md §2. Hooks cover check order steps 2–3 and the query part of step 4; handlers
 * validate the body (rest of step 4) and hand over to the service (steps 5–7).
 */
export function reportRoutes(app: FastifyInstance): void {
  const service = createReportService(app.deps);

  const withActor = { onRequest: requireActor, preValidation: noQuery };
  const withActorAndBody = { onRequest: requireActor, preValidation: [jsonBody, noQuery] };

  app.post('/api/reports', withActorAndBody, async (request, reply) => {
    const input = valueOrThrow(validateCreate(request.body as object));
    const report = service.create(request.actor, input);
    reply.code(201).header('Location', `/api/reports/${report.id}`);
    return report;
  });

  // The list route takes query parameters, so it has no `noQuery` hook.
  app.get('/api/reports', { onRequest: requireActor }, async (request) => {
    const filter = valueOrThrow(validateListQuery(request.query as Record<string, string | string[]>), 'query');
    return { reports: service.list(request.actor, filter) };
  });

  app.get<IdParams>('/api/reports/:id', withActor, async (request) =>
    service.get(request.actor, request.params.id),
  );

  app.patch<IdParams>('/api/reports/:id', withActorAndBody, async (request) => {
    const input = valueOrThrow(validatePatch(request.body as object));
    return service.edit(request.actor, request.params.id, input);
  });

  app.post<IdParams>('/api/reports/:id/transition', withActorAndBody, async (request) => {
    const input = valueOrThrow(validateTransition(request.body as object));
    return service.transition(request.actor, request.params.id, input);
  });

  app.get<IdParams>('/api/reports/:id/audit', withActor, async (request) => ({
    events: service.audit(request.actor, request.params.id),
  }));
}
