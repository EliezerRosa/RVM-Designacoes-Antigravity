// ============================================================================
// Edge Function: cron-alert-notifications
//
// Funcionalidade NOVA e ABSURDAMENTE DESACOPLADA: Notifica��es de Alertas e
// Agendas. Regras de isolamento:
//   - SOMENTE LEITURA em tabelas existentes (zapi_dispatch_log, workbook_parts,
//     publishers, app_settings). Nunca escreve nelas.
//   - Escreve APENAS na tabela pr�pria `alert_notification_log` (idempot�ncia).
//   - N�o altera status de partes, n�o gera S-89/S-140, n�o toca nos fluxos
//     do cron-whatsapp-reminders nem do bot�o Publicar.
//   - Envio via Edge Function `send-whatsapp` j� existente (canal compartilhado
//     por contrato, n�o por acoplamento de c�digo).
//
// O que faz: transforma SINALIZA��ES j� registradas em log em NOTIFICA��ES
// proativas ao SRVM/Ajudante:
//   A1 � Erros de despacho do dia anterior (zapi_dispatch_log status=ERROR)
//   A2 � Flag de import pendente (app_settings.pending_auto_import)
//   A3 � Agenda D-15: semanas a ?15 dias sem S-89 publicado (sem PUBLICACAO_S89)
//   A4 � Partes �rf�s: semana publicada, mas parte design�vel sem PUBLICACAO_S89
//
// Seguran�a: FAIL-CLOSED � exige CRON_SECRET configurado E correto.
// Kill-switch pr�prio: app_settings.alert_notifications_active (default: off).
// ============================================================================

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

// Ambiente Deno (Edge Function) � declara��o para o analisador local (Node/TS).
declare const Deno: { env: { get(name: string): string | undefined } };

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://rvm-designacoes-antigravity.vercel.app";
const RECIPIENT_FUNCOES = [
    'Superintendente da Reuni�o Vida e Minist�rio',
    'Ajudante do Superintendente da Reuni�o Vida e Minist�rio',
];

interface Recipient { id: string; name: string; phone: string }
interface Alert { key: string; type: string; message: string; payload?: Record<string, unknown> }

// ----------------------------------------------------------------------------
// Utilit�rios (locais � sem imports de c�digo existente)
// ----------------------------------------------------------------------------

/** Hoje � meia-noite no fuso de Bras�lia (UTC-3, sem DST desde 2019). */
function todayBrasilia(): Date {
    const now = new Date();
    const brasilia = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return new Date(Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), brasilia.getUTCDate()));
}

function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function calculateMeetingDate(weekId: string, meetingDays: Record<string, number>): Date | null {
    const dp = weekId.split('-');
    if (dp.length !== 3) return null;
    const base = new Date(Date.UTC(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2])));
    const dow = meetingDays[weekId] ?? 4;
    const days = (dow - base.getUTCDay() + 7) % 7;
    const meeting = new Date(base);
    meeting.setUTCDate(meeting.getUTCDate() + days);
    return meeting;
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
    try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ phone, message }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Envio idempotente e at�mico: INSERT com constraint �nica (alert_key, phone).
 * Se o insert conflitar, o alerta j� foi tratado � n�o reenvia.
 */
async function notifyOnce(alert: Alert, recipient: Recipient): Promise<boolean> {
    const { error: insertError } = await supabase
        .from('alert_notification_log')
        .insert({
            alert_key: alert.key,
            alert_type: alert.type,
            recipient_phone: recipient.phone,
            status: 'PENDING',
            payload: alert.payload ?? null,
        });

    if (insertError) {
        // 23505 = unique_violation ? j� notificado (idempot�ncia at�mica)
        if ((insertError as { code?: string }).code === '23505') return false;
        console.error('[cron-alerts] Falha ao registrar alerta:', insertError);
        return false;
    }

    const ok = await sendWhatsApp(recipient.phone, alert.message);
    await supabase
        .from('alert_notification_log')
        .update({ status: ok ? 'SUCCESS' : 'ERROR' })
        .eq('alert_key', alert.key)
        .eq('recipient_phone', recipient.phone);

    // Em caso de ERROR, remove o registro para permitir retry na pr�xima execu��o.
    if (!ok) {
        await supabase
            .from('alert_notification_log')
            .delete()
            .eq('alert_key', alert.key)
            .eq('recipient_phone', recipient.phone)
            .eq('status', 'ERROR');
    }
    return ok;
}

