import test from 'node:test';
import assert from 'node:assert/strict';
import { zapiOrchestrator } from './zapiOrchestrator';
import { supabase } from '../lib/supabase';
import type { Publisher, WorkbookPart } from '../types';

// html2pdf.js (dependência indireta de s140GeneratorUnified) referencia `self` no carregamento UMD
if (typeof globalThis.self === 'undefined') {
    (globalThis as unknown as { self: typeof globalThis }).self = globalThis;
}

const { s140PackageService } = await import('./s140PackageService');

function makePublisher(id: string, name: string, phone: string): Publisher {
    return {
        id,
        name,
        phone,
        funcao: '',
        gender: 'brother',
        condition: 'Ancião',
        isServing: true,
        ageGroup: 'Adulto',
        parentIds: [],
        isHelperOnly: false,
        canPairWithNonParent: true,
        privileges: { canGiveTalks: true, canConductCBS: true, canReadCBS: true, canPray: true, canPreside: true },
        privilegesBySection: { canParticipateInMinistry: true },
        availability: { mode: 'always', exceptionDates: [] },
        aliases: [],
    } as unknown as Publisher;
}

test('s140PackageService - resolvePublisherIdByPhone matches normalized tail and ignores groups', () => {
    const pubs = [
        makePublisher('pub-srvm', 'Irmão SRVM', '+55 (00) 80001-1111'),
        makePublisher('pub-pres', 'Irmão Presidente', '00800022222'),
    ];

    assert.equal(s140PackageService.resolvePublisherIdByPhone('5500800011111', pubs), 'pub-srvm');
    assert.equal(s140PackageService.resolvePublisherIdByPhone('00800022222', pubs), 'pub-pres');
    assert.equal(s140PackageService.resolvePublisherIdByPhone('120363000000000000-group', pubs), undefined);
    assert.equal(s140PackageService.resolvePublisherIdByPhone('120363000000000000@g.us', pubs), undefined);
    assert.equal(s140PackageService.resolvePublisherIdByPhone('5500800099999', pubs), undefined);
});

test('s140PackageService - resolveWeekPresident returns id, name, and phone', () => {
    const pubs = [makePublisher('pub-pres', 'Presidente Teste', '00800022222')];
    const parts = [
        {
            id: 'p-1',
            weekId: '2026-11-23',
            tipoParte: 'Presidente',
            tituloParte: 'Presidente da Reunião',
            resolvedPublisherId: 'pub-pres',
            resolvedPublisherName: 'Presidente Teste',
        } as WorkbookPart,
    ];

    const pres = s140PackageService.resolveWeekPresident(parts, pubs);
    assert.deepEqual(pres, {
        id: 'pub-pres',
        name: 'Presidente Teste',
        phone: '00800022222',
    });
});

test('s140PackageService - handlePartAdjustment logs real SUCCESS/ERROR status, messageId, and publisherId', async () => {
    const origIsCurrent = s140PackageService.isCurrentWeek;
    const origResolveRecipients = s140PackageService.resolveFullPackageRecipients;
    const origLoadSnapshot = s140PackageService.loadSnapshot;
    const origSaveSnapshot = s140PackageService.saveSnapshot;
    const origSendImage = zapiOrchestrator.sendImageDirect;
    const origLogDispatch = zapiOrchestrator.logDispatch;
    const origFrom = supabase.from;
    const origSetTimeout = globalThis.setTimeout;

    const loggedCalls: Array<{
        partId: string | null;
        dispatchType: string;
        phone: string;
        status: string;
        messageId?: string;
        publisherId?: string;
    }> = [];

    const todayWeekId = '2026-11-23';
    const pubs = [
        makePublisher('pub-srvm', 'Irmão SRVM', '5500800011111'),
        makePublisher('pub-pres', 'Presidente Teste', '5500800022222'),
    ];
    const weekParts: WorkbookPart[] = [
        {
            id: 'part-pres',
            weekId: todayWeekId,
            date: todayWeekId,
            tipoParte: 'Presidente',
            tituloParte: 'Presidente da Reunião',
            resolvedPublisherId: 'pub-pres',
            resolvedPublisherName: 'Presidente Teste',
        } as WorkbookPart,
        {
            id: 'part-target',
            weekId: todayWeekId,
            date: todayWeekId,
            tipoParte: 'Leitura da Bíblia',
            tituloParte: '3. Leitura da Bíblia',
            resolvedPublisherId: 'pub-new',
            resolvedPublisherName: 'Novo Titular',
        } as WorkbookPart,
    ];

    s140PackageService.isCurrentWeek = () => true;
    s140PackageService.resolveFullPackageRecipients = async () => ['120363000000000000-group', '5500800011111'];
    s140PackageService.loadSnapshot = async () => ({ lastDispatchedAt: '', weeks: {} });
    s140PackageService.saveSnapshot = async () => {};

    // Remove atraso de 3s de jittering durante teste determinístico
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void) => {
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    (supabase as unknown as { from: typeof supabase.from }).from = ((table: string) => {
        if (table === 'app_settings') {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: { value: { [todayWeekId]: '2026-11-20T00:00:00Z' } }, error: null }),
                    }),
                }),
            };
        }
        return {
            select: () => ({
                in: async () => ({ data: [], error: null }),
            }),
        };
    }) as unknown as typeof supabase.from;

    zapiOrchestrator.sendImageDirect = async (phone: string) => {
        if (phone === '5500800011111') {
            return { success: false, error: 'Z-API disconnected' };
        }
        if (phone === '5500800022222') {
            return { success: true, messageId: 'msg-pres-1' };
        }
        return { success: true, messageId: 'msg-grp-1' };
    };

    zapiOrchestrator.logDispatch = async (partId, dispatchType, phone, status, messageId, publisherId) => {
        loggedCalls.push({ partId, dispatchType: String(dispatchType), phone, status, messageId, publisherId });
    };

    try {
        await s140PackageService.handlePartAdjustment({
            part: weekParts[1],
            oldPublisherName: 'Antigo Titular',
            newPublisherName: 'Novo Titular',
            weekParts,
            publishers: pubs,
            s140Provider: async () => 'data:image/png;base64,FAKE',
        });

        assert.equal(loggedCalls.length, 3);
        assert.deepEqual(loggedCalls[0], {
            partId: null,
            dispatchType: 'S140_PACOTE_EMERGENCIA',
            phone: '120363000000000000-group',
            status: 'SUCCESS',
            messageId: 'msg-grp-1',
            publisherId: undefined,
        });
        assert.deepEqual(loggedCalls[1], {
            partId: null,
            dispatchType: 'S140_PACOTE_EMERGENCIA',
            phone: '5500800011111',
            status: 'ERROR',
            messageId: undefined,
            publisherId: 'pub-srvm',
        });
        assert.deepEqual(loggedCalls[2], {
            partId: null,
            dispatchType: 'S140_PRESIDENTE_INDIVIDUAL',
            phone: '5500800022222',
            status: 'SUCCESS',
            messageId: 'msg-pres-1',
            publisherId: 'pub-pres',
        });
    } finally {
        s140PackageService.isCurrentWeek = origIsCurrent;
        s140PackageService.resolveFullPackageRecipients = origResolveRecipients;
        s140PackageService.loadSnapshot = origLoadSnapshot;
        s140PackageService.saveSnapshot = origSaveSnapshot;
        zapiOrchestrator.sendImageDirect = origSendImage;
        zapiOrchestrator.logDispatch = origLogDispatch;
        (supabase as unknown as { from: typeof supabase.from }).from = origFrom;
        globalThis.setTimeout = origSetTimeout;
    }
});
