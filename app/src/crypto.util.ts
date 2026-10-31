import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config';

// Instagram tokens are stored AES-256-GCM encrypted: a leaked database must not leak account access.
const key = () => {
  const k = Buffer.from(config.tokenEncKey, 'hex');
  if (k.length !== 32) throw new Error('TOKEN_ENC_KEY must be 64 hex chars');
  return k;
};

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export function sign(value: string): string {
  return createHmac('sha256', config.adminKey + config.tokenEncKey).update(value).digest('base64url');
}

export function verifySigned(value: string, signature: string): boolean {
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const randomName = (ext: string) => `${randomBytes(16).toString('hex')}.${ext}`;
