import { randomBytes, createHash } from 'node:crypto';

/**
 * Credenciales por dispositivo. La clave se muestra UNA sola vez al crearse; la
 * base guarda sólo su hash SHA-256 (la clave es aleatoria de 192 bits, así que
 * el hash rápido alcanza — no hay diccionario que atacar como con una password).
 */
export interface DeviceKey {
  key: string;    // clave en claro (se muestra una vez)
  hash: string;   // sha256 hex (se guarda)
  prefix: string; // primeros chars, para identificarla en la UI sin revelarla
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateDeviceKey(): DeviceKey {
  const key = 'trz_' + randomBytes(24).toString('base64url');
  return { key, hash: hashKey(key), prefix: key.slice(0, 12) };
}
