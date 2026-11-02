import test from 'node:test';
import assert from 'node:assert/strict';
import { NameResolver } from '../src/names/resolver.js';

test('Resolver - resolves known pre-calibrated alias exact matches', () => {
  const resolver = new NameResolver();
  
  const res1 = resolver.resolve('Renato');
  assert.equal(res1.confidence, 'alias');
  assert.equal(res1.canonicalName, 'Renato Oliveira');
  assert.equal(res1.hg_id, 2491349);

  const res2 = resolver.resolve('Diego');
  assert.equal(res2.confidence, 'alias');
  assert.equal(res2.canonicalName, 'Diego Resmann');
  assert.equal(res2.hg_id, 2491224);

  const res3 = resolver.resolve('Domingos');
  assert.equal(res3.confidence, 'alias');
  assert.equal(res3.canonicalName, 'Domingos Oliveira');
  assert.equal(res3.hg_id, 3331221);
});

test('Resolver - handles case-insensitive lookup', () => {
  const resolver = new NameResolver();
  
  const res = resolver.resolve('edmilson');
  assert.equal(res.canonicalName, 'Edmilson Monteiro');
  assert.equal(res.hg_id, 3296262);
});

test('Resolver - handles role-specific alias resolution', () => {
  const resolver = new NameResolver();
  
  const resChairman = resolver.resolve('Edmilson', 'wm_chairman');
  assert.equal(resChairman.canonicalName, 'Edmilson Monteiro');
  assert.equal(resChairman.hg_id, 3296262);

  const resReader = resolver.resolve('Edmilson', 'wm_reader');
  assert.equal(resReader.canonicalName, 'Edmilson Pessanha');
  assert.equal(resReader.hg_id, 3331200);
});

test('Resolver - marks unknown names as unresolved for user confirmation', () => {
  const resolver = new NameResolver();
  
  const res = resolver.resolve('Irmão Desconhecido 123');
  assert.equal(res.confidence, 'unresolved');
  assert.equal(res.hg_id, null);
});
