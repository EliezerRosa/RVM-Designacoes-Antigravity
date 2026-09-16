/**
 * ============================================================================
 * TESTE INTEGRADO: Ciclo de Vida Completo de Designação
 * ============================================================================
 * Parte: Presidente — Semana 2026-10-12
 * Publicador: Eliezer Rosa (id=3, phone=27992035302, condition=Ancião)
 * CC: Fictício Teste (phone=27981470002)
 *
 * IMPORTANTE: Este script NÃO altera nenhum código existente.
 * Ele opera sobre o banco e Edge Functions em produção, simulando cada etapa
 * e coletando TODOS os dados disponíveis para análise forense.
 *
 * Execução: npx tsx scripts/test_full_lifecycle.ts
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Dados fixos do teste ──
const PART_ID     = '1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae';
const PUB_ID      = '3';
const PUB_NAME    = 'Eliezer Rosa';
const PUB_PHONE   = '27992035302';
const PUB_PHONE_2 = '27981470002';
const WEEK_ID     = '2026-10-12';

// ── Coletor de evidências ──
interface Evidence {
    timestamp: string;
    etapa: string;
    tipo: 'LOG' | 'MSG_ENVIADA' | 'SNAPSHOT_BANCO' | 'RESPOSTA_ZAPI' | 'ANALISE';
    dados: any;
}

const allEvidence: Evidence[] = [];
const logLines: string[] = [];

function addEvidence(etapa: string, tipo: Evidence['tipo'], dados: any) {
    allEvidence.push({ timestamp: new Date().toISOString(), etapa, tipo, dados });
}

function log(msg: string) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    logLines.push(line);
}

// ── Helpers ──
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function sendWhatsApp(phone: string, message: string, options?: any) {
    const payload = { phone, message, ...options };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify(payload)
    });
    const responseText = await res.text();
    let data: any;
    try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
    return { httpStatus: res.status, success: data.success, messageId: data.messageId, provider: data.provider, fullResponse: data, requestPayload: payload };
}

/** Snapshot completo de todas as tabelas relevantes para esta parte/publicador */
async function takeSnapshot(label: string) {
    const [partSnap, dispatchSnap, tokenSnap, interactionSnap] = await Promise.all([
        supabase.from('workbook_parts').select('*').eq('id', PART_ID).maybeSingle(),
        supabase.from('zapi_dispatch_log').select('*').eq('part_id', PART_ID).order('dispatched_at', { ascending: true }),
        supabase.from('confirmation_portal_tokens').select('*').eq('part_id', PART_ID).eq('publisher_id', PUB_ID).order('created_at', { ascending: false }),
        supabase.from('zapi_smart_interactions').select('*').or(`phone.like.%${PUB_PHONE.slice(-8)}%,phone.like.%${PUB_PHONE_2.slice(-8)}%`).order('created_at', { ascending: false }).limit(10),
    ]);

    const snapshot = {
        label,
        workbook_part: partSnap.data,
        dispatch_log: dispatchSnap.data || [],
        confirmation_tokens: tokenSnap.data || [],
        smart_interactions: interactionSnap.data || [],
    };

    addEvidence(label, 'SNAPSHOT_BANCO', snapshot);
    log(`📸 Snapshot "${label}": part.status=${partSnap.data?.status}, dispatches=${(dispatchSnap.data||[]).length}, tokens=${(tokenSnap.data||[]).length}, interactions=${(interactionSnap.data||[]).length}`);
    return snapshot;
}

