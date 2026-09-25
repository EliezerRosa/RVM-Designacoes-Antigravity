/**
 * s140PackageService — RVM Designações
 * 
 * Arquitetura de Distribuição do S-140 em 3 Modos:
 * 
 * - MODO 1: Regular Semanal (Segunda-feira às 08:00 BRT via cron)
 *   Avalia novidades (novas semanas publicadas ou trocas acumuladas).
 *   Despacha Pacote Completo para Grupo + Equipe RVM + Quadro de Anúncios.
 *   Despacha folha única para cada Presidente cuja semana teve ajuste.
 *   Se nada mudou: Silêncio total.
 * 
 * - MODO 2: Emergência na Semana em Curso (Pós-Segunda-feira)
 *   Disparado imediatamente quando uma substituição ocorre na semana ativa.
 *   Grupo + Equipe RVM + Quadro recebem o Pacote Completo atualizado + texto.
 *   Presidente da semana atual recebe estritamente a folha única da semana dele + texto.
 * 
 * - MODO 3: Incidental Manual
 *   Disparo sob demanda acionado pelo operador no painel.
 */

import { supabase } from '../lib/supabase';
import type { Publisher, WorkbookPart } from '../types';
import { getWeekMondayId } from './eligibilityService';
import { zapiOrchestrator } from './zapiOrchestrator';
import { congregationRoleService } from './congregationRoleService';
import { generateS140ImageBase64 } from './s140GeneratorUnified';

export interface S140WeekSummary {
    weekId: string;
    parts: WorkbookPart[];
    isNewWeek?: boolean;
    modifiedParts?: {
        tipoParte: string;
        oldName: string;
        newName: string;
    }[];
}

interface S140SnapshotData {
    lastDispatchedAt: string;
    weeks: {
        [weekId: string]: {
            published: boolean;
            signature: string;
            partsCount: number;
        };
    };
}

