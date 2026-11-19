import test from 'node:test';
import assert from 'node:assert/strict';
import { replacementOrchestratorService, type NotificationDeliveryReport } from './replacementOrchestratorService';
import { zapiOrchestrator } from './zapiOrchestrator';
import { communicationService } from './communicationService';
import type { Publisher, WorkbookPart } from '../types';

function makePub(id: string, name: string, phone: string, funcao: string = ''): Publisher {
    return {
        id,
        name,
        phone,
        funcao,
        gender: 'brother',
        condition: 'Publicador',
        isServing: true,
        ageGroup: 'Adulto',
        parentIds: [],
        isHelperOnly: false,
        canPairWithNonParent: true,
        privileges: { canGiveTalks: true, canConductCBS: false, canReadCBS: false, canPray: true, canPreside: false },
        privilegesBySection: { canParticipateInMinistry: true },
        availability: { mode: 'always', exceptionDates: [] },
        aliases: []
    } as unknown as Publisher;
}

function makePart(overrides: Partial<WorkbookPart>): WorkbookPart {
    return {
        id: 'part-ajudante',
        weekId: '2026-11-23',
        weekDisplay: '23-29 de Novembro',
        date: '2026-11-23',
        section: 'Faça Seu Melhor no Ministério',
        tipoParte: 'Iniciando Conversas (Ajudante)',
        tituloParte: '4. Iniciando conversas - Ajudante',
        modalidade: 'Demonstração',
        funcao: 'Ajudante',
        seq: 10,
        status: 'PROPOSTA',
        resolvedPublisherId: 'pub-new',
        resolvedPublisherName: 'Substituto Teste',
        rawPublisherName: 'Substituto Teste',
        ...overrides
    } as WorkbookPart;
}

test('ReplacementOrchestrator - executeNotificationPipeline reports S-89 failures accurately instead of swallowing them', async () => {
    const origManualAlert = zapiOrchestrator.dispatchManualReplacementAlert;
    const origSendS89 = zapiOrchestrator.sendS89Direct;
    const origSummary = zapiOrchestrator.dispatchUpcomingAssignmentsSummary;
    const origPrepare = communicationService.prepareS89Message;

    zapiOrchestrator.dispatchManualReplacementAlert = async () => true;
    zapiOrchestrator.sendS89Direct = async () => ({ success: true, messageId: 'm1' });
    zapiOrchestrator.dispatchUpcomingAssignmentsSummary = async () => ({ success: true, skipped: true });
    communicationService.prepareS89Message = async () => ({ content: 'msg', availabilityUrl: '' } as any);

    try {
        const oldPub = makePub('pub-old', 'Anterior Teste', '27999990001');
        const newPub = makePub('pub-new', 'Substituto Teste', '27999990002');
        const partnerPub = makePub('pub-partner', 'Titular Teste', '27999990003');

        const partAjudante = makePart({});
        const partTitular = makePart({
            id: 'part-titular',
            tipoParte: 'Iniciando Conversas',
            tituloParte: '4. Iniciando conversas',
            funcao: 'Titular',
            seq: 9,
            resolvedPublisherId: 'pub-partner',
            resolvedPublisherName: 'Titular Teste',
            rawPublisherName: 'Titular Teste'
        });

        const failingS89Provider = async () => {
            throw new Error('TimeoutError: #s89-card-canvas not found');
        };

        const report = await replacementOrchestratorService.executeNotificationPipeline(
            partAjudante,
            'Anterior Teste',
            [oldPub, newPub, partnerPub],
            [partTitular, partAjudante],
            { notifyOld: true, notifyNew: true, notifyPartner: true },
            failingS89Provider
        );

        assert.equal(report.oldAttempted, true);
        assert.equal(report.oldNotified, true);
        assert.equal(report.newAttempted, true);
        assert.equal(report.newNotified, false);
        assert.equal(report.partnerAttempted, true);
        assert.equal(report.partnerNotified, false);
        assert.equal(report.errors.length, 2);
        assert.match(report.errors[0], /TimeoutError/);
    } finally {
        zapiOrchestrator.dispatchManualReplacementAlert = origManualAlert;
        zapiOrchestrator.sendS89Direct = origSendS89;
        zapiOrchestrator.dispatchUpcomingAssignmentsSummary = origSummary;
        communicationService.prepareS89Message = origPrepare;
    }
});

test('ReplacementOrchestrator - alertLeadershipAboutReplacement warns honestly when S-89 delivery failed', async () => {
    const origGetAdminPhones = zapiOrchestrator.getAdminPhones;
    const origSendTextDirect = zapiOrchestrator.sendTextDirect;
    const sentMessages: Array<{ phone: string; text: string }> = [];

    zapiOrchestrator.getAdminPhones = async () => [];
    zapiOrchestrator.sendTextDirect = async (phone: string, text: string) => {
        sentMessages.push({ phone, text });
        return { success: true, messageId: 'ok' };
    };

    try {
        const srvm = makePub('pub-srvm', 'SRVM Teste', '27999990099', 'Superintendente da Reunião Vida e Ministério');
        const part = makePart({});
        const failedDelivery: NotificationDeliveryReport = {
            oldAttempted: true,
            oldNotified: true,
            newAttempted: true,
            newNotified: false,
            partnerAttempted: true,
            partnerNotified: false,
            errors: ['Erro S-89 novo: TimeoutError']
        };

        await replacementOrchestratorService.alertLeadershipAboutReplacement(
            part,
            'Anterior Teste',
            'Substituto Teste',
            [srvm],
            false,
            failedDelivery
        );

        assert.equal(sentMessages.length, 1);
        assert.equal(sentMessages[0].phone, '27999990099');
        assert.doesNotMatch(sentMessages[0].text, /Ambos já foram notificados/i);
        assert.match(sentMessages[0].text, /Falha de Notificação/i);
        assert.match(sentMessages[0].text, /❌ Novo designado \(Substituto Teste\)/);
        assert.match(sentMessages[0].text, /❌ Parceiro\(a\) da dupla/);
    } finally {
        zapiOrchestrator.getAdminPhones = origGetAdminPhones;
        zapiOrchestrator.sendTextDirect = origSendTextDirect;
    }
});
