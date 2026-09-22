import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotify, formatAlert, splitList } from '../src/services/notify.js';

test('shouldNotify respeta el umbral de severidad', () => {
  assert.equal(shouldNotify('critical', 'warning'), true);
  assert.equal(shouldNotify('warning', 'warning'), true);
  assert.equal(shouldNotify('info', 'warning'), false);
  assert.equal(shouldNotify('info', 'info'), true);
});

test('formatAlert arma asunto y texto legibles', () => {
  const { subject, text } = formatAlert({
    kind: 'geofence_exit', severity: 'warning', message: 'salió de la zona', asset_name: 'Motogenerador 1',
  });
  assert.match(subject, /Motogenerador 1/);
  assert.match(text, /salió de la zona/);
  assert.match(text, /geofence_exit/);
});

test('splitList limpia espacios y vacíos', () => {
  assert.deepEqual(splitList('a@x.com, b@x.com ,, c@x.com'), ['a@x.com', 'b@x.com', 'c@x.com']);
  assert.deepEqual(splitList(''), []);
  assert.deepEqual(splitList(null), []);
});