export const s140PackageService = {
    /**
     * Verifica se a semana informada é a semana em curso (reunião desta semana).
     */
    isCurrentWeek(weekId: string): boolean {
        const todayStr = new Date().toISOString().slice(0, 10);
        const currentMonday = getWeekMondayId(todayStr);
        return weekId === currentMonday;
    },

    /**
     * Gera assinatura de integridade para uma semana baseada nas designações das partes.
     */
    calculateWeekSignature(parts: WorkbookPart[]): string {
        const sorted = [...parts].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        return sorted.map(p => {
            const pubId = p.resolvedPublisherId || '';
            const pubName = (p.resolvedPublisherName || p.rawPublisherName || '').trim();
            const tipo = (p.tipoParte || '').trim();
            return `${p.id}:${tipo}:${pubId}:${pubName}`;
        }).join('|');
    },

    /**
     * Extrai quais tipos de partes mudaram comparando a assinatura atual com a anterior.
     */
    getChangedPartTypes(prevSig: string, currentParts: WorkbookPart[]): string[] {
        if (!prevSig) return [];
        const prevPartsMap = new Map<string, string>();
        prevSig.split('|').forEach(str => {
            const [id, tipo, pubId, pubName] = str.split(':');
            if (id) prevPartsMap.set(id, str);
        });

        const currentSigStr = this.calculateWeekSignature(currentParts);
        const currentPartsMap = new Map<string, string>();
        currentSigStr.split('|').forEach(str => {
            const [id, tipo, pubId, pubName] = str.split(':');
            if (id) currentPartsMap.set(id, str);
        });

        const changedTypes = new Set<string>();

        for (const [id, curStr] of currentPartsMap.entries()) {
            const prevStr = prevPartsMap.get(id);
            if (prevStr !== curStr) {
                const part = currentParts.find(p => p.id === id);
                if (part) {
                    const titulo = (part as any).titulo_parte || part.tituloParte || '';
                    const tipo = (part as any).tipo_parte || part.tipoParte || '';
                    const finalName = (titulo || tipo || 'Designação').trim();
                    const finalLower = finalName.toLowerCase();

                    // Ignorar partes menores (Cânticos, Oração Inicial, Elogios e Conselhos) no aviso do WhatsApp
                    if (
                        finalLower.match(/^cântico \d+/) ||
                        (finalLower.includes('oração') && !finalLower.includes('final')) ||
                        (finalLower.includes('oracao') && !finalLower.includes('final')) ||
                        finalLower.includes('elogios e conselhos')
                    ) {
                        continue;
                    }

                    changedTypes.add(finalName);
                }
            }
        }

        return Array.from(changedTypes);
    },

    /**
     * Carrega o snapshot salvo em app_settings.
     */
    async loadSnapshot(): Promise<S140SnapshotData> {
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 's140_snapshots')
                .maybeSingle();

            if (data?.value && typeof data.value === 'object' && data.value.weeks) {
                return data.value as S140SnapshotData;
            }
        } catch (err) {
            console.warn('[s140PackageService] Falha ao carregar snapshot:', err);
        }

        return {
            lastDispatchedAt: '',
            weeks: {},
        };
    },

    /**
     * Salva snapshot atualizado em app_settings.
     */
    async saveSnapshot(snapshot: S140SnapshotData): Promise<void> {
        try {
            await supabase.from('app_settings').upsert({
                key: 's140_snapshots',
                value: snapshot as any,
            }, { onConflict: 'key' });
        } catch (err) {
            console.error('[s140PackageService] Erro ao salvar snapshot:', err);
        }
    },

    /**
     * Identifica o Presidente da Reunião para uma determinada semana.
     * Se a parte de presidente foi substituída, retorna o publicador atualizado.
     */
    resolveWeekPresident(weekParts: WorkbookPart[], publishers: Publisher[]): { name: string; phone?: string } | null {
        const presidentPart = weekParts.find(p => {
            const t = (p.tipoParte || '').toLowerCase();
            const tit = (p.tituloParte || '').toLowerCase();
            return t === 'presidente' || t === 'presidente da reunião' || tit.includes('presidente');
        });

        if (!presidentPart) return null;

        const resolvedName = presidentPart.resolvedPublisherName || presidentPart.rawPublisherName || '';
        const pub = publishers.find(p => {
            if (presidentPart.resolvedPublisherId && p.id === presidentPart.resolvedPublisherId) return true;
            return p.name.trim().toLowerCase() === resolvedName.trim().toLowerCase();
        });

        return {
            name: pub?.name || resolvedName || 'Presidente da Reunião',
            phone: pub?.phone || (pub as any)?.data?.phone || undefined,
        };
    },

    /**
     * Resolve todos os destinatários institucionais do PACOTE COMPLETO:
     * - Grupo WhatsApp da liderança
     * - Equipe RVM (Admin, SRVM, Ajudante do SRVM)
     * - Responsável pelo Quadro de Anúncios
     */
    async resolveFullPackageRecipients(publishers: Publisher[]): Promise<string[]> {
        await congregationRoleService.ensureGroupSettingsSynced();

        const recipients = new Set<string>();

        // 1. Grupo de Notificações
        const groupId = await zapiOrchestrator.getAdminGroupId();
        if (groupId) recipients.add(groupId);

        // 2. SRVM e Ajudante do SRVM
        const [srvmPhone, ajdPhone] = await Promise.all([
            zapiOrchestrator.getSrvmPhone(),
            zapiOrchestrator.getAjdSrvmPhone(),
        ]);
        if (srvmPhone) recipients.add(srvmPhone);
        if (ajdPhone) recipients.add(ajdPhone);

        // 3. Admins cadastrados em app_settings ou perfis
        try {
            const { data: appSettings } = await supabase.from('app_settings').select('value').eq('key', 'admin_phones').maybeSingle();
            if (appSettings?.value && Array.isArray(appSettings.value)) {
                for (const ph of appSettings.value) {
                    if (typeof ph === 'string' && ph.trim().length > 0) recipients.add(ph.trim());
                }
            }
        } catch {}

        for (const p of publishers) {
            if (p.active !== false && (p as any).data?.role === 'admin' && p.phone) {
                recipients.add(p.phone.trim());
            }
        }

        // 4. Responsável pelo Quadro de Anúncios
        const quadroPhones = congregationRoleService.getQuadroAnunciosPhones(publishers);
        for (const qp of quadroPhones) {
            recipients.add(qp.trim());
        }

        return Array.from(recipients).filter(x => !!x && x.length > 0);
    },

    /**
     * Formata uma data YYYY-MM-DD para o padrão visual DD/MM/YYYY.
     */
    formatDateDisplay(dateStr: string): string {
        const [y, m, d] = dateStr.split('-');
        if (!y || !m || !d) return dateStr;
        return `${d}/${m}/${y}`;
    },

    /**
     * MODO 2: Ajuste na Semana em Curso (Pós-Segunda-feira).
     * Disparado imediatamente após substituição na semana ativa.
     */
    async handlePartAdjustment({
        part,
        oldPublisherName,
        newPublisherName,
        weekParts,
        publishers,
    }: {
        part: WorkbookPart;
        oldPublisherName: string;
        newPublisherName: string;
        weekParts: WorkbookPart[];
        publishers: Publisher[];
    }): Promise<void> {
        const isCurrent = this.isCurrentWeek(part.weekId);

        // Se for semana futura: apenas atualiza o banco para consolidação no Modo 1 (Segunda-feira)
        if (!isCurrent) {
            console.log(`[s140PackageService] Ajuste na semana futura ${part.weekId}. Será consolidado no Pacote da próxima segunda-feira.`);
            return;
        }

        console.log(`[s140PackageService] 🚨 MODO 2 ATIVADO: Ajuste de emergência na semana em curso (${part.weekId})!`);

        try {
            // 1. Carrega todas as semanas publicadas da congregação (da semana atual em diante)
            const todayStr = new Date().toISOString().slice(0, 10);
            const currentMonday = getWeekMondayId(todayStr);

            const { data: wpData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'week_published')
                .maybeSingle();

            const publishedMap = (wpData?.value as Record<string, string>) || {};
            const publishedWeekIds = Object.keys(publishedMap)
                .filter(wId => wId >= currentMonday);
            if (!publishedWeekIds.includes(part.weekId)) {
                publishedWeekIds.push(part.weekId);
            }
            publishedWeekIds.sort();

            // 2. Busca partes de todas as semanas publicadas
            const { data: allPartsData } = await supabase
                .from('workbook_parts')
                .select('*')
                .in('week_id', publishedWeekIds);

            const partsByWeek = new Map<string, WorkbookPart[]>();
            for (const p of (allPartsData || [])) {
                const wId = p.week_id || p.weekId;
                const list = partsByWeek.get(wId) || [];
                // Se a parte for a que acabamos de atualizar, aplica os dados novos em memória
                if (p.id === part.id) {
                    list.push({ ...p, resolvedPublisherName: newPublisherName, status: 'DESIGNADA' });
                } else {
                    list.push(p);
                }
                partsByWeek.set(wId, list);
            }

            // Garante que a semana em curso tenha suas partes
            if (!partsByWeek.has(part.weekId)) {
                partsByWeek.set(part.weekId, weekParts);
            }

            // 3. Renderiza as imagens S-140 de cada semana publicada
            const imagesByWeek: Record<string, string> = {};
            for (const wId of publishedWeekIds) {
                const wParts = partsByWeek.get(wId) || [];
                if (wParts.length > 0) {
                    const base64 = await generateS140ImageBase64(wParts, publishers);
                    if (base64) imagesByWeek[wId] = base64;
                }
            }

            const currentWeekImage = imagesByWeek[part.weekId];

            // 4. Resolve Destinatários
            const fullPackageRecipients = await this.resolveFullPackageRecipients(publishers);
            const currentPresident = this.resolveWeekPresident(partsByWeek.get(part.weekId) || weekParts, publishers);

            // 5. Monta Textos
            const tipoParte = part.tituloParte || part.tipoParte || 'Designação';
            const weekDisplay = this.formatDateDisplay(part.date || part.weekId);

            // Texto A: Pacote Completo (Grupo + Equipe RVM + Quadro)
            const packageCaption =
                `📦 *PACOTE DE PROGRAMAÇÃO RVM — S-140 ATUALIZADO* 📦\n` +
                `🏛️ *Congregação Parque Jacaraípe*\n` +
                `📅 *Semana em Curso:* ${weekDisplay}\n\n` +
                `⚠️ *Aviso de Ajuste de Última Hora na Semana em Curso:*\n` +
                `• *Parte:* ${tipoParte}\n` +
                `• *Substituição:* ~${oldPublisherName}~ ➡️ *${newPublisherName}*\n\n` +
                `Seguem em anexo as folhas oficiais *S-140* das semanas publicadas com a atualização desta semana.\n\n` +
                `📌 *Ao Responsável pelo Quadro de Anúncios:* Por favor, providencie a substituição imediata da via impressa no mural do Salão do Reino antes da reunião.`;

            // Texto B: S-140 Único (Exclusivo ao Presidente da Reunião desta semana)
            const presidentCaption =
                `🏛️ *Reunião Vida e Ministério — Parque Jacaraípe*\n` +
                `📅 *Semana da Reunião:* ${weekDisplay}\n` +
                `👤 *Prezado Presidente da Reunião:* ${currentPresident?.name || 'Irmão'}\n\n` +
                `Informamos que houve um ajuste na escala para a reunião que você presidirá esta semana:\n\n` +
                `📝 *Ajuste Realizado:*\n` +
                `• *Parte:* ${tipoParte}\n` +
                `• *Substituição:* ~${oldPublisherName}~ ➡️ *${newPublisherName}*\n\n` +
                `Segue em anexo o programa oficial *S-140 atualizado* exclusivo da sua reunião para a condução do programa.`;

            // 6. Despacha o Pacote Completo para Grupo, Equipe RVM e Quadro
            for (const recipient of fullPackageRecipients) {
                for (const wId of publishedWeekIds) {
                    const img = imagesByWeek[wId];
                    if (img) {
                        const isFirst = wId === publishedWeekIds[0];
                        const cap = isFirst ? packageCaption : `Programa S-140 oficial — semana de ${this.formatDateDisplay(wId)}.`;
                        await zapiOrchestrator.sendImageDirect(recipient, img, cap);
                        await zapiOrchestrator.logDispatch(null, 'S140_PACOTE_EMERGENCIA', recipient, 'SUCCESS');
                        
                        // P9: Jittering para evitar bloqueios de spam na Z-API
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }

            // 7. Despacha S-140 ÚNICO para o Presidente da semana (Comportamento 2: sempre envia sua folha)
            if (currentPresident?.phone && currentWeekImage) {
                console.log(`[s140PackageService] Enviando folha única ao Presidente da semana: ${currentPresident.name} (${currentPresident.phone})`);
                await zapiOrchestrator.sendImageDirect(currentPresident.phone, currentWeekImage, presidentCaption);
                await zapiOrchestrator.logDispatch(null, 'S140_PRESIDENTE_INDIVIDUAL', currentPresident.phone, 'SUCCESS');
            }

            // 8. Atualiza o snapshot para refletir a semana corrigida
            const snapshot = await this.loadSnapshot();
            snapshot.lastDispatchedAt = new Date().toISOString();
            for (const wId of publishedWeekIds) {
                const wParts = partsByWeek.get(wId) || [];
                snapshot.weeks[wId] = {
                    published: true,
                    signature: this.calculateWeekSignature(wParts),
                    partsCount: wParts.length,
                };
            }
            await this.saveSnapshot(snapshot);

            console.log('[s140PackageService] ✅ MODO 2 concluído com sucesso.');
        } catch (err) {
            console.error('[s140PackageService] Erro na execução do MODO 2:', err);
        }
    },

    /**
     * MODO 1: Envio Regular de Segunda-feira (08:00 BRT).
     * Avalia novidades (novas semanas publicadas ou trocas acumuladas) e despacha.
     */
    async dispatchWeeklyPackageIfPending(publishers: Publisher[]): Promise<{ sent: boolean; reason?: string }> {
        console.log('[s140PackageService] Executando verificação regular de segunda-feira (MODO 1)...');

        const todayStr = new Date().toISOString().slice(0, 10);
        const currentMonday = getWeekMondayId(todayStr);

        // 1. Carrega todas as semanas publicadas da congregação (da atual em diante)
        const { data: wpData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'week_published')
            .maybeSingle();

        const publishedMap = (wpData?.value as Record<string, string>) || {};
        const publishedWeekIds = Object.keys(publishedMap)
            .filter(wId => wId >= currentMonday)
            .sort();
        if (publishedWeekIds.length === 0) {
            console.log('[s140PackageService] Nenhuma semana publicada ativa encontrada. Silêncio.');
            return { sent: false, reason: 'NO_PUBLISHED_WEEKS' };
        }

        // 2. Carrega as partes de todas as semanas publicadas
        const { data: allPartsData } = await supabase
            .from('workbook_parts')
            .select('*')
            .in('week_id', publishedWeekIds);

        const { mapDbToWorkbookPart } = await import('./workbookService');
        const allPartsMapped = (allPartsData || []).map(row => mapDbToWorkbookPart(row));

        const partsByWeek = new Map<string, WorkbookPart[]>();
        for (const p of allPartsMapped) {
            const wId = p.weekId;
            const list = partsByWeek.get(wId) || [];
            list.push(p);
            partsByWeek.set(wId, list);
        }

        // 3. Compara com o snapshot anterior
        const snapshot = await this.loadSnapshot();
        const newWeeks: string[] = [];
        const modifiedWeeks: { weekId: string; changedSummary: string[]; changedTypes: string[] }[] = [];

        for (const wId of publishedWeekIds) {
            const wParts = partsByWeek.get(wId) || [];
            const currentSig = this.calculateWeekSignature(wParts);
            const prev = snapshot.weeks[wId];

            if (!prev) {
                // Nova semana publicada no horizonte!
                newWeeks.push(wId);
            } else if (prev.signature !== currentSig) {
                // Houve substituições nesta semana
                const changedTypes = this.getChangedPartTypes(prev.signature, wParts);
                modifiedWeeks.push({
                    weekId: wId,
                    changedSummary: [`Semana ${this.formatDateDisplay(wId)} com ajustes de participantes`],
                    changedTypes
                });
            }
        }

        // Se NÃO houve novas semanas E NÃO houve alterações de designação:
        if (newWeeks.length === 0 && modifiedWeeks.length === 0) {
            console.log('[s140PackageService] Nenhuma novidade no Pacote (sem novas semanas e sem trocas). Silêncio total.');
            return { sent: false, reason: 'NO_CHANGES' };
        }

        console.log(`[s140PackageService] Novidades detectadas! Novas semanas: ${newWeeks.length}, Semanas ajustadas: ${modifiedWeeks.length}`);

        // 4. Renderiza o Documento PDF S-140 de todas as semanas do Pacote
        const allPartsFlat = Array.from(partsByWeek.values()).flat();
        const { generateS140UnifiedMultiWeekPdfBase64 } = await import('./s140GeneratorUnified');
        
        const { base64: globalPdfBase64, weekRange } = await generateS140UnifiedMultiWeekPdfBase64(allPartsFlat, publishedWeekIds, publishers);

        // 5. Monta texto explicativo adaptativo com Destaque de Versão/Data e Semanas
        const periodStart = this.formatDateDisplay(publishedWeekIds[0]);
        const periodEnd = this.formatDateDisplay(publishedWeekIds[publishedWeekIds.length - 1]);
        
        const dataVersao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

        const formatModifiedWeek = (m: any) => {
            let text = `• *Semana de ${this.formatDateDisplay(m.weekId)}:* Atualizada com novas designações`;
            if (m.changedTypes && m.changedTypes.length > 0) {
                text += `\n  ↳ _Ajustes em: ${m.changedTypes.join(', ')}_`;
            }
            return text;
        };

        let updatesText = '';
        if (newWeeks.length > 0 && modifiedWeeks.length === 0) {
            updatesText = `✨ *Nova(s) Semana(s) Oficialmente Publicada(s):*\n` +
                newWeeks.map(w => `• *Semana de ${this.formatDateDisplay(w)}*`).join('\n') +
                `\n\n_Nota: Não houve alterações de designações nas semanas anteriores._`;
        } else if (newWeeks.length > 0 && modifiedWeeks.length > 0) {
            updatesText = `✨ *Nova(s) Semana(s) Publicada(s):*\n` +
                newWeeks.map(w => `• *Semana de ${this.formatDateDisplay(w)}*`).join('\n') +
                `\n\n🔄 *Ajustes de Designação Realizados:*\n` +
                modifiedWeeks.map(formatModifiedWeek).join('\n');
        } else {
            updatesText = `🔄 *Ajustes de Designação Realizados:*\n` +
                modifiedWeeks.map(formatModifiedWeek).join('\n');
        }

        const packageCaption =
            `📦 *PACOTE DE PROGRAMAÇÃO RVM — S-140 ATUALIZADO* 📦\n` +
            `🏛️ *Congregação Parque Jacaraípe*\n\n` +
            `🚨 *VERSÃO OFICIAL DO PACOTE*\n` +
            `⏱️ *Emitido em:* ${dataVersao}\n` +
            `📅 *Semanas Inclusas:* ${periodStart} até ${periodEnd}\n\n` +
            `Informamos as atualizações na programação:\n\n` +
            `${updatesText}\n\n` +
            `Segue anexo o documento oficial em *PDF*.\n` +
            `📌 *Ao Responsável pelo Quadro de Anúncios:* Por favor, providencie a substituição no mural do Salão.`;

        // 6. Despacha o Pacote Completo (PDF) para Grupo, Equipe RVM e Quadro
        if (globalPdfBase64) {
            const fullPackageRecipients = await this.resolveFullPackageRecipients(publishers);
            const fileName = `S-140-Pacote_${weekRange}.pdf`;
            
            for (const recipient of fullPackageRecipients) {
                await zapiOrchestrator.sendDocumentDirect(recipient, globalPdfBase64, 'pdf', fileName, packageCaption);
                await zapiOrchestrator.logDispatch(null, 'S140_PACOTE_SEMANAL', recipient, 'SUCCESS');
                
                // P9: Jittering para evitar bloqueios de spam na Z-API
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // 7. Despacha S-140 ÚNICO (PDF) para o Presidente de cada semana afetada ou nova
        const weeksNeedingPresidentNotification = new Set([...newWeeks, ...modifiedWeeks.map(m => m.weekId)]);

        for (const wId of weeksNeedingPresidentNotification) {
            const pres = this.resolveWeekPresident(partsByWeek.get(wId) || [], publishers);
            
            if (pres?.phone) {
                // Gera um PDF contendo apenas a semana deste presidente
                const { base64: presPdfBase64 } = await generateS140UnifiedMultiWeekPdfBase64(allPartsFlat, [wId], publishers);
                
                if (presPdfBase64) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    const isNew = newWeeks.includes(wId);
                    const modifiedWeek = modifiedWeeks.find(m => m.weekId === wId);
                    let statusText = '';
                    if (isNew) {
                        statusText = `✨ Esta semana acaba de ser *oficialmente publicada* para a congregação.`;
                    } else if (modifiedWeek) {
                        let detalhes = '';
                        if (modifiedWeek.changedTypes && modifiedWeek.changedTypes.length > 0) {
                            detalhes = `\n  ↳ _Ajustes em: ${modifiedWeek.changedTypes.join(', ')}_`;
                        }
                        statusText = `🔄 Houve *ajustes recentes nas designações* (participantes) desta semana. Por favor, avalie a nova escala.${detalhes}`;
                    }
                    
                    const presCaption =
                        `🏛️ *Reunião Vida e Ministério — Parque Jacaraípe*\n` +
                        `🚨 *VERSÃO ATUALIZADA:* ${dataVersao}\n\n` +
                        `📅 *Semana da Reunião:* ${this.formatDateDisplay(wId)}\n` +
                        `👤 *Prezado Presidente da Reunião:* ${pres.name}\n\n` +
                        `${statusText}\n\n` +
                        `Segue anexo o documento oficial *S-140 em PDF* exclusivo da sua semana.`;

                    console.log(`[s140PackageService] Enviando PDF único ao Presidente da semana ${wId}: ${pres.name}`);
                    await zapiOrchestrator.sendDocumentDirect(pres.phone, presPdfBase64, 'pdf', `S-140_${wId}.pdf`, presCaption);
                    await zapiOrchestrator.logDispatch(null, 'S140_PRESIDENTE_INDIVIDUAL', pres.phone, 'SUCCESS');
                }
            }
        }

        // 8. Atualiza o snapshot salvo no banco
        snapshot.lastDispatchedAt = new Date().toISOString();
        for (const wId of publishedWeekIds) {
            const wParts = partsByWeek.get(wId) || [];
            snapshot.weeks[wId] = {
                published: true,
                signature: this.calculateWeekSignature(wParts),
                partsCount: wParts.length,
            };
        }
        await this.saveSnapshot(snapshot);

        console.log('[s140PackageService] ✅ MODO 1 concluído com sucesso.');
        return { sent: true };
    },

    /**
     * MODO 3: Disparo Incidental Manual (Sob Demanda).
     */
    async dispatchPackageManual(publishers: Publisher[]): Promise<{ success: boolean; attempted: number }> {
        console.log('[s140PackageService] Disparo incidental manual (MODO 3) acionado...');
        const res = await this.dispatchWeeklyPackageIfPending(publishers);
        // Se res.sent for false por NO_CHANGES, força o envio manual
        if (!res.sent && res.reason === 'NO_CHANGES') {
            const snapshot = await this.loadSnapshot();
            snapshot.weeks = {}; // Reseta o cache de assinaturas para forçar envio
            await this.saveSnapshot(snapshot);
            const retryRes = await this.dispatchWeeklyPackageIfPending(publishers);
            return { success: retryRes.sent, attempted: 1 };
        }
        return { success: res.sent, attempted: 1 };
    }
};
