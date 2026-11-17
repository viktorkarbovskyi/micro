import { parseInstant } from './time';

export interface Stamp {
  iso: string;
  ms: number;
}

export interface Clock {
  now(): Stamp;
  freeze(input: string | number): Stamp;
  unfreeze(): void;
}

export function createClock(): Clock {
  let frozen: Stamp | null = null;
  return {
    now() {
      if (frozen) return { ...frozen };
      const date = new Date();
      return { iso: date.toISOString(), ms: date.getTime() };
    },
    freeze(input) {
      const ms = parseInstant(input, { allowNumber: true });
      if (ms === null) throw new RangeError(`Invalid instant: ${String(input)}`);
      frozen = { iso: typeof input === 'string' ? input : new Date(ms).toISOString(), ms };
      return { ...frozen };
    },
    unfreeze() {
      frozen = null;
    },
  };
}
