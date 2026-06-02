/**
 * NTES request/response crypto — ported from ntes-client (Python).
 * @see https://github.com/x64vbhv/ntes-client/blob/main/ntes/crypto.py
 */
import { createCipheriv, createDecipheriv, createHash } from 'crypto';
import { NTESCryptoError } from './exceptions';

const KEY = Buffer.from('8EA4DB2CC1EB3DC5', 'utf-8');
const IV = Buffer.from('7DC5EB3BB4DB6EA8', 'utf-8');
const SCKEY = '645fbc1e56e23365f2f3c204ae0899f6';

function pkcs7Pad(data: Buffer): Buffer {
  const padLen = 16 - (data.length % 16);
  return Buffer.concat([data, Buffer.alloc(padLen, padLen)]);
}

function pkcs7Unpad(data: Buffer): Buffer {
  const padLen = data[data.length - 1]!;
  if (padLen < 1 || padLen > 16) throw new NTESCryptoError('invalid padding');
  return data.subarray(0, data.length - padLen);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function decodeLayers(enc: string): Buffer {
  try {
    const raw = Buffer.from(enc, 'hex');
    const b64 = raw.toString('utf-8');
    return Buffer.from(b64, 'base64');
  } catch (err) {
    throw new NTESCryptoError(`encoding error: ${(err as Error).message}`);
  }
}

function encrypt(data: string): string {
  const cipher = createCipheriv('aes-128-cbc', KEY, IV);
  // NTES uses manual PKCS7 padding; Node auto-padding would add a spurious block.
  cipher.setAutoPadding(false);
  const padded = pkcs7Pad(Buffer.from(data, 'utf-8'));
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  const b64 = encrypted.toString('base64');
  return Buffer.from(b64, 'utf-8').toString('hex').toUpperCase();
}

function hashPayload(data: string): string {
  return createHash('md5').update(data + SCKEY, 'utf-8').digest('hex').toUpperCase();
}

export function buildNtesPayload(data: string): string {
  if (!data) throw new NTESCryptoError('empty payload');
  return `${hashPayload(data)}#${encrypt(data)}`;
}

export function decodeNtesPayload(enc: string): unknown {
  if (!enc) throw new NTESCryptoError('empty input');

  let payload = enc;
  const hashIdx = payload.indexOf('#');
  if (hashIdx >= 0) {
    payload = payload.slice(hashIdx + 1);
  }

  try {
    const cipherBytes = decodeLayers(payload);
    const decipher = createDecipheriv('aes-128-cbc', KEY, IV);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
    const text = pkcs7Unpad(decrypted).toString('utf-8');
    return safeJsonParse(text);
  } catch (err) {
    if (err instanceof NTESCryptoError) throw err;
    throw new NTESCryptoError(`decryption failed: ${(err as Error).message}`);
  }
}
