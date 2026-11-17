import fs from 'node:fs';
import { STATUS_CODES } from 'node:http';
import type { Duplex } from 'node:stream';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import { createClock, type Clock } from './clock';
import { openDb } from './db';
import { ApiError, problemBody, sendProblem } from './errors';
import { actorFromHeaders } from './http/hooks';
import { createRoutesRegistry } from './http/routes-registry';
import { adminRoutes } from './routes/admin';
import { referenceRoutes } from './routes/reference';
import { reportRoutes } from './routes/reports';
import { testRoutes } from './routes/test';
import { createStore, type Store } from './store';

export interface AppDeps {
  store: Store;
  clock: Clock;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

/** Route modules in `src/routes`; each registers its routes on the root instance. */
const ROUTES: ((app: FastifyInstance) => void)[] = [referenceRoutes, reportRoutes, testRoutes, adminRoutes];

/** Paths whose endpoints all require identity headers (specs/http-api.md §1.1). */
const IDENTITY_PATH = /^\/api\/(reports|admin)(\/|\?|$)/;

/** The API namespace; everything else may be served by the web app. */
const API_PATH = /^\/api(\/|\?|$)/;

/**
 * Errors Fastify raises before routing (malformed percent-encoding, a path parameter over
 * `maxParamLength`). Such a URL can only name a non-existent resource, so the reply is the one a
 * routed request would get: identity headers first where the path requires them, then 404.
 */
function frameworkErrorProblem(error: FastifyError, request: FastifyRequest): ApiError {
  if (error.code !== 'FST_ERR_BAD_URL' && error.code !== 'FST_ERR_MAX_PARAM_LENGTH') {
    request.log.error({ err: error }, 'Unhandled framework error');
    return new ApiError(500, 'INTERNAL_ERROR', 'Internal server error');
  }
  if (IDENTITY_PATH.test(request.url)) {
    try {
      actorFromHeaders(request.headers);
    } catch (err) {
      if (err instanceof ApiError) return err;
      throw err;
    }
  }
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

/** Status Node's HTTP parser reports for a request it rejects; anything unlisted is a plain 400. */
const CLIENT_ERROR_STATUS: Record<string, number> = {
  ERR_HTTP_REQUEST_TIMEOUT: 408,
  HPE_HEADER_OVERFLOW: 431,
};

/**
 * Requests Node's HTTP parser rejects (malformed `Content-Length`, an invalid header name, ...)
 * never reach Fastify's error handling, so the problem response is written on the socket directly
 * (specs/http-api.md §1.4). A socket that is gone or reset is just destroyed.
 */
function clientErrorHandler(error: NodeJS.ErrnoException, socket: Duplex): void {
  if (error.code === 'ECONNRESET' || !socket.writable) {
    socket.destroy(error);
    return;
  }
  const status = CLIENT_ERROR_STATUS[error.code ?? ''] ?? 400;
  const title = STATUS_CODES[status] ?? 'Bad Request';
  const code = title.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const body = JSON.stringify(problemBody(new ApiError(status, code, 'The request could not be parsed')));
  socket.end(
    `HTTP/1.1 ${status} ${title}\r\n` +
      'Content-Type: application/problem+json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
}

/**
 * `webDir`: the built web app. When given and present, its files are served and any other GET
 * outside `/api` gets its `index.html` (client-side routing); otherwise nothing is served outside
 * the API.
 */
export function buildApp(opts: { dbPath: string; webDir?: string }): FastifyInstance {
  const app = Fastify({
    logger: { level: 'warn' },
    clientErrorHandler,
    routerOptions: {
      // Long enough that any id a client sends reaches the route (and the identity check);
      // longer ones fall to `frameworkErrors`.
      maxParamLength: 1000,
    },
    frameworkErrors: (error, request, reply) => sendProblem(reply, frameworkErrorProblem(error, request)),
  });

  const db = openDb(opts.dbPath);
  app.decorate('deps', { store: createStore(db), clock: createClock() } satisfies AppDeps);
  app.decorateRequest('actor', null as never);
  app.addHook('onClose', async () => {
    db.close();
  });

  // Bodies are read as raw strings for every media type; `jsonBody` checks the media type and
  // parses JSON per route, so the identity check (onRequest) always precedes body errors.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  const registry = createRoutesRegistry();
  app.addHook('onRoute', (route) => registry.add(route.method, route.url));

  const serveWeb =
    opts.webDir !== undefined && fs.statSync(opts.webDir, { throwIfNoEntry: false })?.isDirectory() === true;
  // A path with no matching file falls through to the not-found handler below; the registry
  // ignores the plugin's wildcard route, so 404/405 under /api are unchanged.
  if (serveWeb) app.register(fastifyStatic, { root: opts.webDir! });

  app.setNotFoundHandler((request, reply) => {
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    if (serveWeb && isRead && !API_PATH.test(request.url)) return reply.sendFile('index.html');
    const allowed = registry.allowedMethods(request.url);
    if (allowed.length > 0) {
      reply.header('Allow', allowed.join(', '));
      return sendProblem(
        reply,
        new ApiError(405, 'METHOD_NOT_ALLOWED', `Method ${request.method} is not allowed for this resource`),
      );
    }
    return sendProblem(reply, new ApiError(404, 'NOT_FOUND', 'Resource not found'));
  });

  // Route-level validation must throw ApiError (VALIDATION_ERROR with `errors`). Fastify schema
  // validation would arrive here as a plain 400 and come out as BAD_REQUEST without `errors`.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) return sendProblem(reply, error);
    const status = error.statusCode;
    // Only the static plugin raises a non-ApiError 403 (a non-canonical path such as `//` or
    // `%2e%2e`, which it refuses to map to a file). Such a path names no file, so it is handled like
    // any other path without one: SPA fallback outside /api, 404/405 problem under /api. The
    // reply is not returned: Fastify would await it as a thenable and add a listener per await.
    if (status === 403) {
      reply.callNotFound();
      return;
    }
    if (typeof status === 'number' && status >= 400 && status < 500) {
      // Errors raised by Fastify itself (e.g. body too large); code derived from the reason phrase.
      const title = STATUS_CODES[status] ?? 'Client Error';
      const code = title.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      return sendProblem(reply, new ApiError(status, code, error.message || title));
    }
    request.log.error({ err: error }, 'Unhandled error');
    return sendProblem(reply, new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'));
  });

  for (const register of ROUTES) register(app);

  return app;
}
