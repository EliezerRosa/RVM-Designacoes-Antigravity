// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// CONSTANTES E TIPOS
// ============================================================================

/** Partes automáticas que NÃO recebem lembretes individuais */
const NOISE_PARTS = [
    'cântico', 'cantico', 'oração inicial', 'oracao inicial',
    'comentários iniciais', 'comentarios iniciais',
    'comentários finais', 'comentarios finais',
    'elogios e conselhos', 'elogios',
];

/** Conditions que gozam de aquiescência tácita (não precisam confirmar para receber lembretes) */
const ACQUIESCENCE_CONDITIONS = ['Ancião', 'Anciao', 'Servo Ministerial'];

const DIAS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

interface PublisherData {
    id: string;
    name: string;
    phone: string;
    gender: string;      // 'brother' | 'sister'
    condition: string;   // 'Ancião' | 'Servo Ministerial' | 'Publicador'
    funcao: string | null;
    requestedNoParticipation: boolean;
    isHelperOnly: boolean;
    isNotQualified: boolean;
    notQualifiedReason: string;
    noParticipationReason: string;
}

interface PartData {
    id: string;
    tipo_parte: string;
    part_title: string;
    week_id: string;
    status: string;
    funcao: string;               // 'Titular' | 'Ajudante'
    raw_publisher_name: string;
    resolved_publisher_id: string | null;
    section: string;
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS (preservadas do original + novas)
// ============================================================================

async function checkDispatched(partId: string, dispatchType: string) {
    const { data } = await supabase
        .from('zapi_dispatch_log')
        .select('id')
        .eq('part_id', partId)
        .eq('dispatch_type', dispatchType)
        .eq('status', 'SUCCESS')
        .maybeSingle();
    return !!data;
}

async function logDispatch(partId: string, dispatchType: string, phone: string, status: string) {
    await supabase.from('zapi_dispatch_log').insert({
        part_id: partId,
        dispatch_type: dispatchType,
        recipient_phone: phone,
        status: status
    });
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ phone, message })
    });
    return res.ok;
}

/** Verifica se um tipo de parte é "ruído" (não recebe lembretes individuais) */
function isNoisePart(tipoParte: string): boolean {
    const lower = tipoParte.toLowerCase().trim();
    return NOISE_PARTS.some(noise => lower.includes(noise));
}

/** Saudação dinâmica pelo fuso horário de Brasília (UTC-3) */
function getGreeting(): string {
    const now = new Date();
    // Converter para hora de Brasília (UTC-3)
    const brasiliaHour = (now.getUTCHours() - 3 + 24) % 24;
    if (brasiliaHour >= 5 && brasiliaHour < 12) return 'Bom dia';
    if (brasiliaHour >= 12 && brasiliaHour < 18) return 'Boa tarde';
    return 'Boa noite';
}

/** Pronome pelo gênero do publisher */
function getHonorific(gender: string): string {
    return gender === 'sister' ? 'Irmã' : 'Irmão';
}

/** Formata a data da reunião para exibição */
function formatMeetingDate(date: Date): string {
    return `${DIAS_PT[date.getDay()]}, ${date.getDate()} de ${MESES_PT[date.getMonth()]}`;
}

/** Calcula a data da reunião a partir do week_id e do dia configurado */
function calculateMeetingDate(weekId: string, meetingDays: Record<string, number>): Date | null {
    const dp = weekId.split('-');
    if (dp.length !== 3) return null;
    const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    const dow = meetingDays[weekId] ?? 4; // fallback quinta-feira
    const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
    const meetingDate = new Date(baseDate);
    meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
    return meetingDate;
}

// ============================================================================
// BUILDERS DE MENSAGEM (Templates por tipo de parte)
// ============================================================================

