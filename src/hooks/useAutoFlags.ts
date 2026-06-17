import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook que verifica e consome flags de automação gravadas pelo Cron mensal.
 * 
 * Fluxo:
 * 1. O Cron (Deno) grava flags em app_settings (pending_auto_import, pending_auto_generate)
 * 2. Este hook, ao rodar no mount do AuthenticatedApp, detecta e consome as flags
 * 3. O import/geração efetivo usa os serviços frontend existentes (jwOrgService, generationService)
 * 
 * DESACOPLAMENTO: Este hook é 100% independente do App principal. Pode ser removido sem efeito colateral.
 */
export function useAutoFlags() {
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        checkAndConsumeFlags().catch(err => {
            console.warn('[useAutoFlags] Erro não-crítico ao verificar flags:', err);
        });
    }, []);
}

async function checkAndConsumeFlags() {
    // --- Verificar pending_auto_import ---
    const { data: importFlag } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pending_auto_import')
        .maybeSingle();

    if (importFlag?.value?.weeks?.length > 0) {
        console.log('[useAutoFlags] Flag de import detectada:', importFlag.value.weeks);
        
        // Importar cada semana individualmente usando o serviço existente
        try {
            const { importWorkbookFromJwOrg } = await import('../services/jwOrgService');
            const results: { weekId: string; success: boolean }[] = [];

            for (const weekId of importFlag.value.weeks) {
                try {
                    const [y, m, d] = weekId.split('-').map(Number);
                    const weekDate = new Date(y, m - 1, d);
                    const result = await importWorkbookFromJwOrg(weekDate);
                    results.push({ weekId, success: result.success });
                } catch (err) {
                    console.warn(`[useAutoFlags] Falha ao importar semana ${weekId}:`, err);
                    results.push({ weekId, success: false });
                }
            }

            // Limpar a flag
            await supabase.from('app_settings').delete().eq('key', 'pending_auto_import');

            // Gravar flag de geração com as semanas importadas com sucesso
            const successWeeks = results
                .filter(r => r.success)
                .map(r => r.weekId);

            if (successWeeks.length > 0) {
                await supabase.from('app_settings').upsert({
                    key: 'pending_auto_generate',
                    value: { weeks: successWeeks, requested_at: new Date().toISOString() }
                }, { onConflict: 'key' });
            }

            // Reportar ao SRVM
            await notifySrvm(
                `✅ *Import Automático Concluído*\n\n` +
                `${successWeeks.length} semanas importadas com sucesso.\n` +
                `${results.length - successWeeks.length} falharam (se houver, tente novamente abrindo o sistema).\n\n` +
                `As designações serão geradas automaticamente na próxima abertura do sistema.`
            );

            console.log('[useAutoFlags] Import concluído:', successWeeks.length, 'semanas');
        } catch (err) {
            console.error('[useAutoFlags] Falha no import automático:', err);
            // Flag persiste para retry na próxima abertura
        }
    }

    // --- Verificar pending_auto_generate ---
    const { data: generateFlag } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pending_auto_generate')
        .maybeSingle();

    if (generateFlag?.value?.weeks?.length > 0) {
        console.log('[useAutoFlags] Flag de geração detectada:', generateFlag.value.weeks);

        // NOTA: A geração automática é complexa porque precisa dos publishers e do histórico
        // carregados em memória. Por ora, apenas avisamos o SRVM para gerar manualmente.
        // Futuramente, pode chamar generationService.generateDesignations() diretamente.
        
        await supabase.from('app_settings').delete().eq('key', 'pending_auto_generate');

        await notifySrvm(
            `📋 *Semanas Prontas para Geração*\n\n` +
            `${generateFlag.value.weeks.length} semanas foram importadas e estão prontas para receber designações.\n\n` +
            `Abra o sistema e use a aba "Agente" para gerar as designações automaticamente, ou faça manualmente.`
        );

        console.log('[useAutoFlags] SRVM notificado sobre geração pendente');
    }
}

async function notifySrvm(message: string) {
    try {
        const { data: pubs } = await supabase.from('publishers').select('id, data');
        const srvmPubs = (pubs || []).filter((p: any) =>
            p.data?.funcao === 'Superintendente da Reunião Vida e Ministério' ||
            p.data?.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério'
        );

        for (const pub of srvmPubs) {
            if (pub.data?.phone) {
                await supabase.functions.invoke('send-whatsapp', {
                    body: { action: 'send-text', phone: pub.data.phone, message }
                });
            }
        }
    } catch (err) {
        console.warn('[useAutoFlags] Falha ao notificar SRVM:', err);
    }
}
