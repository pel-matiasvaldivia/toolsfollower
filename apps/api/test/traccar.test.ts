import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTraccar, parseLoraWan } from '../src/routes/adapters.js';

test('parseTraccar normaliza posición, IMEI y batería', () => {
  const p = parseTraccar({
    device: { uniqueId: '860123456789012', name: 'Motogenerador 1' },
    position: {
      latitude: -32.8895,
      longitude: -68.8458,
      fixTime: '2026-09-22T12:00:00.000Z',
      attributes: { batteryLevel: 87 },
    },
  });
  assert.ok(p);
  assert.equal(p!.deviceIdentifier, '860123456789012');
  assert.equal(p!.lat, -32.8895);
  assert.equal(p!.lng, -68.8458);
  assert.equal(p!.battery, 87);
  assert.equal(p!.ts, '2026-09-22T12:00:00.000Z');
});

test('parseTraccar convierte horas de motor de ms a horas', () => {
  // 9.000.000.000 ms = 2500 h.
  const p = parseTraccar({
    device: { uniqueId: 'IMEI1' },
    position: { latitude: -32.9, longitude: -68.8, attributes: { hours: 9_000_000_000 } },
  });
  assert.equal(p!.engineHours, 2500);
});

test('parseTraccar devuelve null sin posición válida', () => {
  assert.equal(parseTraccar({ device: { uniqueId: 'x' } }), null);
  assert.equal(parseTraccar({ position: { latitude: -32.9 } }), null);
  assert.equal(parseTraccar(null), null);
});

test('parseLoraWan lee uplink de ChirpStack v4', () => {
  const p = parseLoraWan({
    time: '2026-09-22T12:00:00Z',
    deviceInfo: { devEui: '0102030405060708' },
    object: { latitude: -32.89, longitude: -68.84, battery: 91 },
  });
  assert.ok(p);
  assert.equal(p!.deviceIdentifier, '0102030405060708');
  assert.equal(p!.lat, -32.89);
  assert.equal(p!.lng, -68.84);
  assert.equal(p!.battery, 91);
  assert.equal(p!.ts, '2026-09-22T12:00:00Z');
});

test('parseLoraWan lee uplink de The Things Stack v3 y normaliza DevEUI', () => {
  const p = parseLoraWan({
    received_at: '2026-09-22T12:00:00Z',
    end_device_ids: { dev_eui: 'AABBCCDD00112233' },
    uplink_message: { decoded_payload: { gps_lat: -33.1, gps_lng: -69.0, batteryLevel: 55 } },
  });
  assert.ok(p);
  assert.equal(p!.deviceIdentifier, 'aabbccdd00112233');
  assert.equal(p!.lat, -33.1);
  assert.equal(p!.lng, -69.0);
  assert.equal(p!.battery, 55);
});

test('parseLoraWan devuelve null sin posición decodificada', () => {
  assert.equal(parseLoraWan({ deviceInfo: { devEui: 'x' }, object: { battery: 90 } }), null);
  assert.equal(parseLoraWan({ end_device_ids: { dev_eui: 'x' } }), null);
  assert.equal(parseLoraWan(null), null);
});