function buildReminderMessage(
    part: PartData,
    pub: PublisherData,
    meetingDateLabel: string,
    reminderLabel: string,
    partnerInfo?: string
): string {
    const greeting = getGreeting();
    const honorific = getHonorific(pub.gender);
    const tipoParte = part.tipo_parte || '';
    const titulo = part.part_title || '';

    let body = `${greeting}, ${honorific} ${pub.name}!\n`;
    body += `Lembrando que ${reminderLabel} para sua parte na reunião de *${meetingDateLabel}*:\n\n`;
    body += `📖 *${tipoParte}*\n`;
    if (titulo) body += `🎯 *${titulo}*\n`;

    // Templates por tipo de parte
    const lower = tipoParte.toLowerCase();
    if (lower.includes('leitura da bíblia') || lower.includes('leitura da biblia')) {
        body += `\n📗 Pratique a leitura em voz alta para garantir fluência e pronúncia clara.`;
    } else if (lower.includes('iniciando') || lower.includes('cultivando') || lower.includes('fazendo disc') || lower.includes('explicando')) {
        body += `\n🎭 Lembre-se de ensaiar a demonstração com antecedência.`;
        if (partnerInfo) {
            body += `\n👥 Seu parceiro de ensaio: ${partnerInfo}`;
        }
    } else if (lower.includes('discurso tesouros') || lower.includes('joias espirituais')) {
        body += `\n🎤 Revise bem o conteúdo e o tempo disponível para seu discurso.`;
    } else if (lower.includes('dirigente ebc') || lower.includes('leitor ebc')) {
        body += `\n📚 Prepare-se bem para conduzir o estudo com clareza e edificação.`;
    } else if (lower.includes('presidente')) {
        body += `\n🎙️ Revise o programa da semana para conduzir a reunião com fluidez.`;
    } else if (lower.includes('oração final') || lower.includes('oracao final')) {
        body += `\n🙏 Prepare uma oração que reflita os pontos abordados na reunião.`;
    }

    body += `\n\nPor favor, garanta que seu preparo esteja em dia. ✨`;
    return body;
}

function buildChargeD9Message(
    part: PartData,
    pub: PublisherData,
    meetingDateLabel: string,
    confirmLink: string
): string {
    const greeting = getGreeting();
    const honorific = getHonorific(pub.gender);

    let msg = `${greeting}, ${honorific} ${pub.name}!\n\n`;
    msg += `Você recebeu uma designação para a reunião de *${meetingDateLabel}*:\n\n`;
    msg += `📖 *${part.tipo_parte}*\n`;
    if (part.part_title) msg += `🎯 *${part.part_title}*\n`;
    msg += `\nPor favor, confirme se poderá participar clicando no link abaixo:\n`;
    msg += `👉 ${confirmLink}\n\n`;
    msg += `Se não puder, use o mesmo link para nos avisar. Contamos com você! 🙏`;
    return msg;
}

// ============================================================================
// CICLO DIÁRIO
// ============================================================================

