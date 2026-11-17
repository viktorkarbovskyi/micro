import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

let app: FastifyInstance;
let port: number;

beforeEach(async () => {
  ({ app } = await makeApp());
  await app.listen({ port: 0, host: '127.0.0.1' });
  port = (app.server.address() as AddressInfo).port;
});
afterEach(async () => {
  await app.close();
});

/** Sends raw bytes and returns everything the server writes before closing the socket. */
function rawRequest(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(payload));
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (data += chunk));
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

function parse(raw: string): { status: number; headers: Record<string, string>; body: unknown } {
  const [head = '', body = ''] = raw.split('\r\n\r\n');
  const [statusLine = '', ...lines] = head.split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const i = line.indexOf(':');
    headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  return { status: Number(statusLine.split(' ')[1]), headers, body: JSON.parse(body) };
}

describe('requests rejected by the HTTP parser', () => {
  const cases: [string, string][] = [
    ['malformed Content-Length', 'POST /api/reports HTTP/1.1\r\nHost: x\r\nContent-Length: abc\r\n\r\n'],
    ['header name containing a space', 'GET /api/users HTTP/1.1\r\nHost: x\r\nBad Header: 1\r\n\r\n'],
  ];
  it.each(cases)('%s gets a 400 problem details response', async (_name, payload) => {
    const res = parse(await rawRequest(payload));
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toBe('application/problem+json');
    expect(res.headers['connection']).toBe('close');
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      code: 'BAD_REQUEST',
    });
    expect(typeof (res.body as { detail: unknown }).detail).toBe('string');
  });
});
