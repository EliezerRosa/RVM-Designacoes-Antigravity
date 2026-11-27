import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationService, type NotificationRecord } from './communicationService';
import { supabase } from '../lib/supabase';

test('communicationService.updateNotification mirrors PREPARED -> SENT transition to zapi_dispatch_log once', async () => {
    const origFrom = supabase.from;
    const zapiInserts: Array<Record<string, unknown>> = [];
    let currentStatus: 'PREPARED' | 'SENT' = 'PREPARED';

    (supabase as unknown as { from: typeof supabase.from }).from = ((table: string) => {
        if (table === 'notifications') {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: { status: currentStatus }, error: null }),
                    }),
                }),
                update: (updates: Partial<NotificationRecord>) => ({
                    eq: () => ({
                        select: () => ({
                            single: async () => {
                                if (updates.status === 'SENT') currentStatus = 'SENT';
                                return {
                                    data: {
                                        id: 'notif-1',
                                        type: 'S89',
                                        recipient_name: 'Publicador Teste',
                                        recipient_phone: '5500800033333',
                                        content: 'Mensagem S-89',
                                        status: currentStatus,
                                        metadata: { partId: 'part-123', publisherId: 'pub-123' },
                                        ...updates,
                                    },
                                    error: null,
                                };
                            },
                        }),
                    }),
                }),
            };
        }
        if (table === 'zapi_dispatch_log') {
            return {
                insert: async (payload: Record<string, unknown>) => {
                    zapiInserts.push(payload);
                    return { data: null, error: null };
                },
            };
        }
        throw new Error(`Unexpected table: ${table}`);
    }) as unknown as typeof supabase.from;

    try {
        // 1. Edição de texto apenas (sem status=SENT) NÃO deve gravar em zapi_dispatch_log
        await communicationService.updateNotification('notif-1', { content: 'Texto editado' });
        assert.equal(zapiInserts.length, 0);

        // 2. Transição PREPARED -> SENT deve gravar 1 registro canônico SUCCESS_MANUAL
        await communicationService.updateNotification('notif-1', { status: 'SENT' });
        assert.equal(zapiInserts.length, 1);
        assert.deepEqual(zapiInserts[0], {
            part_id: 'part-123',
            dispatch_type: 'PUBLICACAO_S89',
            recipient_phone: '5500800033333',
            status: 'SUCCESS_MANUAL',
            message_id: 'MANUAL_WHATSAPP',
            publisher_id: 'pub-123',
        });

        // 3. Clique repetido em Enviar (já SENT) NÃO deve duplicar linha no zapi_dispatch_log
        await communicationService.updateNotification('notif-1', { status: 'SENT' });
        assert.equal(zapiInserts.length, 1);
    } finally {
        (supabase as unknown as { from: typeof supabase.from }).from = origFrom;
    }
});

test('communicationService.updateNotification ignores non-S89/S140 types for canonical dispatch log', async () => {
    const origFrom = supabase.from;
    const zapiInserts: Array<Record<string, unknown>> = [];

    (supabase as unknown as { from: typeof supabase.from }).from = ((table: string) => {
        if (table === 'notifications') {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({ data: { status: 'PREPARED' }, error: null }),
                    }),
                }),
                update: () => ({
                    eq: () => ({
                        select: () => ({
                            single: async () => ({
                                data: {
                                    id: 'notif-2',
                                    type: 'ANNOUNCEMENT',
                                    recipient_name: 'Grupo',
                                    content: 'Aviso',
                                    status: 'SENT',
                                    metadata: {},
                                },
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        }
        if (table === 'zapi_dispatch_log') {
            return {
                insert: async (payload: Record<string, unknown>) => {
                    zapiInserts.push(payload);
                    return { data: null, error: null };
                },
            };
        }
        throw new Error(`Unexpected table: ${table}`);
    }) as unknown as typeof supabase.from;

    try {
        await communicationService.updateNotification('notif-2', { status: 'SENT' });
        assert.equal(zapiInserts.length, 0);
    } finally {
        (supabase as unknown as { from: typeof supabase.from }).from = origFrom;
    }
});