async function runDailyCycle(
    parts: PartData[],
    publishers: PublisherData[],
    meetingDays: Record<string, number>,
    today: Date
): Promise<{ sentCount: number; noPhoneList: string[] }> {
    let sentCount = 0;
    const noPhoneList: string[] = [];

    for (const part of parts) {
        // --- FILTRO DE RUÍDO ---
        if (isNoisePart(part.tipo_parte)) continue;

        // --- CALCULAR DATA DA REUNIÃO ---
        const meetingDate = calculateMeetingDate(part.week_id, meetingDays);
        if (!meetingDate) continue;

        const diffTime = meetingDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // --- RESOLVER PUBLICADOR ---
        let pub: PublisherData | undefined;
        if (part.resolved_publisher_id) {
            pub = publishers.find(p => p.id === part.resolved_publisher_id);
        }
        if (!pub && part.raw_publisher_name) {
            pub = publishers.find(p => p.name.trim() === part.raw_publisher_name.trim());
        }
        if (!pub) continue;

        // --- BLOQUEIO MESTRE: S-89 foi enviado? ---
        const s89Sent = await checkDispatched(part.id, 'PUBLICACAO_S89');

        const meetingDateLabel = formatMeetingDate(meetingDate);

        // ===================== D-15: AUTO-PUBLICAÇÃO =====================
        // TODO: Implementar quando week_publication_status existir.
        // Por hora, a publicação manual (botão no modal S-89) continua sendo
        // o fluxo padrão. O Cron apenas processa lembretes para partes já publicadas.

        // ===================== D-9: COBRANÇA =====================
        if (diffDays === 9 && part.status === 'PROPOSTA') {
            if (await checkDispatched(part.id, 'COBRANCA_D9')) continue;
            if (!pub.phone) { noPhoneList.push(`${pub.name} — ${part.tipo_parte} (D-9)`); continue; }

            const confirmLink = `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&id=${part.id}&publisherId=${pub.id}&token=auto`;
            const msg = buildChargeD9Message(part, pub, meetingDateLabel, confirmLink);
            const success = await sendWhatsApp(pub.phone, msg);
            await logDispatch(part.id, 'COBRANCA_D9', pub.phone, success ? 'SUCCESS' : 'ERROR');
            if (success) sentCount++;
            continue;
        }

        // ===================== D-7 e D-2: LEMBRETES =====================
        let dispatchType = '';
        let reminderLabel = '';

        if (diffDays === 7) {
            dispatchType = 'LEMBRETE_D7';
            reminderLabel = 'faltam apenas 7 dias';
        } else if (diffDays === 2) {
            dispatchType = 'LEMBRETE_D2';
            reminderLabel = 'faltam 2 dias';
        }

        if (!dispatchType) continue;

        // --- BLOQUEIO MESTRE: Sem S-89 enviado → sem lembrete ---
        if (!s89Sent) {
            console.log(`[cron] Parte ${part.id} (${part.tipo_parte}) não teve S-89 enviado. Pulando lembrete.`);
            continue;
        }

        // --- REGRA DE STATUS ---
        // DESIGNADA → sempre recebe lembrete
        // PROPOSTA → só se for Ancião/SM (Aquiescência tácita)
        if (part.status === 'DESIGNADA') {
            // OK — continua
        } else if (part.status === 'PROPOSTA') {
            if (!ACQUIESCENCE_CONDITIONS.includes(pub.condition)) {
                // Publicador comum com PROPOSTA → já recebeu D-9, não recebe lembrete normal
                continue;
            }
            // Ancião/SM em PROPOSTA → Aquiescência, recebe lembrete
        } else {
            continue; // Status inesperado
        }

        // --- IDEMPOTÊNCIA ---
        if (await checkDispatched(part.id, dispatchType)) continue;

        // --- TELEFONE ---
        if (!pub.phone) {
            noPhoneList.push(`${pub.name} — ${part.tipo_parte} (${dispatchType})`);
            continue;
        }

        // --- PARCEIRO DE ENSAIO (D-7 apenas) ---
        let partnerInfo: string | undefined;
        if (dispatchType === 'LEMBRETE_D7' && part.funcao === 'Titular') {
            // Buscar ajudante da mesma parte (mesmo week_id, tipo semelhante, funcao=Ajudante)
            const ajudantePart = parts.find(p =>
                p.week_id === part.week_id &&
                p.funcao === 'Ajudante' &&
                p.tipo_parte.replace(' (Ajudante)', '') === part.tipo_parte &&
                p.resolved_publisher_id
            );
            if (ajudantePart) {
                const ajudante = publishers.find(p => p.id === ajudantePart.resolved_publisher_id);
                if (ajudante) {
                    partnerInfo = `*${ajudante.name}*${ajudante.phone ? ` (${ajudante.phone})` : ''}`;
                }
            }
        } else if (dispatchType === 'LEMBRETE_D7' && part.funcao === 'Ajudante') {
            // Se é ajudante, buscar o titular
            const titularPart = parts.find(p =>
                p.week_id === part.week_id &&
                p.funcao === 'Titular' &&
                part.tipo_parte.includes(p.tipo_parte) &&
                p.resolved_publisher_id
            );
            if (titularPart) {
                const titular = publishers.find(p => p.id === titularPart.resolved_publisher_id);
                if (titular) {
                    partnerInfo = `*${titular.name}*${titular.phone ? ` (${titular.phone})` : ''}`;
                }
            }
        }

        // --- CONSTRUIR E ENVIAR ---
        const msg = buildReminderMessage(part, pub, meetingDateLabel, reminderLabel, partnerInfo);
        const success = await sendWhatsApp(pub.phone, msg);
        await logDispatch(part.id, dispatchType, pub.phone, success ? 'SUCCESS' : 'ERROR');
        if (success) sentCount++;
    }

    return { sentCount, noPhoneList };
}