// ----------------------------------------------------------------------------
// Coletores de alertas (cada um l� sinaliza��es existentes, read-only)
// ----------------------------------------------------------------------------

/** A1 � Erros de despacho registrados no dia anterior/atual. */
async function collectDispatchErrors(today: Date): Promise<Alert[]> {
    const since = new Date(today);
    since.setUTCDate(since.getUTCDate() - 1);

    const { data, error } = await supabase
        .from('zapi_dispatch_log')
        .select('part_id, dispatch_type, recipient_phone, created_at')
        .eq('status', 'ERROR')
        .gte('created_at', since.toISOString());

    if (error || !data || data.length === 0) return [];

    const lines = data.map((r: { dispatch_type: string; recipient_phone: string }) =>
        `� ${r.dispatch_type} ? ${r.recipient_phone || 'sem telefone'}`);

    return [{
        key: `DISPATCH_ERROR_${isoDay(today)}`,
        type: 'DISPATCH_ERROR',
        payload: { count: data.length },
        message: `?? *Alerta � Falhas de envio (${data.length})*\n\n` +
            `Os seguintes despachos falharam nas �ltimas 24h:\n${lines.slice(0, 15).join('\n')}` +
            (lines.length > 15 ? `\n� e mais ${lines.length - 15}.` : '') +
            `\n\nVerifique a conex�o do WhatsApp e os telefones cadastrados.`,
    }];
}

/** A2 � Flag de import pendente sinalizada em app_settings. */
async function collectPendingImport(today: Date): Promise<Alert[]> {
    const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pending_auto_import')
        .maybeSingle();

    const weeks: string[] = data?.value?.weeks || [];
    if (weeks.length === 0) return [];

    return [{
        key: `PENDING_IMPORT_${isoDay(today)}`,
        type: 'PENDING_IMPORT',
        payload: { weeks },
        message: `?? *Agenda � Importa��o pendente*\n\n` +
            `H� *${weeks.length}* semana(s) de apostila aguardando importa��o:\n` +
            weeks.map(w => `� ${w}`).join('\n') +
            `\n\nAbra o sistema para importar:\n?? ${APP_BASE_URL}`,
    }];
}

