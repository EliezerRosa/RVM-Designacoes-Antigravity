import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { mapDbToWorkbookPart } from '../services/workbookService';
import { generationService } from '../services/generationService';
import { publishWeek, getPublishedWeeks } from '../services/weekPublishService';
import type { WorkbookPart, Publisher } from '../types';
import { zapiOrchestrator } from '../services/zapiOrchestrator';

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

interface LeadershipRecipient {
    name: string;
    phone: string;
    role: string;
}

/**
 * Invariante de Comunicação:
 * Apenas Admin + SRVM + Ajudantes do SRVM recebem avisos e relatórios de D-30 e D-21.
 * Exclusão estrita de CCA, Secretário, SS ou grupos gerais.
 */
function resolveRvmLeadershipRecipients(publishers: Publisher[]): LeadershipRecipient[] {
    const recipients: LeadershipRecipient[] = [];
    const seenPhones = new Set<string>();

    const addRecipient = (name: string, rawPhone: string | undefined | null, role: string) => {
        if (!rawPhone) return;
        const cleaned = rawPhone.replace(/\D/g, '');
        if (cleaned.length >= 10 && !seenPhones.has(cleaned)) {
            seenPhones.add(cleaned);
            recipients.push({ name, phone: cleaned, role });
        }
    };

    // 1. SRVM (Superintendente da Reunião Vida e Ministério - Edmardo Queiroz)
    const srvm = publishers.find(p => p.funcao === 'Superintendente da Reunião Vida e Ministério');
    if (srvm) {
        addRecipient(srvm.name, srvm.phone || srvm.contact_phone, 'SRVM');
    }

    // 2. Ajudantes do SRVM (Patrick de Oliveira, Eliezer Rosa, etc.)
    const ajdList = publishers.filter(p => p.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério');
    for (const ajd of ajdList) {
        addRecipient(ajd.name, ajd.phone || ajd.contact_phone, 'Ajudante SRVM');
    }

    // 3. Admin técnico do sistema (Eliezer Rosa)
    addRecipient('Eliezer Rosa', '27992035302', 'Admin de Sistema');

    return recipients;
}

interface AutomationWorkerProps {
    token: string | null;
}

export const AutomationWorker: React.FC<AutomationWorkerProps> = ({ token }) => {
    const [log, setLog] = useState<string[]>([]);
    const [done, setDone] = useState(false);
    const hasRun = useRef(false);

    const appendLog = (msg: string) => {
        console.log(`[AutomationWorker] ${msg}`);
        setLog(prev => [...prev, `${new Date().toISOString()} - ${msg}`]);
    };

    useEffect(() => {
        if (hasRun.current) return;
        hasRun.current = true;

        const runAutomations = async () => {
            appendLog(`Iniciando worker headless de automação RVM (Token: ${token ? `${token.substring(0, 10)}...` : 'NENHUM'})...`);

            // 1. Validação de Token de Automação via RPC Supabase
            let isAuthorized = false;
            if (token) {
                try {
                    const { data: validRpc, error: rpcErr } = await supabase.rpc('verify_automation_bot_token', {
                        p_token: token,
                    });
                    if (!rpcErr && validRpc === true) {
                        isAuthorized = true;
                    } else if (rpcErr) {
                        appendLog(`⚠️ RPC error ao validar token: ${rpcErr.message}`);
                    }
                } catch (err: any) {
                    appendLog(`⚠️ Exceção ao validar token: ${err.message}`);
                }
            }

            // Fallback para variável de ambiente se configurada
            const expectedEnvToken = import.meta.env.VITE_BOT_TOKEN;
            if (!isAuthorized && expectedEnvToken && token === expectedEnvToken) {
                isAuthorized = true;
            }

            if (!isAuthorized) {
                appendLog(`❌ Token inválido ou não autorizado (${token ? token.substring(0, 10) : 'null'}). Abortando execução do bot.`);
                setDone(true);
                return;
            }

            appendLog('✅ Token autorizado com sucesso.');

            try {
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                const maxSearchDateStr = addDays(today, 45).toISOString().split('T')[0];

                appendLog('Carregando publicadores ativos...');
                const allPubs = await api.loadPublishers();
                const publishers = (allPubs || []).filter(p => p.active !== false);

                // Resolução dos destinatários restritos (Admin + SRVM + Ajd SRVM)
                const leadershipRecipients = resolveRvmLeadershipRecipients(publishers);
                appendLog(`Destinatários de liderança RVM identificados: ${leadershipRecipients.map(r => `${r.role}: ${r.name}`).join(', ')}`);

                // Carrega mapa de semanas publicadas
                const publishedWeeksMap = await getPublishedWeeks();

                appendLog(`Buscando partes futuras entre ${todayStr} e ${maxSearchDateStr}...`);
                const { data: rawParts, error: partsErr } = await supabase
                    .from('workbook_parts')
                    .select('*')
                    .gte('date', todayStr)
                    .lte('date', maxSearchDateStr)
                    .order('date');

                if (partsErr) throw partsErr;

                const upcomingParts: WorkbookPart[] = (rawParts || []).map(mapDbToWorkbookPart);

                // Agrupa partes por semana
                const weeksMap = new Map<string, WorkbookPart[]>();
                upcomingParts.forEach(p => {
                    const ws = weeksMap.get(p.weekId) || [];
                    ws.push(p);
                    weeksMap.set(p.weekId, ws);
                });

                appendLog(`Total de ${weeksMap.size} semanas futuras encontradas.`);

                for (const [weekId, parts] of weeksMap.entries()) {
                    if (!parts || parts.length === 0) continue;

                    const weekParts = parts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                    const baseDateStr = weekParts[0]?.date || weekId;
                    const [y, m, d] = baseDateStr.split('-').map(Number);
                    const targetDate = new Date(y, m - 1, d);
                    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const diffDays = Math.round((targetDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
                    const weekDisplay = `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;

                    appendLog(`Analisando semana ${weekId} (${weekDisplay}) — Distância: ${diffDays} dias.`);

                    // ── D-30: GERAÇÃO ANTECIPADA (Janela: entre 22 e 35 dias à frente) ──────────
                    if (diffDays >= 22 && diffDays <= 35) {
                        const assignableParts = weekParts.filter(p => p.tipoParte !== 'Cântico');
                        const emptyParts = assignableParts.filter(p => !p.resolvedPublisherId);
                        const isEmpty = assignableParts.length > 0 && (emptyParts.length / assignableParts.length) >= 0.5;

                        if (isEmpty) {
                            // Verifica se já rodou geração para esta semana hoje
                            const { data: alreadyRan } = await supabase
                                .from('automation_bot_log')
                                .select('id')
                                .eq('week_id', weekId)
                                .eq('action_type', 'D-30_GENERATION')
                                .eq('status', 'SUCCESS')
                                .gte('created_at', todayStr)
                                .maybeSingle();

                            if (alreadyRan) {
                                appendLog(`Semana ${weekId} já foi gerada hoje (D-30). Ignorando.`);
                            } else {
                                appendLog(`🚀 Executando Geração Antecipada (D-30) para semana ${weekId}...`);
                                try {
                                    await supabase.from('automation_bot_log').insert({
                                        week_id: weekId,
                                        action_type: 'D-30_GENERATION',
                                        status: 'RUNNING',
                                        details: { reason: 'auto batch D-30' },
                                    });

                                    const genRes = await generationService.generateDesignations(weekParts, publishers, {
                                        isDryRun: false,
                                        skipLocalNeeds: false,
                                        preventWeekendClashes: true,
                                    });

                                    await supabase.from('automation_bot_log')
                                        .update({ status: 'SUCCESS', details: genRes })
                                        .eq('week_id', weekId)
                                        .eq('action_type', 'D-30_GENERATION');

                                    appendLog(`✅ Geração D-30 concluída para ${weekId}: ${genRes.successful} atribuídas, ${genRes.failed} pendentes.`);

                                    // Notifica EXCLUSIVAMENTE Admin + SRVM + Ajd SRVM
                                    const msgD30 = `🤖 *Robô RVM — Geração Antecipada (D-30)*\n` +
                                        `As designações da semana *${weekDisplay}* foram pré-geradas em rascunho com sucesso!\n\n` +
                                        `📅 *Reunião*: ${weekDisplay}\n` +
                                        `👥 *Partes preenchidas*: ${genRes.successful} (${genRes.failed} pendentes)\n` +
                                        `⏳ *Status*: *PROPOSTA* (Em revisão pastoral)\n\n` +
                                        `As designações permanecerão em rascunho até *D-21* (~${diffDays - 21} dias para revisão). ` +
                                        `Acesse o sistema para conferir eventuais ajustes antes da emissão dos cartões S-89.`;

                                    for (const rec of leadershipRecipients) {
                                        try {
                                            await zapiOrchestrator.sendTextDirect(rec.phone, msgD30);
                                        } catch (sendErr) {
                                            console.warn(`[AutomationWorker] Falha ao enviar zap para ${rec.role}:`, sendErr);
                                        }
                                    }
                                } catch (genErr: any) {
                                    appendLog(`❌ Erro na geração D-30 (${weekId}): ${genErr.message}`);
                                    await supabase.from('automation_bot_log')
                                        .update({ status: 'ERROR', details: { error: genErr.message } })
                                        .eq('week_id', weekId)
                                        .eq('action_type', 'D-30_GENERATION');
                                }
                            }
                        }
                    }

                    // ── D-21: PUBLICAÇÃO AUTOMÁTICA S-89 (Janela: <= 21 dias e >= 0) ───────────
                    // Também recupera semanas designadas pendentes (como a de 21/set em D-15)
                    if (diffDays <= 21 && diffDays >= 0) {
                        const isAlreadyPublished = Boolean(publishedWeeksMap[weekId]);
                        if (isAlreadyPublished) {
                            appendLog(`Semana ${weekId} já está publicada no sistema. Ignorando.`);
                            continue;
                        }

                        // Verifica se possui partes com publicador atribuído para publicar
                        const assignableParts = weekParts.filter(p => p.tipoParte !== 'Cântico');
                        const hasDesignations = assignableParts.some(p => Boolean(p.resolvedPublisherId || p.resolvedPublisherName));

                        if (!hasDesignations) {
                            appendLog(`⚠️ Semana ${weekId} está em D-21 mas não possui publicadores atribuídos. Publicação ignorada.`);
                            continue;
                        }

                        // Verifica se já rodou publicação hoje
                        const { data: alreadyPub } = await supabase
                            .from('automation_bot_log')
                            .select('id')
                            .eq('week_id', weekId)
                            .eq('action_type', 'D-21_PUBLICATION')
                            .eq('status', 'SUCCESS')
                            .gte('created_at', todayStr)
                            .maybeSingle();

                        if (alreadyPub) {
                            appendLog(`Semana ${weekId} já teve publicação executada com sucesso hoje.`);
                            continue;
                        }

                        appendLog(`🚀 Executando Publicação Automática S-89 (D-21) para semana ${weekId}...`);
                        try {
                            await supabase.from('automation_bot_log').insert({
                                week_id: weekId,
                                action_type: 'D-21_PUBLICATION',
                                status: 'RUNNING',
                                details: { reason: `auto publish D-${diffDays}` },
                            });

                            const pubRes = await publishWeek(weekId, weekParts, publishers);

                            const finalStatus = pubRes.success ? 'SUCCESS' : 'PARTIAL';
                            await supabase.from('automation_bot_log')
                                .update({ status: finalStatus, details: pubRes })
                                .eq('week_id', weekId)
                                .eq('action_type', 'D-21_PUBLICATION');

                            appendLog(`✅ Publicação da semana ${weekId} concluída: ${pubRes.s89Sent} cartões enviados via Z-API.`);

                            // Notifica EXCLUSIVAMENTE Admin + SRVM + Ajd SRVM
                            const msgD21 = `🤖 *Robô RVM — Publicação Automática (D-21)*\n` +
                                `A semana *${weekDisplay}* atingiu a janela de 21 dias e os cartões S-89 foram despachados com sucesso via WhatsApp!\n\n` +
                                `📅 *Reunião*: ${weekDisplay}\n` +
                                `📤 *Cartões S-89 enviados*: ${pubRes.s89Sent}\n` +
                                `📋 *Status*: Semana Oficialmente Publicada no sistema.`;

                            for (const rec of leadershipRecipients) {
                                try {
                                    await zapiOrchestrator.sendTextDirect(rec.phone, msgD21);
                                } catch (sendErr) {
                                    console.warn(`[AutomationWorker] Falha ao enviar zap para ${rec.role}:`, sendErr);
                                }
                            }
                        } catch (pubErr: any) {
                            appendLog(`❌ Erro na publicação D-21 (${weekId}): ${pubErr.message}`);
                            await supabase.from('automation_bot_log')
                                .update({ status: 'ERROR', details: { error: pubErr.message } })
                                .eq('week_id', weekId)
                                .eq('action_type', 'D-21_PUBLICATION');
                        }
                    }
                }

                appendLog('🏁 Worker de automação finalizado com sucesso.');
            } catch (err: any) {
                appendLog(`💥 Erro fatal no worker de automação: ${err.message}`);
            } finally {
                setDone(true);
            }
        };

        runAutomations();
    }, [token]);

    return (
        <div style={{ padding: 24, fontFamily: 'monospace', background: '#0F172A', color: '#38BDF8', minHeight: '100vh' }}>
            <h1 id="worker-status" style={{ color: done ? '#4ADE80' : '#FBBF24', fontSize: 24 }}>
                {done ? 'FINISHED' : 'RUNNING'}
            </h1>
            <div style={{ background: '#020617', padding: 16, borderRadius: 8, border: '1px solid #1E293B', maxHeight: '80vh', overflow: 'auto' }}>
                {log.map((l, i) => <div key={i} style={{ marginBottom: 4 }}>{l}</div>)}
            </div>
        </div>
    );
};