// ============================================================================
// CICLO MENSAL (só roda no dia 1º do mês)
// ============================================================================

async function runMonthlyCycle(publishers: PublisherData[]): Promise<string[]> {
    const reports: string[] = [];
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // --- M1: FLAG DE IMPORT AUTOMÁTICO ---
    const today = new Date();
    const weekIds: string[] = [];
    // Gerar week_ids dos próximos 60 dias (segundas-feiras)
    for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        // Se for segunda-feira
        if (d.getDay() === 1) {
            const wid = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            weekIds.push(wid);
        }
    }

    if (weekIds.length > 0) {
        // Verificar quais já existem no banco
        const { data: existingWeeks } = await supabase
            .from('workbook_parts')
            .select('week_id')
            .in('week_id', weekIds);

        const existingSet = new Set((existingWeeks || []).map((w: any) => w.week_id));
        const missingWeeks = weekIds.filter(w => !existingSet.has(w));

        if (missingWeeks.length > 0) {
            // Gravar flag para o frontend consumir
            await supabase.from('app_settings').upsert({
                key: 'pending_auto_import',
                value: { weeks: missingWeeks, requested_at: new Date().toISOString() }
            }, { onConflict: 'key' });

            reports.push(`📥 ${missingWeeks.length} semanas novas disponíveis para importação.`);
        }
    }

    // --- M2: RECONVITE — requestedNoParticipation ---
    // NÃO enviar para quem está com flag NÃO APTO (isNotQualified)
    const noParticipationPubs = publishers.filter(p => p.requestedNoParticipation && p.phone && !p.isNotQualified);
    for (const pub of noParticipationPubs) {
        const dispatchKey = `RECONVITE_MENSAL_${currentMonth}_${pub.id}`;
        if (await checkDispatched(pub.id, dispatchKey)) continue;

        const honorific = getHonorific(pub.gender);
        const greeting = getGreeting();
        const msg = `${greeting}, ${honorific} ${pub.name}! 🌸\n\n` +
            `Gostaríamos gentilmente de saber se já se sente à vontade para voltar a receber designações na Reunião Vida e Ministério.\n\n` +
            `Sabemos que cada pessoa tem seu tempo, e respeitamos isso completamente. ` +
            `Se desejar reconsiderar, basta clicar no link abaixo:\n\n` +
            `👉 https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=preferences&action=rejoin&pubId=${pub.id}\n\n` +
            `Se preferir continuar como está, não precisa fazer nada. Estamos à disposição! 🙏`;

        const success = await sendWhatsApp(pub.phone, msg);
        await logDispatch(pub.id, dispatchKey, pub.phone, success ? 'SUCCESS' : 'ERROR');
        if (success) reports.push(`🔁 Reconvite enviado para ${pub.name} (não participa).`);
    }

    // --- M3: RECONVITE — isHelperOnly ---
    // NÃO enviar para quem está com flag NÃO APTO (isNotQualified)
    const helperOnlyPubs = publishers.filter(p => p.isHelperOnly && p.phone && !p.isNotQualified);
    for (const pub of helperOnlyPubs) {
        const dispatchKey = `RECONVITE_HELPER_${currentMonth}_${pub.id}`;
        if (await checkDispatched(pub.id, dispatchKey)) continue;

        const honorific = getHonorific(pub.gender);
        const greeting = getGreeting();
        const msg = `${greeting}, ${honorific} ${pub.name}! 🌸\n\n` +
            `Atualmente você está configurada(o) para receber apenas partes como ajudante. ` +
            `Se já se sente preparada(o) para também fazer partes como titular (leitura, demonstrações, etc.), ` +
            `ficaríamos felizes!\n\n` +
            `Basta clicar no link abaixo para atualizar sua preferência:\n\n` +
            `👉 https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=preferences&action=full-participation&pubId=${pub.id}\n\n` +
            `Se preferir continuar como está, não precisa fazer nada. Respeitamos! 🙏`;

        const success = await sendWhatsApp(pub.phone, msg);
        await logDispatch(pub.id, dispatchKey, pub.phone, success ? 'SUCCESS' : 'ERROR');
        if (success) reports.push(`🔁 Reconvite enviado para ${pub.name} (só ajudante).`);
    }

    // --- M4: RELATÓRIO À COMISSÃO DE SERVIÇO ---
    const impedidos = publishers.filter(p => p.isNotQualified);
    const optOuts = publishers.filter(p => p.requestedNoParticipation);
    const onlyHelpers = publishers.filter(p => p.isHelperOnly);

    if (impedidos.length > 0 || optOuts.length > 0 || onlyHelpers.length > 0) {
        let report = `📋 *Relatório Mensal — Revisão de Status*\n\n`;

        if (impedidos.length > 0) {
            report += `⛔ *Impedidos (${impedidos.length}):*\n`;
            impedidos.forEach(p => { report += `• ${p.name}${p.notQualifiedReason ? ` — ${p.notQualifiedReason}` : ''}\n`; });
            report += `\n`;
        }

        if (optOuts.length > 0) {
            report += `🚫 *Pediram para não participar (${optOuts.length}):*\n`;
            optOuts.forEach(p => { report += `• ${p.name}${p.noParticipationReason ? ` — ${p.noParticipationReason}` : ''}\n`; });
            report += `\n`;
        }

        if (onlyHelpers.length > 0) {
            report += `🤝 *Apenas ajudante (${onlyHelpers.length}):*\n`;
            onlyHelpers.forEach(p => { report += `• ${p.name}\n`; });
            report += `\n`;
        }

        report += `Por favor, considerem rever estes status periodicamente.\n`;
        report += `🔗 https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=publisher-form`;

        // Enviar para comissão de serviço
        const comissao = publishers.filter(p =>
            p.funcao === 'Coordenador do Corpo de Anciãos' ||
            p.funcao === 'Secretário' ||
            p.funcao === 'Superintendente de Serviço' ||
            p.funcao === 'Superintendente da Reunião Vida e Ministério'
        );

        // Ajudante SRVM só recebe se for Ancião
        const ajdSrvm = publishers.find(p => p.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério');
        if (ajdSrvm && ACQUIESCENCE_CONDITIONS.includes(ajdSrvm.condition)) {
            comissao.push(ajdSrvm);
        }

        const uniqueRecipients = Array.from(new Map(comissao.map(p => [p.id, p])).values());

        for (const member of uniqueRecipients) {
            if (!member.phone) continue;
            const dispatchKey = `RELATORIO_COMISSAO_${currentMonth}_${member.id}`;
            if (await checkDispatched(member.id, dispatchKey)) continue;

            const success = await sendWhatsApp(member.phone, report);
            await logDispatch(member.id, dispatchKey, member.phone, success ? 'SUCCESS' : 'ERROR');
            if (success) reports.push(`📋 Relatório enviado para ${member.name}.`);
        }
    }

    return reports;
}

