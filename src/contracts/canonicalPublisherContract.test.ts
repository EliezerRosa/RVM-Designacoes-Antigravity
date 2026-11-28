import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CANONICAL_CONTRACT_VERSION,
    filterNonGovernanceCapabilities,
    isPrivilegeAllowedForPublisher,
    isTechnicalGovernanceCapability,
    normalizeCanonicalProfile,
    projectLegacyPrivilegesFromCanonical,
    resolvePrimaryCanonicalFuncao,
    upsertExternalLink,
} from './canonicalPublisherContract';

test('canonicalPublisherContract - blocks technical governance capabilities from external sync (V-6)', () => {
    assert.equal(isTechnicalGovernanceCapability('governance.console'), true);
    assert.equal(isTechnicalGovernanceCapability('governance.permissions'), true);
    assert.equal(isTechnicalGovernanceCapability('governance.future_flag'), true);
    assert.equal(isTechnicalGovernanceCapability('congregation.admin'), false);
    assert.equal(isTechnicalGovernanceCapability('territories.manage'), false);

    const filtered = filterNonGovernanceCapabilities([
        'governance.console',
        'governance.integrations',
        'congregation.admin',
        'territories.manage',
        'schedules.midweek.manage',
        'invalid.unknown',
    ]);

    assert.deepEqual(filtered, [
        'congregation.admin',
        'schedules.midweek.manage',
        'territories.manage',
    ]);

    const normalized = normalizeCanonicalProfile({
        domainCapabilities: [
            'governance.console',
            'schedules.midweek.manage',
            'congregation.admin',
        ],
    });
    assert.equal(normalized.contractVersion, CANONICAL_CONTRACT_VERSION);
    assert.deepEqual(normalized.domainCapabilities, [
        'congregation.admin',
        'schedules.midweek.manage',
    ]);
});

test('canonicalPublisherContract - validates structural privilege rules (I-P3)', () => {
    assert.equal(
        isPrivilegeAllowedForPublisher('midweek.bible_reading', {
            gender: 'sister',
            condition: 'Publicador',
            isBaptized: true,
        }),
        false
    );
    assert.equal(
        isPrivilegeAllowedForPublisher('midweek.student_init_call', {
            gender: 'sister',
            condition: 'Publicador',
            isBaptized: false,
        }),
        true
    );
    assert.equal(
        isPrivilegeAllowedForPublisher('midweek.chairman', {
            gender: 'brother',
            condition: 'Servo Ministerial',
            isBaptized: true,
        }),
        false
    );
    assert.equal(
        isPrivilegeAllowedForPublisher('midweek.chairman', {
            gender: 'brother',
            condition: 'Ancião',
            isBaptized: true,
        }),
        true
    );
    assert.equal(
        isPrivilegeAllowedForPublisher('midweek.prayer', {
            gender: 'brother',
            condition: 'Publicador',
            isBaptized: false,
        }),
        false
    );
});

test('canonicalPublisherContract - projects canonical privileges to legacy engine flags accurately', () => {
    // Irmã apenas ajudante
    const helperSister = projectLegacyPrivilegesFromCanonical(
        ['midweek.student_helper', 'midweek.bible_reading'],
        { gender: 'sister', condition: 'Publicador', isBaptized: true }
    );
    assert.equal(helperSister.isHelperOnly, true);
    assert.equal(helperSister.privilegesBySection.canParticipateInTreasures, false);
    assert.equal(helperSister.privilegesBySection.canParticipateInMinistry, true);
    assert.equal(helperSister.privilegesBySection.canParticipateInLife, false);
    assert.equal(helperSister.privileges.canGiveStudentTalks, false);

    // Ancião preservando flag manual elderCanDoStudentParts
    const elderPreserved = projectLegacyPrivilegesFromCanonical(
        ['midweek.chairman', 'midweek.cbs_conductor', 'midweek.treasures_talk', 'midweek.prayer', 'midweek.student_init_call'],
        {
            gender: 'brother',
            condition: 'Ancião',
            isBaptized: true,
            preserveElderStudentParts: true,
            existingElderCanDoStudentParts: false,
        }
    );
    assert.equal(elderPreserved.privileges.canPreside, true);
    assert.equal(elderPreserved.privileges.canConductCBS, true);
    assert.equal(elderPreserved.privileges.canGiveTalks, true);
    assert.equal(elderPreserved.privileges.canPray, true);
    assert.equal(elderPreserved.privileges.elderCanDoStudentParts, false);
    assert.equal(elderPreserved.isHelperOnly, false);

    // Ancião espelhando elderCanDoStudentParts quando não preservado
    const elderMirrored = projectLegacyPrivilegesFromCanonical(
        ['midweek.chairman', 'midweek.student_init_call'],
        {
            gender: 'brother',
            condition: 'Ancião',
            isBaptized: true,
            preserveElderStudentParts: false,
        }
    );
    assert.equal(elderMirrored.privileges.elderCanDoStudentParts, true);
});

test('canonicalPublisherContract - resolves primary canonical funcao and preserves announcement board role', () => {
    assert.equal(resolvePrimaryCanonicalFuncao(['cca', 'territory_servant']), 'Coordenador do Corpo de Anciãos');
    assert.equal(resolvePrimaryCanonicalFuncao(['rvm_overseer', 'cca']), 'Superintendente da Reunião Vida e Ministério');
    assert.equal(
        resolvePrimaryCanonicalFuncao(['av_servant'], 'Responsável pelo Quadro de Anúncios'),
        'Responsável pelo Quadro de Anúncios'
    );
    assert.equal(resolvePrimaryCanonicalFuncao(['av_servant']), null);
});

test('canonicalPublisherContract - upsertExternalLink is idempotent per provider', () => {
    const first = upsertExternalLink(undefined, {
        provider: 'external_sync',
        externalId: '1001',
        externalName: 'Publicador Exemplo',
        status: 'linked',
        syncedAt: '2026-11-27T23:00:00.000Z',
    });
    assert.equal(first.length, 1);

    const updated = upsertExternalLink(first, {
        provider: 'external_sync',
        externalId: '1001',
        externalName: 'Publicador Atualizado',
        status: 'missing_in_source',
        syncedAt: '2026-11-27T23:10:00.000Z',
    });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].status, 'missing_in_source');
    assert.equal(updated[0].externalName, 'Publicador Atualizado');
});