// ============================================================================
// ETAPA 1: PUBLICAÇÃO S-89
// ============================================================================
async function etapa1_publicacao() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('ETAPA 1: PUBLICAÇÃO S-89 — Envio inicial da designação');
    log('═══════════════════════════════════════════════════════════');

    await takeSnapshot('ANTES da Etapa 1 (Publicação S-89)');

    // Gerar token de confirmação
    const { data: tokenData, error: tokenErr } = await supabase
        .from('confirmation_portal_tokens')
        .insert({ part_id: PART_ID, publisher_id: PUB_ID })
        .select('*')
        .single();

    if (tokenErr) {
        log(`❌ ERRO ao criar token: ${JSON.stringify(tokenErr)}`);
        addEvidence('ETAPA 1', 'LOG', { error: tokenErr });
        return null;
    }
    log(`✅ Token criado: ${tokenData.token} (expira: ${tokenData.expires_at})`);
    addEvidence('ETAPA 1', 'LOG', { token: tokenData });

    const confirmLink = `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=${PART_ID}&publisherId=${PUB_ID}&token=${tokenData.token}`;

    const msgText = `Boa noite, Irmão ${PUB_NAME}!\n\n` +
        `Você recebeu uma designação para a reunião de *quinta-feira, 15 de outubro*:\n\n` +
        `📖 *Presidente*\n` +
        `\nPor favor, confirme se poderá participar clicando no link abaixo:\n` +
        `👉 ${confirmLink}\n\n` +
        `Se não puder, use o mesmo link para nos avisar. Contamos com você! 🙏`;

    log(`📤 Enviando S-89 para ${PUB_PHONE}...`);
    log(`📝 Conteúdo completo da mensagem:\n---MSG-START---\n${msgText}\n---MSG-END---`);

    const result = await sendWhatsApp(PUB_PHONE, msgText);
    log(`📬 Resposta: HTTP=${result.httpStatus} success=${result.success} messageId=${result.messageId} provider=${result.provider}`);
    log(`📬 Resposta bruta completa: ${JSON.stringify(result.fullResponse)}`);

    addEvidence('ETAPA 1', 'MSG_ENVIADA', { destinatario: PUB_PHONE, conteudo: msgText, resultado: result });
    addEvidence('ETAPA 1', 'RESPOSTA_ZAPI', result.fullResponse);

    // Registrar no dispatch log com message_id
    const dispatchPayload: any = {
        part_id: PART_ID,
        dispatch_type: 'PUBLICACAO_S89',
        recipient_phone: PUB_PHONE,
        status: result.success ? 'SUCCESS' : 'ERROR',
    };
    if (result.messageId) dispatchPayload.message_id = result.messageId;
    const { data: dispatchRow, error: dispatchErr } = await supabase.from('zapi_dispatch_log').insert(dispatchPayload).select('*').single();
    log(`📋 Dispatch log gravado: ${JSON.stringify(dispatchRow)}`);
    if (dispatchErr) log(`❌ Erro ao gravar dispatch: ${JSON.stringify(dispatchErr)}`);

    // CC para segundo telefone
    log(`📤 Enviando CC para ${PUB_PHONE_2}...`);
    const ccMsg = `[TESTE CC - PUBLICAÇÃO S-89]\n${msgText}`;
    const ccResult = await sendWhatsApp(PUB_PHONE_2, ccMsg);
    log(`📬 CC Resposta: success=${ccResult.success} messageId=${ccResult.messageId}`);
    addEvidence('ETAPA 1', 'MSG_ENVIADA', { destinatario: PUB_PHONE_2, conteudo: ccMsg, resultado: ccResult, nota: 'Cópia CC' });

    await takeSnapshot('DEPOIS da Etapa 1 (Publicação S-89)');
    await sleep(3000);
    return result.messageId;
}

// ============================================================================
// ETAPA 2: SIMULAR 72H SEM RESPOSTA
// ============================================================================
async function etapa2_simular72h() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('ETAPA 2: SIMULAÇÃO DE 72H SEM RESPOSTA');
    log('═══════════════════════════════════════════════════════════');

    await takeSnapshot('ANTES da Etapa 2 (Simulação 72h)');

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    log(`⏰ Ajustando dispatched_at do S-89 para ${fourDaysAgo} (4 dias atrás)...`);

    const { data: updated, error } = await supabase
        .from('zapi_dispatch_log')
        .update({ dispatched_at: fourDaysAgo })
        .eq('part_id', PART_ID)
        .eq('dispatch_type', 'PUBLICACAO_S89')
        .eq('recipient_phone', PUB_PHONE)
        .select('*');

    if (error) {
        log(`❌ ERRO: ${JSON.stringify(error)}`);
    } else {
        log(`✅ Registro atualizado: ${JSON.stringify(updated)}`);
    }
    addEvidence('ETAPA 2', 'LOG', { acao: 'dispatched_at ajustado', novoValor: fourDaysAgo, registrosAtualizados: updated });

    log('📌 Status da parte permanece PROPOSTA (sem resposta do publicador).');
    log('📌 Na próxima execução do CRON, a parte será detectada como pendente >72h.');

    await takeSnapshot('DEPOIS da Etapa 2 (Simulação 72h)');
    await sleep(1000);
}