// ============================================================================
// RELATÓRIO DIÁRIO CONSOLIDADO
// ============================================================================

async function sendDailyReport(
    publishers: PublisherData[],
    sentCount: number,
    noPhoneList: string[],
    monthlyReports: string[]
) {
    // Destinatários: SRVM + Ajudante SRVM
    const srvmPubs = publishers.filter(p =>
        p.funcao === 'Superintendente da Reunião Vida e Ministério' ||
        p.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério'
    ).filter(p => !!p.phone);

    if (srvmPubs.length === 0 || (sentCount === 0 && noPhoneList.length === 0 && monthlyReports.length === 0)) {
        return; // Nada a reportar
    }

    let report = `📊 *Relatório Diário — RVM Automação*\n\n`;
    report += `📤 Mensagens enviadas hoje: *${sentCount}*\n`;

    if (noPhoneList.length > 0) {
        report += `\n📵 *Sem telefone cadastrado (${noPhoneList.length}):*\n`;
        noPhoneList.forEach(item => { report += `• ${item}\n`; });
    }

    if (monthlyReports.length > 0) {
        report += `\n📅 *Ações mensais executadas:*\n`;
        monthlyReports.forEach(item => { report += `• ${item}\n`; });
    }

    for (const pub of srvmPubs) {
        await sendWhatsApp(pub.phone, report);
    }
}

