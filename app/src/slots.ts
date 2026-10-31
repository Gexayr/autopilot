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