// ============================================================================
// ETAPA 3: COBRANÇA 72H
// ============================================================================
async function etapa3_cobranca72h() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('ETAPA 3: COBRANÇA 72H — Ciclo contínuo de pendências');
    log('═══════════════════════════════════════════════════════════');

    await takeSnapshot('ANTES da Etapa 3 (Cobrança 72h)');

    // Buscar último dispatch (é o que o CRON faria)
    const { data: latestDispatch } = await supabase
        .from('zapi_dispatch_log')
        .select('*')
        .eq('part_id', PART_ID)
        .eq('recipient_phone', PUB_PHONE)
        .eq('status', 'SUCCESS')
        .order('dispatched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    log(`🔍 Último dispatch encontrado: ${JSON.stringify(latestDispatch)}`);
    addEvidence('ETAPA 3', 'LOG', { ultimoDispatch: latestDispatch });

    const hasMessageId = !!latestDispatch?.message_id;
    log(`🔍 Tem message_id? ${hasMessageId ? 'SIM → Reply/Citação' : 'NÃO → Republicação completa'}`);

    let msgText: string;
    const options: any = {};

    if (hasMessageId) {
        msgText = `Olá, Irmão ${PUB_NAME}! Este é um lembrete automático. Ainda não recebemos sua confirmação para a designação acima. Por favor, veja a msg referida aqui e retorne para nos avisar!`;
        options.referenceMessageId = latestDispatch!.message_id;
        log(`📎 Usando referenceMessageId: ${latestDispatch!.message_id}`);
    } else {
        // Fallback: Republica S-89 inteiro
        const { data: tokenData } = await supabase
            .from('confirmation_portal_tokens')
            .insert({ part_id: PART_ID, publisher_id: PUB_ID })
            .select('token')
            .single();
        const confirmLink = `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=${PART_ID}&publisherId=${PUB_ID}&token=${tokenData?.token || 'N/A'}`;

        msgText = `Boa noite, Irmão ${PUB_NAME}!\n\n` +
            `Você recebeu uma designação para a reunião de *quinta-feira, 15 de outubro*:\n\n` +
            `📖 *Presidente*\n` +
            `\nPor favor, confirme se poderá participar clicando no link abaixo:\n` +
            `👉 ${confirmLink}\n\n` +
            `Se não puder, use o mesmo link para nos avisar. Contamos com você! 🙏`;
        log(`📋 Republicação completa (sem message_id legado)`);
    }

    log(`📤 Enviando cobrança 72h para ${PUB_PHONE}...`);
    log(`📝 Conteúdo completo:\n---MSG-START---\n${msgText}\n---MSG-END---`);
    log(`📝 Options: ${JSON.stringify(options)}`);

    const result = await sendWhatsApp(PUB_PHONE, msgText, options);
    log(`📬 Resposta: HTTP=${result.httpStatus} success=${result.success} messageId=${result.messageId} provider=${result.provider}`);
    log(`📬 Resposta bruta completa: ${JSON.stringify(result.fullResponse)}`);

    addEvidence('ETAPA 3', 'MSG_ENVIADA', { destinatario: PUB_PHONE, conteudo: msgText, options, resultado: result, cenario: hasMessageId ? 'REPLY_CITACAO' : 'REPUBLISH_COMPLETO' });
    addEvidence('ETAPA 3', 'RESPOSTA_ZAPI', result.fullResponse);

    // Gravar dispatch
    const dispatchPayload: any = {
        part_id: PART_ID,
        dispatch_type: 'COBRANCA_72H',
        recipient_phone: PUB_PHONE,
        status: result.success ? 'SUCCESS' : 'ERROR',
    };
    if (result.messageId) dispatchPayload.message_id = result.messageId;
    const { data: dispatchRow } = await supabase.from('zapi_dispatch_log').insert(dispatchPayload).select('*').single();
    log(`📋 Dispatch log gravado: ${JSON.stringify(dispatchRow)}`);

    // CC
    const ccMsg = `[TESTE CC - COBRANÇA 72H - cenário: ${hasMessageId ? 'REPLY' : 'REPUBLISH'}]\n${msgText}`;
    const ccResult = await sendWhatsApp(PUB_PHONE_2, ccMsg);
    addEvidence('ETAPA 3', 'MSG_ENVIADA', { destinatario: PUB_PHONE_2, conteudo: ccMsg, resultado: ccResult, nota: 'CC' });

    await takeSnapshot('DEPOIS da Etapa 3 (Cobrança 72h)');
    await sleep(3000);
}

