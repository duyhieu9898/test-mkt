/**
 * Symmetric encryption helper for at-rest secrets (e.g. third-party access
 * tokens stored in DB). AES-256-GCM with key derived from JWT_SECRET via
 * scrypt — keeps key material out of code without adding new env vars.
 *
 * Rotate JWT_SECRET at your peril: existing ciphertexts cannot be decrypted
 * afterwards. For production rotation, add KEY_ENCRYPTION_KEY and re-encrypt.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
// Stable per-deployment salt; key is derived once per process.
const KEY = scryptSync(env.JWT_SECRET, '1person.omnichannel.v1', 32);

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: v1:<iv_b64>:<tag_b64>:<ct_b64>
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload || !payload.startsWith('v1:')) {
    throw new Error('Invalid encrypted payload');
  }
  const [, ivB64, tagB64, ctB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** Return a UI-safe preview ("ABC…XYZ") of an opaque secret. */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 8) return '***';
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`;
}
