import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMqtt } from '../src/services/mqtt.js';

const T = '11111111-1111-1111-1111-111111111111';

test('parseMqtt toma tenant y device del topic', () => {
  const m = parseMqtt(`trazza/${T}/860123456789012`, JSON.stringify({ lat: -32.9, lng: -68.8, battery: 80 }));
  assert.ok(m);
  assert.equal(m!.tenantId, T);
  assert.equal(m!.point.deviceIdentifier, '860123456789012');
  assert.equal(m!.point.lat, -32.9);
  assert.equal(m!.point.lng, -68.8);
  assert.equal(m!.point.battery, 80);
});

test('parseMqtt acepta tenant/device en el payload (topic genérico)', () => {
  const m = parseMqtt('trazza/ingest', JSON.stringify({
    tenantId: T, deviceIdentifier: 'deveui1', latitude: -33, longitude: -69, engineHours: 12.5,
  }));
  assert.ok(m);
  assert.equal(m!.tenantId, T);
  assert.equal(m!.point.deviceIdentifier, 'deveui1');
  assert.equal(m!.point.lat, -33);
  assert.equal(m!.point.engineHours, 12.5);
});

test('parseMqtt rechaza tenant inválido, payload no-JSON y sin resolución', () => {
  assert.equal(parseMqtt('trazza/no-uuid/dev', JSON.stringify({ lat: 1 })), null);
  assert.equal(parseMqtt(`trazza/${T}/dev`, 'no-json{'), null);
  // Sin deviceIdentifier ni assetId no hay forma de resolver el activo.
  assert.equal(parseMqtt('trazza/ingest', JSON.stringify({ tenantId: T, lat: -32 })), null);
});