/** A3 � Agenda D-15: semana com reuni�o a ?15 dias sem nenhum S-89 publicado. */
/** A4 � Partes �rf�s: semana j� publicada, mas com parte design�vel sem S-89. */
async function collectPublicationGaps(today: Date): Promise<Alert[]> {
    const alerts: Alert[] = [];

    const { data: meetingDayData } = await supabase
        .from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays: Record<string, number> = meetingDayData?.value || {};

    const { data: publishedData } = await supabase
        .from('app_settings').select('value').eq('key', 'week_published').maybeSingle();
    const publishedWeeks = (publishedData?.value || {}) as Record<string, string>;

    const { data: parts } = await supabase
        .from('workbook_parts')
        .select('id, week_id, tipo_parte, status, resolved_publisher_id, raw_publisher_name')
        .in('status', ['DESIGNADA', 'PROPOSTA']);
    if (!parts || parts.length === 0) return alerts;

    // Semanas futuras a ?15 dias
    const weekIds: string[] = Array.from(new Set<string>(parts.map((p: { week_id: string }) => p.week_id)));
    const nearWeeks: string[] = weekIds.filter((w: string) => {
        const md = calculateMeetingDate(w, meetingDays);
        if (!md) return false;
        const diffDays = Math.ceil((md.getTime() - today.getTime()) / 86400000);
        return diffDays >= 0 && diffDays <= 15;
    });
    if (nearWeeks.length === 0) return alerts;

    // S-89 j� publicados dessas semanas (read-only no log existente)
    const nearPartIds = parts
        .filter((p: { week_id: string }) => nearWeeks.indexOf(p.week_id) >= 0)
        .map((p: { id: string }) => p.id);
    const { data: s89Logs } = await supabase
        .from('zapi_dispatch_log')
        .select('part_id')
        .eq('dispatch_type', 'PUBLICACAO_S89')
        .eq('status', 'SUCCESS')
        .in('part_id', nearPartIds);
    const s89Set = new Set((s89Logs || []).map((l: { part_id: string }) => l.part_id));

    for (const weekId of nearWeeks) {
        const weekParts = parts.filter((p: { week_id: string }) => p.week_id === weekId);
        const assigned = weekParts.filter((p: { resolved_publisher_id: string | null; raw_publisher_name: string }) =>
            p.resolved_publisher_id || p.raw_publisher_name);
        const withS89 = assigned.filter((p: { id: string }) => s89Set.has(p.id));
        const isPublished = Boolean(publishedWeeks[weekId]);

        if (!isPublished && withS89.length === 0 && assigned.length > 0) {
            // A3 � semana inteira sem publica��o
            alerts.push({
                key: `WEEK_UNPUBLISHED_D15_${weekId}`,
                type: 'WEEK_UNPUBLISHED_D15',
                payload: { weekId, assignedCount: assigned.length },
                message: `?? *Agenda � Publica��o pendente*\n\n` +
                    `A semana *${weekId}* tem reuni�o em ?15 dias e ainda *n�o foi publicada* ` +
                    `(${assigned.length} parte(s) designada(s) sem S-89 enviado).\n\n` +
                    `Abra a aba Apostila e use o bot�o *Publicar*:\n?? ${APP_BASE_URL}`,
            });
        } else if (isPublished && withS89.length < assigned.length) {
            // A4 � partes adicionadas ap�s a publica��o, sem S-89
            const orphans = assigned.filter((p: { id: string }) => !s89Set.has(p.id));
            alerts.push({
                key: `ORPHAN_PARTS_${weekId}_${orphans.length}`,
                type: 'ORPHAN_PARTS',
                payload: { weekId, orphanIds: orphans.map((p: { id: string }) => p.id) },
                message: `?? *Alerta � Partes sem S-89 em semana publicada*\n\n` +
                    `A semana *${weekId}* j� foi publicada, mas *${orphans.length}* parte(s) ` +
                    `designada(s) n�o t�m S-89 enviado:\n` +
                    orphans.slice(0, 10).map((p: { tipo_parte: string }) => `� ${p.tipo_parte}`).join('\n') +
                    `\n\nConsidere republicar a semana na aba Apostila.\n?? ${APP_BASE_URL}`,
            });
        }
    }

    return alerts;
}

// ----------------------------------------------------------------------------
// Ponto de entrada
// ----------------------------------------------------------------------------

serve(async (req: Request) => {
    // FAIL-CLOSED: exige secret configurado E correto.
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (!expectedSecret || req.headers.get("x-cron-secret") !== expectedSecret) {
        return new Response("Forbidden", { status: 403 });
    }

    // Kill-switch pr�prio (independente do zapi_automation_active).
    const { data: activeData } = await supabase
        .from('app_settings').select('value').eq('key', 'alert_notifications_active').maybeSingle();
    const isActive = activeData?.value === true || activeData?.value === 'true';
    if (!isActive) {
        return new Response(JSON.stringify({ success: true, disabled: true }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    const today = todayBrasilia();

    // Destinat�rios: SRVM + Ajudante (read-only em publishers)
    const { data: publishersRaw } = await supabase.from('publishers').select('id, data');
    const recipients: Recipient[] = (publishersRaw || [])
        .map((p: { id: string; data?: Record<string, unknown> }) => ({
            id: p.id,
            name: String(p.data?.name ?? ''),
            phone: String(p.data?.phone ?? ''),
            funcao: String(p.data?.funcao ?? ''),
        }))
        .filter((p: { funcao: string; phone: string }) => RECIPIENT_FUNCOES.indexOf(p.funcao) >= 0 && p.phone)
        .map(({ id, name, phone }: Recipient) => ({ id, name, phone }));

    if (recipients.length === 0) {
        return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no recipients' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    // Coletar alertas de todas as sinaliza��es
    const alerts: Alert[] = [
        ...(await collectDispatchErrors(today)),
        ...(await collectPendingImport(today)),
        ...(await collectPublicationGaps(today)),
    ];

    let sent = 0;
    for (const alert of alerts) {
        for (const recipient of recipients) {
            if (await notifyOnce(alert, recipient)) sent++;
        }
    }

    console.log(`[cron-alert-notifications] ${alerts.length} alerta(s) coletado(s), ${sent} notifica��o(�es) enviada(s).`);
    return new Response(JSON.stringify({ success: true, alerts: alerts.length, sent }), {
        headers: { 'Content-Type': 'application/json' },
    });
});