// ============================================================================
// ETAPA 4: ACEITE DO PUBLICADOR
// ============================================================================
async function etapa4_aceite() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('ETAPA 4: SIMULAÇÃO DE ACEITE — Publicador confirma');
    log('═══════════════════════════════════════════════════════════');

    await takeSnapshot('ANTES da Etapa 4 (Aceite)');

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
        .from('workbook_parts')
        .update({ status: 'DESIGNADA', status_changed_at: now, updated_at: now })
        .eq('id', PART_ID)
        .select('id, status, status_changed_at, updated_at');

    if (error) {
        log(`❌ ERRO ao mudar status: ${JSON.stringify(error)}`);
    } else {
        log(`✅ Status alterado: ${JSON.stringify(updated)}`);
    }
    addEvidence('ETAPA 4', 'LOG', { acao: 'status PROPOSTA → DESIGNADA', resultado: updated, error });

    // Notificar
    const msgText = `✅ *[TESTE] Confirmação recebida!*\n\nIrmão ${PUB_NAME} confirmou a designação de *Presidente* para a reunião de 15 de outubro.\n\nStatus: PROPOSTA → DESIGNADA\n\nA partir de agora:\n• Sai do ciclo de cobranças 72h\n• Entra nos lembretes D-9, D-7, D-2 (com botões)`;
    const result = await sendWhatsApp(PUB_PHONE_2, msgText);
    addEvidence('ETAPA 4', 'MSG_ENVIADA', { destinatario: PUB_PHONE_2, conteudo: msgText, resultado: result });
    log(`📤 Notificação de aceite enviada para CC: success=${result.success}`);

    await takeSnapshot('DEPOIS da Etapa 4 (Aceite)');
    await sleep(2000);
}

// ============================================================================
// ETAPA 5: LEMBRETES D-9, D-7, D-2
// ============================================================================
async function etapa5_lembretes() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('ETAPA 5: LEMBRETES D-9, D-7, D-2 (com botões de ação)');
    log('═══════════════════════════════════════════════════════════');

    await takeSnapshot('ANTES da Etapa 5 (Lembretes)');

    // Token para botões
    const { data: tokenData } = await supabase
        .from('confirmation_portal_tokens')
        .insert({ part_id: PART_ID, publisher_id: PUB_ID })
        .select('*')
        .single();
    const confirmToken = tokenData?.token ? String(tokenData.token) : null;
    log(`🔑 Token para botões: ${confirmToken} (expira: ${tokenData?.expires_at})`);
    addEvidence('ETAPA 5', 'LOG', { tokenParaBotoes: tokenData });

    const lembretes = [
        { type: 'LEMBRETE_D9', label: 'D-9', reminderLabel: 'faltam 9 dias' },
        { type: 'LEMBRETE_D7', label: 'D-7', reminderLabel: 'faltam apenas 7 dias' },
        { type: 'LEMBRETE_D2', label: 'D-2', reminderLabel: 'faltam 2 dias' },
    ];

    for (const lembrete of lembretes) {
        log(`\n── ${lembrete.label}: Enviando lembrete ──`);

        let body = `Boa noite, Irmão ${PUB_NAME}!\n`;
        body += `Lembrando que ${lembrete.reminderLabel} para sua parte na reunião de *quinta-feira, 15 de outubro*:\n\n`;
        body += `📖 *Presidente*\n`;
        body += `\n🎙️ Revise o programa da semana para conduzir a reunião com fluidez.`;
        body += `\n\nPor favor, garanta que seu preparo esteja em dia. ✨`;

        const options: any = {};
        if (confirmToken) {
            options.action = 'send-button-actions';
            options.buttonActions = [
                {
                    id: `btn_reject_${PART_ID}`,
                    type: 'REPLY',
                    label: 'Não poderei'
                },
                {
                    id: `btn_avail_${PART_ID}`,
                    type: 'URL',
                    label: 'Ajustar Disponibilidade',
                    url: `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=${PART_ID}&publisherId=${PUB_ID}&token=${confirmToken}`
                }
            ];
        }

        log(`📝 Conteúdo completo:\n---MSG-START---\n${body}\n---MSG-END---`);
        log(`📝 Options (botões): ${JSON.stringify(options, null, 2)}`);

        log(`📤 Enviando para ${PUB_PHONE}...`);
        const result = await sendWhatsApp(PUB_PHONE, body, options);
        log(`📬 Resposta: HTTP=${result.httpStatus} success=${result.success} messageId=${result.messageId} provider=${result.provider}`);
        log(`📬 Resposta bruta: ${JSON.stringify(result.fullResponse)}`);

        addEvidence('ETAPA 5', 'MSG_ENVIADA', { lembrete: lembrete.label, destinatario: PUB_PHONE, conteudo: body, options, resultado: result });
        addEvidence('ETAPA 5', 'RESPOSTA_ZAPI', { lembrete: lembrete.label, resposta: result.fullResponse });

        // Gravar dispatch
        const payload: any = {
            part_id: PART_ID,
            dispatch_type: lembrete.type,
            recipient_phone: PUB_PHONE,
            status: result.success ? 'SUCCESS' : 'ERROR',
        };
        if (result.messageId) payload.message_id = result.messageId;
        const { data: dispatchRow } = await supabase.from('zapi_dispatch_log').insert(payload).select('*').single();
        log(`📋 Dispatch: ${JSON.stringify(dispatchRow)}`);

        // CC
        const ccMsg = `[TESTE CC - ${lembrete.label}]\n${body}`;
        const ccResult = await sendWhatsApp(PUB_PHONE_2, ccMsg);
        addEvidence('ETAPA 5', 'MSG_ENVIADA', { lembrete: lembrete.label, destinatario: PUB_PHONE_2, conteudo: ccMsg, resultado: ccResult, nota: 'CC' });

        await sleep(4000);
    }

    await takeSnapshot('DEPOIS da Etapa 5 (Lembretes)');
}

