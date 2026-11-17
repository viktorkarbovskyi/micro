/**
 * Records registered (url pattern, method) pairs so that an unmatched request can be told apart
 * as 405 (known path, other method) or 404 (unknown path). specs/http-api.md §1.3 step 1.
 */
export interface RoutesRegistry {
  add(method: string | string[], url: string): void;
  /** Methods registered for patterns matching `path` (query string ignored); empty if none. */
  allowedMethods(path: string): string[];
}

const segments = (path: string): string[] => path.split('/');

function matches(pattern: string[], path: string[]): boolean {
  if (pattern.length !== path.length) return false;
  return pattern.every((seg, i) => (seg.startsWith(':') ? path[i] !== '' : seg === path[i]));
}

export function createRoutesRegistry(): RoutesRegistry {
  const routes = new Map<string, { pattern: string[]; methods: Set<string> }>();
  return {
    add(method, url) {
      // Wildcard routes (e.g. static file serving) are catch-alls; they must not turn every
      // unknown path into a 405.
      if (url.includes('*')) return;
      let entry = routes.get(url);
      if (!entry) {
        entry = { pattern: segments(url), methods: new Set() };
        routes.set(url, entry);
      }
      for (const m of Array.isArray(method) ? method : [method]) entry.methods.add(m.toUpperCase());
    },
    allowedMethods(path) {
      const target = segments(path.split('?')[0]!);
      const allowed = new Set<string>();
      for (const { pattern, methods } of routes.values()) {
        if (matches(pattern, target)) for (const m of methods) allowed.add(m);
      }
      return [...allowed];
    },
  };
}
