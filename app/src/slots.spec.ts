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

  it('rejects malformed slots', () => {
    expect(() => take(slotTimes(['25:00'], tz, new Date()), 1)).toThrow('bad slot');
  });
});