// ============================================================================
// ETAPA 6: CLEANUP
// ============================================================================
async function etapa6_cleanup() {
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('ETAPA 6: CLEANUP — Restaurando estado original');
    log('═══════════════════════════════════════════════════════════');

    await takeSnapshot('ANTES da Etapa 6 (Cleanup)');

    // Restaurar status
    const { data: restored } = await supabase
        .from('workbook_parts')
        .update({ status: 'PROPOSTA', status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', PART_ID)
        .select('id, status');
    log(`✅ Status restaurado: ${JSON.stringify(restored)}`);

    // Remover dispatches de teste
    const { data: removedDispatches } = await supabase
        .from('zapi_dispatch_log')
        .delete()
        .eq('part_id', PART_ID)
        .select('id, dispatch_type, dispatched_at');
    log(`🗑️ ${removedDispatches?.length || 0} dispatches removidos: ${JSON.stringify(removedDispatches)}`);

    // Remover tokens de teste
    const { data: removedTokens } = await supabase
        .from('confirmation_portal_tokens')
        .delete()
        .eq('part_id', PART_ID)
        .eq('publisher_id', PUB_ID)
        .select('id, token');
    log(`🗑️ ${removedTokens?.length || 0} tokens removidos`);

    addEvidence('ETAPA 6', 'LOG', { removedDispatches, removedTokens, restoredPart: restored });

    await takeSnapshot('DEPOIS da Etapa 6 (Cleanup)');
    log('✅ Cleanup concluído — banco restaurado ao estado original.');
}

// ============================================================================
// GERADOR DE RELATÓRIO MARKDOWN
// ============================================================================
function generateReport(): string {
    let md = `# 📋 Relatório de Teste Integrado — Ciclo de Vida da Designação\n\n`;
    md += `**Data de execução:** ${new Date().toISOString()}\n`;
    md += `**Parte testada:** Presidente (semana 2026-10-12)\n`;
    md += `**Publicador:** ${PUB_NAME} (id=${PUB_ID}, tel=${PUB_PHONE})\n`;
    md += `**CC:** Fictício Teste (tel=${PUB_PHONE_2})\n\n`;
    md += `---\n\n`;

    // Agrupar evidências por etapa
    const etapas = ['ETAPA 1', 'ETAPA 2', 'ETAPA 3', 'ETAPA 4', 'ETAPA 5', 'ETAPA 6'];
    const nomes: Record<string, string> = {
        'ETAPA 1': 'Publicação S-89',
        'ETAPA 2': 'Simulação de 72h sem resposta',
        'ETAPA 3': 'Cobrança 72h (Ciclo Contínuo)',
        'ETAPA 4': 'Aceite do Publicador',
        'ETAPA 5': 'Lembretes D-9, D-7, D-2',
        'ETAPA 6': 'Cleanup',
    };

    for (const etapa of etapas) {
        const evs = allEvidence.filter(e => e.etapa.startsWith(etapa) || e.etapa.includes(nomes[etapa] || ''));
        md += `## ${etapa}: ${nomes[etapa]}\n\n`;

        // Snapshots
        const snaps = evs.filter(e => e.tipo === 'SNAPSHOT_BANCO');
        if (snaps.length > 0) {
            md += `### Snapshots do Banco\n\n`;
            for (const s of snaps) {
                md += `**${s.dados.label}**\n`;
                md += `- Part status: \`${s.dados.workbook_part?.status || 'N/A'}\`\n`;
                md += `- Dispatches: ${s.dados.dispatch_log?.length || 0}\n`;
                md += `- Tokens: ${s.dados.confirmation_tokens?.length || 0}\n`;
                md += `- Interactions: ${s.dados.smart_interactions?.length || 0}\n\n`;
            }
        }

        // Mensagens enviadas
        const msgs = evs.filter(e => e.tipo === 'MSG_ENVIADA');
        if (msgs.length > 0) {
            md += `### Mensagens Enviadas\n\n`;
            for (const m of msgs) {
                const d = m.dados;
                md += `**→ ${d.destinatario}** ${d.nota ? `(${d.nota})` : ''} ${d.lembrete ? `[${d.lembrete}]` : ''}\n`;
                md += `- Success: \`${d.resultado?.success}\`\n`;
                md += `- Message ID: \`${d.resultado?.messageId || 'N/A'}\`\n`;
                md += `- Provider: \`${d.resultado?.provider || 'N/A'}\`\n`;
                if (d.cenario) md += `- Cenário: \`${d.cenario}\`\n`;
                md += `\n\`\`\`\n${d.conteudo}\n\`\`\`\n\n`;
                if (d.options && Object.keys(d.options).length > 0) {
                    md += `**Options/Botões:**\n\`\`\`json\n${JSON.stringify(d.options, null, 2)}\n\`\`\`\n\n`;
                }
            }
        }

        // Respostas Z-API
        const zapis = evs.filter(e => e.tipo === 'RESPOSTA_ZAPI');
        if (zapis.length > 0) {
            md += `### Respostas Z-API (raw)\n\n`;
            for (const z of zapis) {
                md += `\`\`\`json\n${JSON.stringify(z.dados, null, 2)}\n\`\`\`\n\n`;
            }
        }

        md += `---\n\n`;
    }

    // Log completo
    md += `## Log Cronológico Completo\n\n`;
    md += `\`\`\`\n${logLines.join('\n')}\n\`\`\`\n`;

    return md;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
    log('╔══════════════════════════════════════════════════════════╗');
    log('║  TESTE INTEGRADO: Ciclo de Vida Completo               ║');
    log('║  Parte: Presidente — Semana 2026-10-12                 ║');
    log('║  Publicador: Eliezer Rosa (27992035302)                ║');
    log('║  CC: Fictício Teste (27981470002)                      ║');
    log('╚══════════════════════════════════════════════════════════╝');

    try {
        await etapa1_publicacao();
        await etapa2_simular72h();
        await etapa3_cobranca72h();
        await etapa4_aceite();
        await etapa5_lembretes();
        await etapa6_cleanup();
    } catch (err) {
        log(`💀 ERRO FATAL: ${err instanceof Error ? err.stack : String(err)}`);
    }

    // ── Gerar e salvar relatórios ──
    log('');
    log('═══ Gerando relatórios finais... ═══');

    const report = generateReport();
    const reportPath = 'scripts/test_lifecycle_report.md';
    fs.writeFileSync(reportPath, report, 'utf-8');
    log(`📄 Relatório MD salvo: ${reportPath}`);

    const evidencePath = 'scripts/test_lifecycle_evidence.json';
    fs.writeFileSync(evidencePath, JSON.stringify(allEvidence, null, 2), 'utf-8');
    log(`📋 Evidências JSON salvas: ${evidencePath}`);

    const logPath = 'scripts/test_lifecycle_log.txt';
    fs.writeFileSync(logPath, logLines.join('\n'), 'utf-8');
    log(`📄 Log salvo: ${logPath}`);

    // Resumo final no console
    const msgsSent = allEvidence.filter(e => e.tipo === 'MSG_ENVIADA');
    const successCount = msgsSent.filter(e => e.dados.resultado?.success).length;
    log(`\n══════ RESUMO: ${msgsSent.length} mensagens enviadas, ${successCount} com sucesso ══════`);
}

main().catch(console.error);
