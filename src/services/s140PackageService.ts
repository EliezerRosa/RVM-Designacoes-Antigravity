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

            const { data: publishedRecords } = await supabase
                .from('week_published')
                .select('week_id')
                .gte('week_id', currentMonday);

            const publishedWeekIds = (publishedRecords || []).map(r => r.week_id);
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
                    list.push({ ...p, resolvedPublisherName: newPublisherName, status: 'PRONTO' });
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
        const { data: publishedRecords } = await supabase
            .from('week_published')
            .select('week_id')
            .gte('week_id', currentMonday)
            .order('week_id');

        const publishedWeekIds = (publishedRecords || []).map(r => r.week_id);
        if (publishedWeekIds.length === 0) {
            console.log('[s140PackageService] Nenhuma semana publicada ativa encontrada. Silêncio.');
            return { sent: false, reason: 'NO_PUBLISHED_WEEKS' };
        }

        // 2. Carrega as partes de todas as semanas publicadas
        const { data: allPartsData } = await supabase
            .from('workbook_parts')
            .select('*')
            .in('week_id', publishedWeekIds);

        const partsByWeek = new Map<string, WorkbookPart[]>();
        for (const p of (allPartsData || [])) {
            const wId = p.week_id || p.weekId;
            const list = partsByWeek.get(wId) || [];
            list.push(p);
            partsByWeek.set(wId, list);
        }

        // 3. Compara com o snapshot anterior
        const snapshot = await this.loadSnapshot();
        const newWeeks: string[] = [];
        const modifiedWeeks: { weekId: string; changedSummary: string[] }[] = [];

        for (const wId of publishedWeekIds) {
            const wParts = partsByWeek.get(wId) || [];
            const currentSig = this.calculateWeekSignature(wParts);
            const prev = snapshot.weeks[wId];

            if (!prev) {
                // Nova semana publicada no horizonte!
                newWeeks.push(wId);
            } else if (prev.signature !== currentSig) {
                // Houve substituições nesta semana
                modifiedWeeks.push({
                    weekId: wId,
                    changedSummary: [`Semana ${this.formatDateDisplay(wId)} com ajustes de participantes`],
                });
            }
        }

        // Se NÃO houve novas semanas E NÃO houve alterações de designação:
        if (newWeeks.length === 0 && modifiedWeeks.length === 0) {
            console.log('[s140PackageService] Nenhuma novidade no Pacote (sem novas semanas e sem trocas). Silêncio total.');
            return { sent: false, reason: 'NO_CHANGES' };
        }

        console.log(`[s140PackageService] Novidades detectadas! Novas semanas: ${newWeeks.length}, Semanas ajustadas: ${modifiedWeeks.length}`);

        // 4. Renderiza imagens S-140 de todas as semanas do Pacote
        const imagesByWeek: Record<string, string> = {};
        for (const wId of publishedWeekIds) {
            const wParts = partsByWeek.get(wId) || [];
            if (wParts.length > 0) {
                const base64 = await generateS140ImageBase64(wParts, publishers);
                if (base64) imagesByWeek[wId] = base64;
            }
        }

        // 5. Monta texto explicativo adaptativo
        const periodStart = this.formatDateDisplay(publishedWeekIds[0]);
        const periodEnd = this.formatDateDisplay(publishedWeekIds[publishedWeekIds.length - 1]);

        let updatesText = '';
        if (newWeeks.length > 0 && modifiedWeeks.length === 0) {
            updatesText = `✨ *Nova(s) Semana(s) Oficialmente Publicada(s):*\n` +
                newWeeks.map(w => `• *Semana de ${this.formatDateDisplay(w)}*`).join('\n') +
                `\n\n_Nota: Não houve alterações de designações nas semanas anteriores._`;
        } else if (newWeeks.length > 0 && modifiedWeeks.length > 0) {
            updatesText = `✨ *Nova(s) Semana(s) Publicada(s):*\n` +
                newWeeks.map(w => `• *Semana de ${this.formatDateDisplay(w)}*`).join('\n') +
                `\n\n🔄 *Ajustes de Designação Realizados:*\n` +
                modifiedWeeks.map(m => `• *Semana de ${this.formatDateDisplay(m.weekId)}:* Atualizada com novas designações`).join('\n');
        } else {
            updatesText = `🔄 *Ajustes de Designação Realizados:*\n` +
                modifiedWeeks.map(m => `• *Semana de ${this.formatDateDisplay(m.weekId)}:* Atualizada com novas designações`).join('\n');
        }

        const packageCaption =
            `📦 *PACOTE DE PROGRAMAÇÃO RVM — S-140 ATUALIZADO* 📦\n` +
            `🏛️ *Congregação Parque Jacaraípe*\n` +
            `📅 *Período Atualizado:* ${periodStart} até ${periodEnd}\n\n` +
            `Informamos as atualizações na programação oficial:\n\n` +
            `${updatesText}\n\n` +
            `Seguem em anexo as folhas do programa oficial *S-140* das semanas publicadas.\n\n` +
            `📌 *Ao Responsável pelo Quadro de Anúncios:* Por favor, providencie a afixação/substituição das vias atualizadas no mural do Salão do Reino.`;

        // 6. Despacha o Pacote Completo para Grupo, Equipe RVM e Quadro
        const fullPackageRecipients = await this.resolveFullPackageRecipients(publishers);
        for (const recipient of fullPackageRecipients) {
            for (const wId of publishedWeekIds) {
                const img = imagesByWeek[wId];
                if (img) {
                    const isFirst = wId === publishedWeekIds[0];
                    const cap = isFirst ? packageCaption : `Programa S-140 oficial — semana de ${this.formatDateDisplay(wId)}.`;
                    await zapiOrchestrator.sendImageDirect(recipient, img, cap);
                    await zapiOrchestrator.logDispatch(null, 'S140_PACOTE_SEMANAL', recipient, 'SUCCESS');
                    
                    // P9: Jittering para evitar bloqueios de spam na Z-API
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }

        // 7. Despacha S-140 ÚNICO para o Presidente de cada semana afetada ou nova
        const weeksNeedingPresidentNotification = new Set([...newWeeks, ...modifiedWeeks.map(m => m.weekId)]);

        for (const wId of weeksNeedingPresidentNotification) {
            const wParts = partsByWeek.get(wId) || [];
            const pres = this.resolveWeekPresident(wParts, publishers);
            const wImg = imagesByWeek[wId];

            if (pres?.phone && wImg) {
                // P9: Jittering para evitar bloqueios de spam na Z-API
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const presCaption =
                    `🏛️ *Reunião Vida e Ministério — Parque Jacaraípe*\n` +
                    `📅 *Semana da Reunião:* ${this.formatDateDisplay(wId)}\n` +
                    `👤 *Prezado Presidente da Reunião:* ${pres.name}\n\n` +
                    `Informamos as atualizações oficiais na escala da reunião que você presidirá:\n\n` +
                    `Segue em anexo o programa oficial *S-140 atualizado* exclusivo da sua semana para a condução do programa.`;

                console.log(`[s140PackageService] Enviando folha única ao Presidente da semana ${wId}: ${pres.name}`);
                await zapiOrchestrator.sendImageDirect(pres.phone, wImg, presCaption);
                await zapiOrchestrator.logDispatch(null, 'S140_PRESIDENTE_INDIVIDUAL', pres.phone, 'SUCCESS');
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
