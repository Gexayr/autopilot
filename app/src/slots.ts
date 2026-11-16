import { DateTime } from 'luxon';

const parseTime = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return { hour: +m[1], minute: +m[2] };
};

/** "HH:MM" = exact time; "HH:MM-HH:MM" = a random minute inside the window, different every day. */
const parse = (s: string) => {
  const [a, b] = s.split('-');
  const start = parseTime(a);
  const end = b === undefined ? null : parseTime(b);
  if (!start || (b !== undefined && (!end || end.hour * 60 + end.minute <= start.hour * 60 + start.minute)))
    throw new Error(`bad slot "${s}", expected HH:MM or HH:MM-HH:MM`);
  return { start, end };
};

/**
 * First two times whose windows overlap ("16:00" and "16:00-17:00", "18:00-20:00" and "19:00-20:00"), or null.
 * An exact time is a one-minute window, so "15:00-16:00" and "16:00" don't overlap.
 */
export function slotOverlap(slots: string[]): [string, string] | null {
  const min = (t: { hour: number; minute: number }) => t.hour * 60 + t.minute;
  const w = slots.map((s) => { const { start, end } = parse(s); return { s, a: min(start), b: end ? min(end) : min(start) + 1 }; })
    .sort((x, y) => x.a - y.a);
  for (let i = 1; i < w.length; i++) for (let j = 0; j < i; j++) if (w[i].a < w[j].b) return [w[j].s, w[i].s];
  return null;
}

/** Publishing windows strictly after `from`, in order; an exact time is a one-minute window. */
export function* slotWindows(slots: string[], tz: string, from: Date): Generator<{ start: Date; end: Date }> {
  const windows = slots.map(parse).sort((a, b) => a.start.hour - b.start.hour || a.start.minute - b.start.minute);
  if (!windows.length) return;
  let day = DateTime.fromJSDate(from).setZone(tz).startOf('day');
  for (let i = 0; i < 3660; i++, day = day.plus({ days: 1 })) {
    for (const w of windows) {
      const start = day.set({ hour: w.start.hour, minute: w.start.minute });
      const end = w.end ? day.set({ hour: w.end.hour, minute: w.end.minute }) : start.plus({ minutes: 1 });
      if (end.toMillis() > from.getTime() + 60_000) yield { start: start.toJSDate(), end: end.toJSDate() };
    }
  }
}

/** Start of every publishing window after `from` (kept for validation and tests). */
export function* slotTimes(slots: string[], tz: string, from: Date): Generator<Date> {
  for (const w of slotWindows(slots, tz, from)) if (w.start.getTime() > from.getTime()) yield w.start;
}

/**
 * First window after `from` with no post of the page in it. Exact times return that time; a range returns
 * a random minute inside it (not earlier than `from`), so posts don't come out at the same minute every day.
 */
export function nextFreeSlot(slots: string[], tz: string, taken: Date[], from: Date, random = Math.random): Date {
  for (const w of slotWindows(slots, tz, from)) {
    const lo = Math.max(w.start.getTime(), Math.ceil(from.getTime() / 60_000) * 60_000);
    if (lo >= w.end.getTime()) continue;
    if (taken.some((t) => t.getTime() >= w.start.getTime() && t.getTime() < w.end.getTime())) continue;
    const minutes = Math.floor((w.end.getTime() - lo) / 60_000); // ≥ 1
    return new Date(lo + Math.floor(random() * minutes) * 60_000);
  }
  throw new Error('no free slot');
}

export const formatSlot = (d: Date, tz: string, lang = 'ru') =>
  DateTime.fromJSDate(d).setZone(tz).setLocale(lang).toFormat('d MMM, HH:mm');
