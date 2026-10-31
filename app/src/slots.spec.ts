import { nextFreeSlot, slotTimes } from './slots';

const tz = 'Asia/Yerevan'; // UTC+4
const take = (g: Generator<Date>, n: number) => Array.from({ length: n }, () => g.next().value!.toISOString());

describe('slots', () => {
  it('lists upcoming slots in the page timezone', () => {
    // 2026-10-29 12:00 Yerevan = 08:00Z
    expect(take(slotTimes(['19:00', '10:00'], tz, new Date('2026-10-29T08:00:00Z')), 3)).toEqual([
      '2026-10-29T15:00:00.000Z',
      '2026-10-30T06:00:00.000Z',
      '2026-10-30T15:00:00.000Z',
    ]);
  });

  it('skips occupied slots', () => {
    const from = new Date('2026-10-29T08:00:00Z');
    const taken = [new Date('2026-10-29T15:00:00Z'), new Date('2026-10-30T06:00:00Z')];
    expect(nextFreeSlot(['10:00', '19:00'], tz, taken, from).toISOString()).toBe('2026-10-30T15:00:00.000Z');
  });

  it('picks a random minute inside a range and skips ranges that already have a post', () => {
    const from = new Date('2026-10-29T08:00:00Z'); // 12:00 Yerevan
    // 13:00-14:00 Yerevan = 09:00-10:00Z; random() = 0.5 -> 30 minutes in
    expect(nextFreeSlot(['13:00-14:00'], tz, [], from, () => 0.5).toISOString()).toBe('2026-10-29T09:30:00.000Z');
    const taken = [new Date('2026-10-29T09:12:00Z')];
    expect(nextFreeSlot(['13:00-14:00'], tz, taken, from, () => 0).toISOString()).toBe('2026-10-30T09:00:00.000Z');
  });

  it('starts a range that is already running from the next minute', () => {
    const from = new Date('2026-10-29T09:40:00Z'); // 13:40 Yerevan, inside 13:00-14:00
    expect(nextFreeSlot(['13:00-14:00'], tz, [], from, () => 0).toISOString()).toBe('2026-10-29T09:40:00.000Z');
  });

  it('rejects malformed slots', () => {
    expect(() => take(slotTimes(['14:00-13:00'], tz, new Date()), 1)).toThrow('bad slot');
    expect(() => take(slotTimes(['25:00'], tz, new Date()), 1)).toThrow('bad slot');
  });
});
