const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?([Zz]|[+-]\d{2}:\d{2})?$/

/**
 * Parses an API timestamp. A frozen test clock echoes its value as sent (http-api.md §4.1), so a
 * timestamp may lack an offset (meaning UTC, not local time), use lowercase `t`/`z`, or carry more
 * than three fractional digits (truncated to milliseconds).
 */
export function parseTimestamp(s: string): Date {
  const m = TIMESTAMP_RE.exec(s)
  if (!m) return new Date(s)
  const [, date, hoursMinutes, seconds = '00', fraction = '', offset = 'Z'] = m
  const millis = fraction.padEnd(3, '0').slice(0, 3)
  return new Date(`${date}T${hoursMinutes}:${seconds}.${millis}${offset.toUpperCase()}`)
}
