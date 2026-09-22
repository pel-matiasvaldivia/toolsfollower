import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeviceKey, hashKey } from '../src/util/apikey.js';

test('generateDeviceKey produce clave con prefijo trz_ y hash consistente', () => {
  const c = generateDeviceKey();
  assert.match(c.key, /^trz_[A-Za-z0-9_-]+$/);
  assert.equal(c.prefix, c.key.slice(0, 12));
  assert.equal(c.hash, hashKey(c.key));
  assert.equal(c.hash.length, 64); // sha256 hex
});

test('generateDeviceKey es único por llamada', () => {
  const a = generateDeviceKey();
  const b = generateDeviceKey();
  assert.notEqual(a.key, b.key);
  assert.notEqual(a.hash, b.hash);
});

test('hashKey es determinístico y distinto por clave', () => {
  assert.equal(hashKey('trz_abc'), hashKey('trz_abc'));
  assert.notEqual(hashKey('trz_abc'), hashKey('trz_abd'));
});
