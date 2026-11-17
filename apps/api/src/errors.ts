import { STATUS_CODES } from 'node:http';
import type { FastifyReply } from 'fastify';
import type { Problem, State } from '@app/shared';
import type { Outcome } from './domain/rules';

export interface FieldError {
  field: string;
  message: string;
}

/** An error that maps directly to an RFC 9457 problem response (specs/http-api.md §1.2). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: FieldError[];

  constructor(status: number, code: string, detail: string, errors?: FieldError[]) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    if (errors !== undefined) this.errors = errors;
  }
}

/**
 * 400 VALIDATION_ERROR whose `detail` lists every field error, so a client that shows only `detail`
 * (the UI toast) still says what failed. A message that does not start with its field name is
 * prefixed with it: `Request body is invalid: title must be …; extra: Unknown field`.
 */
export function validationError(source: 'body' | 'query', errors: FieldError[]): ApiError {
  const parts = errors.map(({ field, message }) =>
    message.startsWith(`${field} `) ? message : `${field}: ${message}`,
  );
  return new ApiError(400, 'VALIDATION_ERROR', `Request ${source} is invalid: ${parts.join('; ')}`, errors);
}

export function outcomeError(
  outcome: Exclude<Outcome, 'OK'>,
  ctx: { from?: State; to?: State; state?: State },
): ApiError {
  switch (outcome) {
    case 'NOT_VISIBLE':
      return new ApiError(404, 'NOT_FOUND', 'Report not found');
    case 'FORBIDDEN':
      return new ApiError(403, 'FORBIDDEN', 'You are not allowed to perform this action');
    case 'NOT_EDITABLE':
      return new ApiError(409, 'REPORT_NOT_EDITABLE', `Only draft reports can be edited (current state: ${ctx.state})`);
    case 'ILLEGAL_TRANSITION':
      return new ApiError(409, 'ILLEGAL_TRANSITION', `Cannot transition from ${ctx.from} to ${ctx.to}`);
  }
}

export function problemBody(err: ApiError): Problem {
  return {
    type: 'about:blank',
    title: STATUS_CODES[err.status] ?? 'Unknown',
    status: err.status,
    detail: err.detail,
    code: err.code,
    ...(err.code === 'VALIDATION_ERROR' && err.errors ? { errors: err.errors } : {}),
  };
}

export function sendProblem(reply: FastifyReply, err: ApiError): FastifyReply {
  return reply.code(err.status).type('application/problem+json').send(problemBody(err));
}
