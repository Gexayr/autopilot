import { createHmac } from 'node:crypto';
import { signJwt, verifyInitData, verifyJwt } from './auth.service';

const BOT = '123456:TEST-token';

/** Builds initData the way Telegram signs it. */
function initData(fields: Record<string, string>, token = BOT) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(dcs).digest('hex') }).toString();
}

describe('verifyInitData', () => {
  const user = JSON.stringify({ id: 42, first_name: 'Ann', last_name: 'Lee' });
  const now = () => String(Math.floor(Date.now() / 1000));

  it('accepts data signed with the bot token', () => {
    expect(verifyInitData(initData({ auth_date: now(), user, query_id: 'q' }), BOT)).toEqual({ id: 42, name: 'Ann Lee', photoUrl: undefined });
  });

  it('rejects another bot token and tampered fields', () => {
    expect(() => verifyInitData(initData({ auth_date: now(), user }, '999:other'), BOT)).toThrow('signature');
    const forged = initData({ auth_date: now(), user }).replace('42', '43');
    expect(() => verifyInitData(forged, BOT)).toThrow('signature');
  });

  it('rejects old data', () => {
    expect(() => verifyInitData(initData({ auth_date: String(Math.floor(Date.now() / 1000) - 2 * 86400), user }), BOT)).toThrow('expired');
  });
});

describe('jwt', () => {
  it('round-trips and rejects wrong secret / expiry', () => {
    const t = signJwt({ sub: 7 }, 's1');
    expect(verifyJwt(t, 's1')?.sub).toBe(7);
    expect(verifyJwt(t, 's2')).toBeNull();
    expect(verifyJwt(signJwt({ sub: 7 }, 's1', -10), 's1')).toBeNull();
    expect(verifyJwt('garbage', 's1')).toBeNull();
  });
});
