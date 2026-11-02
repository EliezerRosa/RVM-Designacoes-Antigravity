import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortugueseDate, inferDocumentYears, normalizeDateSequence } from '../src/imports/dates.js';

test('Dates - parsePortugueseDate parses day and month abbreviation correctly', () => {
  const d1 = parsePortugueseDate('01/nov');
  assert.ok(d1);
  assert.equal(d1.day, 1);
  assert.equal(d1.month, 11);

  const d2 = parsePortugueseDate('15/Dez');
  assert.ok(d2);
  assert.equal(d2.day, 15);
  assert.equal(d2.month, 12);

  const d3 = parsePortugueseDate('03/Jan');
  assert.ok(d3);
  assert.equal(d3.day, 3);
  assert.equal(d3.month, 1);
});

test('Dates - inferDocumentYears extracts years from document text', () => {
  const years = inferDocumentYears('ESCALA DE PRESIDENTE E LEITOR 2026-2027');
  assert.equal(years.startYear, 2026);
  assert.equal(years.endYear, 2027);

  const singleYear = inferDocumentYears('ESCALA NOVEMBRO 2026');
  assert.equal(singleYear.startYear, 2026);
  assert.equal(singleYear.endYear, 2027); // Anticipates winter/spring cross-year rollover
});

test('Dates - normalizeDateSequence handles year-end rollover seamlessly', () => {
  const rawList = ['01/nov', '08/nov', '15/nov', '22/nov', '29/nov', '06/dez', '13/dez', '20/dez', '27/dez', '03/jan', '10/jan'];
  const normalized = normalizeDateSequence(rawList, 2026, 2027);

  assert.equal(normalized[0], '2026-11-01');
  assert.equal(normalized[8], '2026-12-27');
  assert.equal(normalized[9], '2027-01-03');
  assert.equal(normalized[10], '2027-01-10');
});
