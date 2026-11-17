import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

// Running config: README.md. Paths are resolved against the repo root, not the cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`PORT must be an integer between 0 and 65535, got ${process.env.PORT}`);
}
const dbPathEnv = process.env.DB_PATH ?? './data/app.db';
const dbPath = dbPathEnv === ':memory:' ? dbPathEnv : path.resolve(repoRoot, dbPathEnv);
const webDir = path.join(repoRoot, 'apps/web/dist');

const app = buildApp({ dbPath, webDir });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

// Local demo only: the test and admin endpoints must not be exposed publicly (specs/http-api.md §4.3).
const url = await app.listen({ host: '127.0.0.1', port });
console.log(`Expense report API listening on ${url} (database: ${dbPath})`);
