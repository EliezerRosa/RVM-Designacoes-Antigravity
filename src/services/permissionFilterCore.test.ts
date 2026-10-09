import test from 'node:test';
import assert from 'node:assert/strict';
import {
    filterPublishersByScope,
    filterAndRedactPublishers,
    filterPublisherRowsByScope,
    redactSensitivePublisherFields,
    type PublisherAccessScope,
} from './permissionFilterCore';

const publishers = [
    { id: '1', name: 'Ana Silva', condition: 'Publicador', isServing: true, notQualifiedReason: 'treino' },
    { id: '2', name: 'Bruno Costa', condition: 'Ancião', isServing: true, indefinitePauseReason: 'saúde' },
    { id: '3', name: 'Carla Souza', condition: 'Publicador', isServing: false },
    { id: '4', name: 'Davi Lima', condition: 'Servo Ministerial', isServing: true, isNotQualified: true },
];

const scope = (over: Partial<PublisherAccessScope>): PublisherAccessScope => ({
    isAdmin: false,
    accessLevel: 'filtered',
    selfPublisherId: null,
    canSeeSensitiveData: false,
    filters: { accessLevel: 'filtered' },
    ...over,
});

test('admin e accessLevel all veem todos, sem redação quando sensível permitido', () => {
    assert.equal(filterPublishersByScope(publishers, scope({ isAdmin: true, accessLevel: 'self' })).length, 4);
    const all = filterAndRedactPublishers(publishers, scope({ accessLevel: 'all', canSeeSensitiveData: true }));
    assert.equal(all.length, 4);
    assert.equal(all[0].notQualifiedReason, 'treino');
});

test('self restringe ao próprio publicador e exige selfPublisherId', () => {
    assert.deepEqual(filterPublishersByScope(publishers, scope({ accessLevel: 'self', selfPublisherId: '3' })).map(p => p.id), ['3']);
    assert.deepEqual(filterPublishersByScope(publishers, scope({ accessLevel: 'self', selfPublisherId: null })), []);
});

test('filtered sem critérios vê todos mas redige campos pastorais', () => {
    const out = filterAndRedactPublishers(publishers, scope({}));
    assert.equal(out.length, 4);
    assert.equal('notQualifiedReason' in out[0], false);
    assert.equal('indefinitePauseReason' in out[1], false);
    // flags booleanas permanecem (não são o motivo)
    assert.equal(out[3].isNotQualified, true);
});

test('filtered aplica conditions, statuses e excludeNames (acento-insensível)', () => {
    const byCondition = filterPublishersByScope(publishers, scope({ filters: { accessLevel: 'filtered', conditions: ['publicador'] } }));
    assert.deepEqual(byCondition.map(p => p.id), ['1', '3']);

    const active = filterPublishersByScope(publishers, scope({ filters: { accessLevel: 'filtered', statuses: ['Ativos'] } }));
    assert.deepEqual(active.map(p => p.id), ['1', '2', '4']);

    const apt = filterPublishersByScope(publishers, scope({ filters: { accessLevel: 'filtered', statuses: ['apto'] } }));
    assert.deepEqual(apt.map(p => p.id), ['1', '2', '3']);

    const excluded = filterPublishersByScope(publishers, scope({ filters: { accessLevel: 'filtered', excludeNames: ['bruno costa'] } }));
    assert.deepEqual(excluded.map(p => p.id), ['1', '3', '4']);

    // status desconhecido não restringe
    const unknown = filterPublishersByScope(publishers, scope({ filters: { accessLevel: 'filtered', statuses: ['xpto'] } }));
    assert.equal(unknown.length, 4);
});

test('redactSensitivePublisherFields não muta o original', () => {
    const original = { id: '9', name: 'Z', notQualifiedReason: 'x' };
    const redacted = redactSensitivePublisherFields(original, scope({}));
    assert.equal(original.notQualifiedReason, 'x');
    assert.equal('notQualifiedReason' in redacted, false);
});

test('filterPublisherRowsByScope lê campos dentro de data e redige', () => {
    const rows = publishers.map(({ id, ...data }) => ({ id, data }));
    const selfRows = filterPublisherRowsByScope(rows, scope({ accessLevel: 'self', selfPublisherId: '2' }));
    assert.equal(selfRows.length, 1);
    assert.equal(selfRows[0].data.name, 'Bruno Costa');
    assert.equal('indefinitePauseReason' in selfRows[0].data, false);

    const elderRows = filterPublisherRowsByScope(rows, scope({ canSeeSensitiveData: true, filters: { accessLevel: 'filtered', conditions: ['Ancião'] } }));
    assert.equal(elderRows.length, 1);
    assert.equal(elderRows[0].data.indefinitePauseReason, 'saúde');
});
