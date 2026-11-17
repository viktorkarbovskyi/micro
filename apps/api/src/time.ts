const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?([Zz]|([+-])(\d{2}):(\d{2}))?$/;

const MAX_EPOCH_MS = 8.64e15;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * ISO 8601 / RFC 3339 date-time string (Z | ±hh:mm | no offset = UTC; `T`/`Z` in either case; any
 * number of fractional-second digits, truncated — not rounded — to milliseconds), or an integer
 * epoch-ms number → epoch ms; otherwise null.
 */
export function parseInstant(input: unknown, opts: { allowNumber?: boolean } = {}): number | null {
  if (typeof input === 'number') {
    if (!opts.allowNumber) return null;
    return Number.isInteger(input) && Math.abs(input) <= MAX_EPOCH_MS ? input : null;
  }
  if (typeof input !== 'string') return null;
  const m = ISO_RE.exec(input);
  if (!m) return null;

  const [y, mo, d, h, mi] = [m[1]!, m[2]!, m[3]!, m[4]!, m[5]!];
  const [year, month, day, hour, minute] = [y, mo, d, h, mi].map(Number);
  const s = m[6] ?? '00';
  const second = Number(s);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const hasOffset = m[9] !== undefined;
  if (hasOffset && (Number(m[10]) > 23 || Number(m[11]) > 59)) return null;

  // Canonical form with exactly three fraction digits, which Date.parse handles everywhere.
  const millis = (m[7] ?? '').padEnd(3, '0').slice(0, 3);
  const offset = hasOffset ? `${m[9]}${m[10]}:${m[11]}` : 'Z';
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}.${millis}${offset}`);
  return Number.isNaN(ms) ? null : ms;
}
