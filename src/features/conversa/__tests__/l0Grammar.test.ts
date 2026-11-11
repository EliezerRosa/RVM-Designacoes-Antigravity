import test from 'node:test';
import assert from 'node:assert/strict';
import { parseL0Grammar } from '../core/nlu/l0Grammar';

test('L0 Grammar: detects document intents', () => {
  const r1 = parseL0Grammar('mostrar s-140 da semana que vem');
  assert.equal(r1.intentId, 'view-s140');
  assert.equal(r1.confidence, 0.95);

  const r2 = parseL0Grammar('quero ver o S89');
  assert.equal(r2.intentId, 'view-s89');

  const r3 = parseL0Grammar('abrir s-4');
  assert.equal(r3.intentId, 'view-s4');

  const r4 = parseL0Grammar('ver folhinha');
  assert.equal(r4.intentId, 'view-s89');
});

test('L0 Grammar: detects vacant parts and parts list', () => {
  const r1 = parseL0Grammar('quais partes estão vagas?');
  assert.equal(r1.intentId, 'query-vacant-parts');

  const r2 = parseL0Grammar('tem alguma vaga esta semana?');
  assert.equal(r2.intentId, 'query-vacant-parts');

  const r3 = parseL0Grammar('quais as partes da reunião');
  assert.equal(r3.intentId, 'query-week-assignments');
});

test('L0 Grammar: detects agenda view with dates', () => {
  const r1 = parseL0Grammar('o que tem na reunião de hoje?');
  assert.equal(r1.intentId, 'query-week-assignments');

  const r2 = parseL0Grammar('minhas designações');
  assert.equal(r2.intentId, 'query-my-assignments');

  const r3 = parseL0Grammar('o que tem dia 25/12/2026?');
  assert.equal(r3.intentId, 'query-week-assignments');
  assert.equal(r3.slots.targetDate, '2026-12-25');
});

test('L0 Grammar: detects rule explanations', () => {
  const r1 = parseL0Grammar('qual a regra da oração?');
  assert.equal(r1.intentId, 'explain-engine-rules');
  assert.equal(r1.slots.ruleId, 'oracao');

  const r2 = parseL0Grammar('por que não posso designar o presidente?');
  assert.equal(r2.intentId, 'explain-engine-rules');
  assert.equal(r2.slots.ruleId, 'presidente');

  const r3 = parseL0Grammar('como funciona o intervalo entre partes?');
  assert.equal(r3.intentId, 'explain-engine-rules');
  assert.equal(r3.slots.ruleId, 'intervalo');
});

test('L0 Grammar: detects disambiguation responses (choices and ordinals)', () => {
  const r1 = parseL0Grammar('opção 1');
  assert.equal(r1.intentId, 'clarify-ambiguity');
  assert.equal(r1.slots.choiceIndex, 0);

  const r2 = parseL0Grammar('o segundo');
  assert.equal(r2.intentId, 'clarify-ambiguity');
  assert.equal(r2.slots.choiceIndex, 1);

  const r3 = parseL0Grammar('3');
  assert.equal(r3.intentId, 'clarify-ambiguity');
  assert.equal(r3.slots.choiceIndex, 2);
});

test('L0 Grammar: detects briefing and sync status', () => {
  const r1 = parseL0Grammar('quais minhas pendências?');
  assert.equal(r1.intentId, 'proactive-briefing');

  const r2 = parseL0Grammar('como está a sincronização com o hg?');
  assert.equal(r2.intentId, 'query-sync-status');
});
