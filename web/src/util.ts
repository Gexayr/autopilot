import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Page, Post, PostStatus } from './api';
import { lang, NUMBER_LOCALE, t } from './i18n';

dayjs.extend(utc);
dayjs.extend(timezone);
export { dayjs };

export const PAGE_COLORS = ['violet', 'teal', 'orange', 'pink', 'blue', 'lime', 'grape', 'cyan'];
export const pageColor = (pageId: number) => PAGE_COLORS[pageId % PAGE_COLORS.length];

export const fmtTime = (iso: string | null, tz?: string) => (iso ? (tz ? dayjs(iso).tz(tz) : dayjs(iso)).format('D MMM, HH:mm') : '-');
export const fmtNum = (n: number | null | undefined) => (n == null ? '-' : n.toLocaleString(NUMBER_LOCALE[lang()]));

const STATUS_COLORS: Record<PostStatus, string> = {
  draft: 'gray', generating: 'grape', awaiting_approval: 'yellow', approved: 'blue', publishing: 'cyan', published: 'green', failed: 'red', rejected: 'gray',
};
export const STATUS = Object.fromEntries(Object.entries(STATUS_COLORS).map(([k, color]) => [k, {
  color, get label() { return t(`status.${k}` as Parameters<typeof t>[0]); },
}])) as Record<PostStatus, { label: string; color: string }>;

// languages the AI can write posts in (labels are native names, same in every UI language)
export const LANGUAGES = [
  { value: 'hy', label: 'Հայերեն' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

export const TIMEZONES = ['Asia/Yerevan', 'Europe/Moscow', 'Asia/Tbilisi', 'Europe/Kyiv', 'Asia/Almaty', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];

/** Next `n` free slots of a page (in its timezone), skipping times already taken by queued posts. */
export function freeSlots(page: Page, posts: Post[], n = 12, from = dayjs()) {
  const taken = new Set(posts.filter((p) => p.pageId === page.id && p.scheduledFor && ['approved', 'publishing', 'published'].includes(p.status))
    .map((p) => dayjs(p.scheduledFor).valueOf()));
  const out: dayjs.Dayjs[] = [];
  const times = [...page.slots].sort();
  let day = from.tz(page.timezone).startOf('day');
  for (let i = 0; i < 60 && out.length < n; i++, day = day.add(1, 'day')) {
    for (const t of times) {
      const [h, m] = t.split(':').map(Number);
      const at = day.hour(h).minute(m).second(0).millisecond(0);
      if (at.valueOf() > from.valueOf() + 60_000 && !taken.has(at.valueOf())) out.push(at);
      if (out.length >= n) break;
    }
  }
  return out;
}

/** Minimum distance between two posts of one Instagram account. */
export const SLOT_GAP_MIN = 60;

export interface SlotConflict { slot: string; page: string; otherTime: string; suggestion: string | null }

/** UTC minute of the day for "HH:mm" in a timezone (today's offset). */
const utcMinute = (hhmm: string, tz: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = dayjs().tz(tz).hour(h).minute(m).utc();
  return t.hour() * 60 + t.minute();
};
const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 1440; return Math.min(d, 1440 - d); };

/**
 * Times of this rubric that are closer than SLOT_GAP_MIN to a post of another rubric on the same Instagram account,
 * each with the nearest free time (07:00-23:00, 30-minute steps) to switch to.
 */
export function slotConflicts(slots: string[], tz: string, others: Pick<Page, 'title' | 'slots' | 'timezone'>[]): SlotConflict[] {
  const taken = others.flatMap((o) => o.slots.map((s) => ({ page: o.title, min: utcMinute(s, o.timezone), local: s, tz: o.timezone })));
  const out: SlotConflict[] = [];
  for (const slot of slots) {
    const mine = utcMinute(slot, tz);
    const hit = taken.find((t) => dist(t.min, mine) < SLOT_GAP_MIN);
    if (!hit) continue;
    const busy = [...taken.map((t) => t.min), ...slots.filter((s) => s !== slot).map((s) => utcMinute(s, tz))];
    const candidates = Array.from({ length: 33 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
      .filter((c) => busy.every((b) => dist(b, utcMinute(c, tz)) >= SLOT_GAP_MIN))
      .sort((a, b) => dist(utcMinute(a, tz), mine) - dist(utcMinute(b, tz), mine));
    const otherTime = hit.tz === tz ? hit.local : dayjs().tz(hit.tz).hour(+hit.local.split(':')[0]).minute(+hit.local.split(':')[1]).tz(tz).format('HH:mm');
    out.push({ slot, page: hit.page, otherTime, suggestion: candidates[0] ?? null });
  }
  return out;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
