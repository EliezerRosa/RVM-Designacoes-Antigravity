import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { generationService } from '../services/generationService';
import { publishWeek } from '../services/weekPublishService';
import { getTodayWeekIdLocal } from '../utils/dateUtils';
import type { WorkbookPart, Publisher } from '../types';
import { zapiOrchestrator } from '../services/zapiOrchestrator';

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

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
            appendLog('Iniciando worker de automação...');

            // 1. Validar Token (lendo do backend para ser seguro, ou usando um ENV var do vite)
            const expectedToken = import.meta.env.VITE_BOT_TOKEN;
            if (!expectedToken || token !== expectedToken) {
                appendLog('❌ Token inválido ou não configurado (VITE_BOT_TOKEN). Abortando.');
                setDone(true);
                return;
            }

            appendLog('✅ Token validado com sucesso.');

            try {
                // Datas alvo: Hoje + 30 dias (Geração) e Hoje + 21 dias (Publicação)
                const today = new Date();
                const d30Date = addDays(today, 30);
                const d21Date = addDays(today, 21);
                
                // Precisamos normalizar para o weekId (formato YYYY-MM-DD da segunda-feira)
                // O supabase tem 'date' das partes. Vamos buscar as partes dessas semanas.
                // Mas para simplificar, vamos buscar TODAS as partes futuras não publicadas
                // e processar as que se encaixam no critério (<= 30 para geração, <= 21 para publicação).

                appendLog('Buscando dados base (Publishers)...');
                const { data: publishersData, error: pubErr } = await supabase
                    .from('publishers')
                    .select('*')
                    .eq('active', true);
                    
                if (pubErr) throw pubErr;
                const publishers = publishersData as Publisher[];

                // D-30: GERAÇÃO (Partes a exatos 30 dias de distância e que estão sem designação)
                // Vamos buscar semanas que a date é >= today e <= today + 31 dias
                const { data: parts30, error: err30 } = await supabase
                    .from('workbook_parts')
                    .select('*')
                    .gte('date', today.toISOString().split('T')[0])
                    .lte('date', addDays(today, 35).toISOString().split('T')[0]);

                if (err30) throw err30;

                // Agrupar por semana
                const weeksMap = new Map<string, WorkbookPart[]>();
                (parts30 as WorkbookPart[]).forEach(p => {
                    const ws = weeksMap.get(p.weekId) || [];
                    ws.push(p);
                    weeksMap.set(p.weekId, ws);
                });

                for (const [weekId, parts] of weeksMap.entries()) {
                    // Checar se a semana é alvo de D-30
                    if (!parts.length) continue;
                    const weekDate = new Date(parts[0].date);
                    const diffTime = Math.abs(weekDate.getTime() - today.getTime());
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays === 30 || diffDays === 29 || diffDays === 31) {
                        appendLog(`Semana ${weekId} está no alvo D-30 (diff: ${diffDays} dias).`);
                        
                        // Verifica se está vazia (a maioria sem resolvedPublisherId)
                        const vazias = parts.filter(p => !p.resolvedPublisherId && p.tipoParte !== 'Cântico');
                        if (vazias.length > parts.length / 2) {
                            // Tenta logar no bd para evitar duplicação
                            const { error: logErr } = await supabase.from('automation_bot_log').insert({
                                week_id: weekId,
                                action_type: 'D-30_GENERATION',
                                status: 'RUNNING',
                                details: { reason: 'batch D-30' }
                            });

                            if (logErr) {
                                appendLog(`⚠️ Semana ${weekId} D-30 já rodou hoje ou log falhou. Ignorando.`);
                                continue;
                            }

                            appendLog(`🚀 Rodando Geração em Lote para ${weekId}...`);
                            try {
                                const genRes = await generationService.generateDesignations(parts, publishers, { isDryRun: false, skipLocalNeeds: false, preventWeekendClashes: true });
                                appendLog(`✅ Geração ${weekId} OK: ${genRes.successful} sucessos, ${genRes.failed} falhas.`);
                                
                                await supabase.from('automation_bot_log').update({ status: 'SUCCESS', details: genRes }).eq('week_id', weekId).eq('action_type', 'D-30_GENERATION');

                                // Avisar Admin
                                const msg = `🤖 *Robô RVM*\nAs designações da semana ${weekId} foram geradas em lote (Faltam ~30 dias). Acesse o sistema para revisar.`;
                                // Pega o Z-API admin group ou manda para o master
                                const { data: sets } = await supabase.from('app_settings').select('value').eq('key', 'admin_whatsapp_group').single();
                                if (sets?.value) {
                                    await zapiOrchestrator.sendS89Direct('admin-alert', sets.value, msg, '', 'RECUSA_ALERTA');
                                }
                            } catch (e: any) {
                                appendLog(`❌ Erro Geração ${weekId}: ${e.message}`);
                                await supabase.from('automation_bot_log').update({ status: 'ERROR', details: { error: e.message } }).eq('week_id', weekId).eq('action_type', 'D-30_GENERATION');
                            }
                        }
                    }

                    // D-21: PUBLICAÇÃO
                    if (diffDays === 21 || diffDays === 20 || diffDays === 22) {
                        appendLog(`Semana ${weekId} está no alvo D-21 (diff: ${diffDays} dias).`);
                        
                        // Verifica se tem partes para publicar
                        const pDesignaveis = parts.filter(p => p.resolvedPublisherId && p.status === 'PROPOSTA');
                        if (pDesignaveis.length > 0) {
                            const { error: logErr } = await supabase.from('automation_bot_log').insert({
                                week_id: weekId,
                                action_type: 'D-21_PUBLICATION',
                                status: 'RUNNING',
                                details: { reason: 'batch D-21' }
                            });

                            if (logErr) {
                                appendLog(`⚠️ Semana ${weekId} D-21 já rodou hoje ou log falhou. Ignorando.`);
                                continue;
                            }

                            appendLog(`🚀 Rodando Publicação em Lote para ${weekId}...`);
                            try {
                                // Cria um container invisível pro html2canvas
                                const container = document.createElement('div');
                                container.id = 'automation-offscreen-container';
                                container.style.position = 'absolute';
                                container.style.left = '-9999px';
                                document.body.appendChild(container);

                                const pubRes = await publishWeek(weekId, parts, publishers, container);
                                document.body.removeChild(container);
                                
                                appendLog(`✅ Publicação ${weekId} OK: ${pubRes.s89Sent} enviados.`);
                                await supabase.from('automation_bot_log').update({ status: 'SUCCESS', details: pubRes }).eq('week_id', weekId).eq('action_type', 'D-21_PUBLICATION');
                            } catch (e: any) {
                                appendLog(`❌ Erro Publicação ${weekId}: ${e.message}`);
                                await supabase.from('automation_bot_log').update({ status: 'ERROR', details: { error: e.message } }).eq('week_id', weekId).eq('action_type', 'D-21_PUBLICATION');
                            }
                        }
                    }
                }

                appendLog('🏁 Worker finalizado.');
            } catch (err: any) {
                appendLog(`💥 Erro fatal no worker: ${err.message}`);
            } finally {
                setDone(true);
            }
        };

        runAutomations();
    }, [token]);

    return (
        <div style={{ padding: 20, fontFamily: 'monospace', background: '#111', color: '#0f0', minHeight: '100vh' }}>
            <h1 id="worker-status">{done ? 'FINISHED' : 'RUNNING'}</h1>
            {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
    );
};