// ============================================================================
// SERVE — PONTO DE ENTRADA
// ============================================================================

serve(async (req: Request) => {
    // Proteção do endpoint
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (expectedSecret) {
        const provided = req.headers.get("x-cron-secret");
        if (provided !== expectedSecret) {
            console.log('[cron-whatsapp-reminders] Acesso negado: x-cron-secret inválido.');
            return new Response("Forbidden", { status: 403 });
        }
    }

    console.log('[cron-whatsapp-reminders] Iniciando rotina...');

    // Kill-switch global
    const { data: activeData } = await supabase.from('settings').select('value').eq('key', 'zapi_automation_active').single();
    const isActive = activeData?.value === 'true' || activeData?.value === true;
    
    if (!isActive) {
        console.log('Automação Z-API está desativada.');
        return new Response("Automation is disabled.", { status: 200 });
    }

    // Carregar dia da reunião por semana (app_settings, não settings)
    const { data: meetingDayData } = await supabase.from('app_settings').select('value').eq('key', 's89_meeting_day_by_week').maybeSingle();
    const meetingDays: Record<string, number> = meetingDayData?.value || {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar partes — agora inclui PROPOSTA além de DESIGNADA
    const { data: rawParts, error } = await supabase
        .from('workbook_parts')
        .select(`id, tipo_parte, part_title, week_id, status, funcao, raw_publisher_name, resolved_publisher_id, section`)
        .in('status', ['DESIGNADA', 'PROPOSTA']);

    if (error || !rawParts) {
        console.error('[cron] Falha ao buscar partes:', error);
        return new Response("Failed to fetch parts", { status: 500 });
    }

    const parts: PartData[] = rawParts as PartData[];

    // Buscar publishers com dados expandidos
    const { data: publishersRaw } = await supabase.from('publishers').select('id, data');
    if (!publishersRaw) return new Response("Failed to fetch publishers", { status: 500 });

    const publishers: PublisherData[] = publishersRaw.map((p: any) => ({
        id: p.id,
        name: p.data?.name ?? '',
        phone: p.data?.phone ?? '',
        gender: p.data?.gender ?? 'brother',
        condition: p.data?.condition ?? 'Publicador',
        funcao: p.data?.funcao ?? null,
        requestedNoParticipation: p.data?.requestedNoParticipation === true,
        isHelperOnly: p.data?.isHelperOnly === true,
        isNotQualified: p.data?.isNotQualified === true,
        notQualifiedReason: p.data?.notQualifiedReason ?? '',
        noParticipationReason: p.data?.noParticipationReason ?? '',
    }));

    // ============================
    // CICLO DIÁRIO
    // ============================
    const { sentCount, noPhoneList } = await runDailyCycle(parts, publishers, meetingDays, today);

    // ============================
    // CICLO MENSAL (só dia 1º)
    // ============================
    let monthlyReports: string[] = [];
    if (today.getDate() === 1) {
        console.log('[cron] Dia 1º do mês — executando ciclo mensal...');
        monthlyReports = await runMonthlyCycle(publishers);
    }

    // ============================
    // RELATÓRIO DIÁRIO
    // ============================
    await sendDailyReport(publishers, sentCount, noPhoneList, monthlyReports);

    console.log(`[cron-whatsapp-reminders] Finalizado. ${sentCount} mensagens enviadas.`);

    return new Response(JSON.stringify({ success: true, sentCount, monthlyReports }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
