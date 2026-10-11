// Senhas com scrypt + sal; sessões com token assinado (HMAC). Só usa o que já vem no Node.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function checkPassword(password: string, salt: string, hash: string): boolean {
  const h = scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === h.length && timingSafeEqual(h, ref);
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signToken(key: string, secret: string, days = 60): string {
  const body = b64(JSON.stringify({ k: key, exp: Date.now() + days * 864e5 }));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined | null, secret: string): string | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = createHmac('sha256', secret).update(body).digest('base64url');
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof data.k !== 'string' || data.exp < Date.now()) return null;
    return data.k;
  } catch {
    return null;
  }
}

export function validUsername(u: string): string | null {
  if (!/^[A-Za-z0-9_.-]{3,16}$/.test(u)) return 'O apelido precisa ter de 3 a 16 letras, números, ponto, traço ou _.';
  return null;
}

export function validPassword(p: string): string | null {
  if (typeof p !== 'string' || p.length < 6 || p.length > 72) return 'A senha precisa ter pelo menos 6 caracteres.';
  return null;
}
