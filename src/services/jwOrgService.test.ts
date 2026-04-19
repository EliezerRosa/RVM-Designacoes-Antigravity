import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { extractWeekHeader, normalizeToWeekStart } from './jwOrgService';

test('normalizeToWeekStart normalizes any weekday to the Monday of that ISO week', () => {
    const normalized = normalizeToWeekStart(new Date('2026-08-13T09:30:00'));

    assert.equal(normalized.toISOString().slice(0, 10), '2026-08-10');
});

test('extractWeekHeader prefers the real week heading and ignores noisy song-like text', () => {
    const dom = new JSDOM(`
        <!doctype html>
        <html>
        <body>
            <h1>11-17 DE AGOSTO</h1>
            <h3>11-12 Cântico</h3>
            <h3>Cântico 101 e oração</h3>
        </body>
        </html>
    `);

    const result = extractWeekHeader(dom.window.document, new Date('2026-08-11T12:00:00'));

    assert.equal(result.weekDisplay, '11-17 de Agosto');
    assert.equal(result.weekId, '2026-08-10');
});

test('extractWeekHeader falls back to the normalized week range when no valid heading exists', () => {
    const dom = new JSDOM(`
        <!doctype html>
        <html>
        <body>
            <h3>Cântico 21 e oração</h3>
            <p>Comentários iniciais</p>
        </body>
        </html>
    `);

    const result = extractWeekHeader(dom.window.document, new Date('2026-09-03T12:00:00'));

    assert.equal(result.weekDisplay, '31 de Agosto-6 de Setembro');
    assert.equal(result.weekId, '2026-08-31');
});