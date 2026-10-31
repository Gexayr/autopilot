import { DateTime } from 'luxon';

const parse = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`bad slot "${s}", expected HH:MM`);
  return { hour: +m[1], minute: +m[2] };
};

/** Slot times strictly after `from`, in order, for a page's daily HH:MM slots in its timezone. */
export function* slotTimes(slots: string[], tz: string, from: Date): Generator<Date> {
  const times = slots.map(parse).sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  if (!times.length) return;
  let day = DateTime.fromJSDate(from).setZone(tz).startOf('day');
  for (let i = 0; i < 3660; i++, day = day.plus({ days: 1 })) {
    for (const t of times) {
      const at = day.set({ hour: t.hour, minute: t.minute });
      if (at.toMillis() > from.getTime()) yield at.toJSDate();
    }
  }
}

/** First slot after `from` that no other post of the page already occupies. */
export function nextFreeSlot(slots: string[], tz: string, taken: Date[], from: Date): Date {
  const busy = new Set(taken.map((d) => d.getTime()));
  for (const at of slotTimes(slots, tz, from)) if (!busy.has(at.getTime())) return at;
  throw new Error('no free slot');
}

export const formatSlot = (d: Date, tz: string, lang = 'ru') =>
  DateTime.fromJSDate(d).setZone(tz).setLocale(lang).toFormat('d MMM, HH:mm');
