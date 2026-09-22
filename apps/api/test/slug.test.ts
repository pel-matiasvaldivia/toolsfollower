import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/util/slug.js';

test('slugify pasa a minúsculas y usa guiones', () => {
  assert.equal(slugify('Constructora Del Oeste'), 'constructora-del-oeste');
});

test('slugify quita acentos y símbolos', () => {
  assert.equal(slugify('Construcción S.A. — Mendoza'), 'construccion-s-a-mendoza');
});

test('slugify recorta guiones en los extremos', () => {
  assert.equal(slugify('  ¡Hola!  '), 'hola');
});
