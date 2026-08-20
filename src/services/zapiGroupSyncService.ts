/**
 * zapiGroupSyncService.ts — Serviço de Reconciliação & Sincronização em Lote de Contatos do WhatsApp (Z-API)
 * com Publicadores e Perfis (2FA) no RVM Designações.
 */

import { supabase } from '../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from './whatsappAutoService';

export interface WaGroupParticipant {
    phone: string;
    name?: string;
    pushName?: string;
    notifyName?: string;
    shortName?: string;
    admin?: boolean;
}

export interface ReconciliationItem {
    id: string;
    waPhone: string;          // Telefone formatado do grupo Zap
    cleanPhone: string;       // Telefone limpo do grupo Zap
    waName: string;           // Nome vindo do WhatsApp
    waPushName?: string;      // Nome do perfil público (~Nome do WhatsApp)
    isPushName: boolean;      // True se o nome for de perfil não salvo na agenda (~Nome)
    publisherId: string | null;
    publisherName: string | null;
    rvmPhone: string | null;   // Telefone cadastrado no RVM
    rvmDispPhone: string | null; // Telefone formatado do RVM
    hasPhoneMismatch: boolean; // True se o número do grupo for diferente do RVM
    matchType: 'EXACT_PHONE' | 'NAME_MATCH' | 'UNMATCHED';
    profileId: string | null;
    profileEmail: string | null;
    isVerified2FA: boolean;
    hasRespondedLink: boolean;
    status: 'SYNCED' | 'PHONE_UPDATE_NEEDED' | 'PENDING_2FA' | 'UNMATCHED_WA';
    selected: boolean;
}

function normalizePhone(phone: string): string {
    let clean = (phone || '').replace(/\D/g, '');
    if (clean.startsWith('55') && clean.length > 11) {
        clean = clean.slice(2); // Remove o 55 inicial para padrão nacional com DDD (ex: 27999999999)
    }
    return clean;
}

function formatPhoneDisplay(cleanPhone: string): string {
    if (!cleanPhone) return '';
    if (cleanPhone.length === 11) {
        return `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 7)}-${cleanPhone.slice(7)}`;
    }
    if (cleanPhone.length === 10) {
        return `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 6)}-${cleanPhone.slice(6)}`;
    }
    return cleanPhone;
}

function removeAccents(str: string): string {
    return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

function cleanTokens(raw: string): string[] {
    const noiseWords = new Set(['sem', 'nome', 'nao', 'identificado', 'estudante', 'publicador', 'parque', 'jacaraipe', 'estancia', 'sao', 'patricio', 'pioneiro', 'auxiliar', 'regular', 'irmao', 'irma', 'de', 'da', 'do', 'dos', 'das']);
    const cleaned = removeAccents(raw || '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !noiseWords.has(w));
    return cleaned;
}

function fuzzyMatchName(rawWaName: string, rawPubName: string): boolean {
    if (!rawWaName || rawWaName.trim() === '' || rawWaName.includes('Sem Nome') || rawWaName.includes('Não identificado')) {
        return false;
    }

    const waTokens = cleanTokens(rawWaName);
    const pubTokens = cleanTokens(rawPubName);

    if (waTokens.length === 0 || pubTokens.length === 0) return false;

    // Checagem de Primeiro Nome (ex: "eivaldo" vs "gerusa")
    const waFirst = waTokens[0];
    const pubFirst = pubTokens[0];
    const firstMatches = waFirst === pubFirst || (waFirst.length >= 4 && pubFirst.length >= 4 && levenshtein(waFirst, pubFirst) <= 1);

    // Contagem de tokens de Sobrenome
    let surnameMatchCount = 0;
    for (let i = 1; i < waTokens.length; i++) {
        for (let j = 1; j < pubTokens.length; j++) {
            if (waTokens[i] === pubTokens[j]) {
                surnameMatchCount++;
                break;
            }
        }
    }

    if (firstMatches && (pubTokens.length <= 2 || surnameMatchCount >= 1)) return true;
    if (surnameMatchCount >= 2 && firstMatches) return true;

    return false;
}

function cleanWaName(raw: string): string {
    return removeAccents((raw || '').replace(/^~/, '').trim());
}

function cleanParticipantName(p: any): { displayName: string; pushName: string; isPushName: boolean } {
    const rawName = typeof p.name === 'string' ? p.name.trim() : '';
    const pushName = (
        typeof p.pushName === 'string' && p.pushName.trim() ? p.pushName.trim() :
        typeof p.notifyName === 'string' && p.notifyName.trim() ? p.notifyName.trim() :
        typeof p.vcardName === 'string' && p.vcardName.trim() ? p.vcardName.trim() : ''
    );
    const shortName = typeof p.shortName === 'string' ? p.shortName.trim() : '';

    const candidates = [rawName, pushName, shortName].filter(Boolean);

    for (const cand of candidates) {
        // 1. Se a string contém '~', extrai o nome após o til
        if (cand.includes('~')) {
            const parts = cand.split('~');
            const afterTilde = parts[parts.length - 1].trim();
            if (afterTilde && /[a-zA-Zà-úÀ-Ú]/.test(afterTilde)) {
                return {
                    displayName: `~${afterTilde}`,
                    pushName: afterTilde,
                    isPushName: true
                };
            }
        }

        // 2. Remove parte do telefone inicial (ex: "+55 27 98889-1292 " ou "(27) 98889-1292 ")
        const cleanCand = cand.replace(/^[\+\d\s\(\)\-\.]+\s*/, '').replace(/@.*$/, '').trim();
        if (cleanCand && /[a-zA-Zà-úÀ-Ú]/.test(cleanCand)) {
            const isPush = cand.includes('~') || cleanCand.startsWith('~') || !!pushName;
            const finalName = cleanCand.replace(/^~/, '').trim();
            return {
                displayName: isPush ? `~${finalName}` : finalName,
                pushName: finalName,
                isPushName: isPush
            };
        }
    }

    return {
        displayName: 'Sem Nome',
        pushName: '',
        isPushName: false
    };
}

export interface ZApiCredentials {
    instanceId: string;
    instanceToken: string;
    clientToken: string;
}

export const zapiGroupSyncService = {
    /**
     * Salva as credenciais do Z-API no banco de dados (app_settings).
     * Nota: A partir do Security Hotfix 1, apenas a Edge Function deve usar isso.
     */
    async saveZApiCredentials(creds: ZApiCredentials): Promise<void> {
        await supabase.from('app_settings').upsert([
            { key: 'zapi_instance_id', value: creds.instanceId.trim(), updated_at: new Date().toISOString() },
            { key: 'zapi_instance_token', value: creds.instanceToken.trim(), updated_at: new Date().toISOString() },
            { key: 'zapi_client_token', value: creds.clientToken.trim(), updated_at: new Date().toISOString() },
        ], { onConflict: 'key' });
    },

    /**
     * Busca os membros do grupo do WhatsApp especificado no Z-API via Backend (Edge Function) ou cliente.
     */
    async fetchGroupParticipants(groupQuery: string = 'Congregação Parque Jacaraípe'): Promise<{ groupName: string; participants: WaGroupParticipant[] }> {
        // 1. Tentar primeiro via Backend Edge Function (send-whatsapp) ou provider padrão do ambiente
        let waService = createWhatsAppAutoServiceFromEnv();

        if (waService.fetchGroupMetadata) {
            try {
                const data = await waService.fetchGroupMetadata(groupQuery);
                if (data && data.participants && Array.isArray(data.participants)) {
                    const groupName = data.groupName || data.name || data.subject || groupQuery;
                    const participants: WaGroupParticipant[] = data.participants.map((p: any) => ({
                        phone: p.phone || p.id || '',
                        name: p.name || p.pushName || p.shortName || '',
                        shortName: p.shortName || '',
                        admin: p.admin || p.superAdmin || false,
                    }));
                    return { groupName, participants };
                }
            } catch (err) {
                console.warn('[zapiGroupSyncService] Falha ao consultar grupo via waService padrão:', err);
            }
        }

        throw new Error(`Grupo "${groupQuery}" não encontrado no Z-API ou credenciais não estão respondendo via Edge Function.`);
    },

    /**
     * Reconcilia a lista de participantes do grupo WhatsApp com os publicadores e perfis do RVM.
     */
    async reconcileWithRvm(participants: WaGroupParticipant[]): Promise<ReconciliationItem[]> {
        // 1. Carregar publicadores do RVM
        // Nota: rm.publishers (schema RM/Glide) NÃO possui coluna phone e seu id é
        // um uuid próprio (não o mesmo id text de public.publishers) — não serve
        // como fonte de telefone, por isso não é consultado aqui.
        const { data: pubs } = await supabase.from('publishers').select('*');

        // 2. Carregar perfis de acesso (profiles)
        const { data: profiles } = await supabase.from('profiles').select('*');

        const pubMapByPhone = new Map<string, any>();
        const pubMapByName = new Map<string, any>();

        (pubs || []).forEach(p => {
            const rawP = p.data?.phone || p.data?.contact_phone || '';
            const cP = normalizePhone(rawP);
            if (cP) pubMapByPhone.set(cP, p);
            if (p.data?.name) pubMapByName.set(removeAccents(p.data.name), p);
        });

        const profileMapByPubId = new Map<string, any>();
        const profileMapByPhone = new Map<string, any>();
        const profileMapByEmail = new Map<string, any>();

        (profiles || []).forEach(prof => {
            if (prof.publisher_id) profileMapByPubId.set(String(prof.publisher_id), prof);
            if (prof.phone) profileMapByPhone.set(normalizePhone(prof.phone), prof);
            if (prof.email) profileMapByEmail.set(prof.email.toLowerCase(), prof);
        });

        // 3. Carregar respostas e interações dos links de confirmação
        const respondedPubIds = new Set<string>();
        const respondedPhones = new Set<string>();
        const respondedEmails = new Set<string>();

        try {
            // 3.1 Respostas registradas no portal de confirmação
            const { data: portalResp } = await supabase.from('confirmation_portal_responses').select('publisher_id, authenticated_email');
            (portalResp || []).forEach(r => {
                if (r.publisher_id) respondedPubIds.add(String(r.publisher_id));
                if (r.authenticated_email) respondedEmails.add(r.authenticated_email.toLowerCase().trim());
            });

            // 3.2 Tokens de confirmação já utilizados
            const { data: usedTokens } = await supabase.from('confirmation_portal_tokens').select('publisher_id').not('used_at', 'is', null);
            (usedTokens || []).forEach(t => { if (t.publisher_id) respondedPubIds.add(String(t.publisher_id)); });

            // 3.3 Partes da apostila com confirmação ou recusa gravadas
            const { data: respondedParts } = await supabase.from('workbook_parts').select('resolved_publisher_id').in('status', ['APROVADA', 'CONCLUIDA', 'CONFIRMADA', 'RECUSADA']);
            (respondedParts || []).forEach(p => { if (p.resolved_publisher_id) respondedPubIds.add(String(p.resolved_publisher_id)); });

            // 3.4 Disparos logados de recibos de confirmação (RECIBO_S89) ou alertas de recusa
            const { data: dispatchLogs } = await supabase.from('zapi_dispatch_log').select('recipient_phone').in('dispatch_type', ['RECIBO_S89', 'RECUSA_ALERTA']);
            (dispatchLogs || []).forEach(l => {
                const cP = normalizePhone(l.recipient_phone || '');
                if (cP) respondedPhones.add(cP);
            });
        } catch (e) {
            console.warn('[zapiGroupSyncService] Falha ao carregar lista de confirmações prévias:', e);
        }

        const items: ReconciliationItem[] = [];
        const assignedPubIds = new Set<string>();

        // Pre-popula publicadores já casados por telefone exato
        participants.forEach(p => {
            const cleanP = normalizePhone(p.phone);
            const matchedPub = pubMapByPhone.get(cleanP);
            if (matchedPub) assignedPubIds.add(String(matchedPub.id));
        });

        participants.forEach((p, idx) => {
            const cleanP = normalizePhone(p.phone);
            const waDispPhone = formatPhoneDisplay(cleanP);

            const { displayName: rawWaName, pushName, isPushName } = cleanParticipantName(p);

            // Limpa ~ e acentos para fazer match com publicadores do banco RVM
            const waNameClean = cleanWaName(rawWaName);

            let matchedPub = pubMapByPhone.get(cleanP);
            let matchType: 'EXACT_PHONE' | 'NAME_MATCH' | 'UNMATCHED' = matchedPub ? 'EXACT_PHONE' : 'UNMATCHED';

            if (!matchedPub && rawWaName && rawWaName !== 'Sem Nome') {
                // Tenta matching por aproximação de nome usando Token Fuzzy & Levenshtein
                (pubs || []).forEach(pub => {
                    if (matchedPub || assignedPubIds.has(String(pub.id))) return;
                    const pubName = pub.data?.name || '';
                    if (pubName && fuzzyMatchName(rawWaName, pubName)) {
                        matchedPub = pub;
                        matchType = 'NAME_MATCH';
                        assignedPubIds.add(String(pub.id));
                    }
                });
            }

            // Se o membro for silencioso (sem pushName), tenta matching por padrao de sufixo de digitos (ex: últimos 4 ou 7 dígitos)
            if (!matchedPub && cleanP.length >= 7) {
                const phone7 = cleanP.slice(-7);   // ex: 2462014
                const phoneLast4 = cleanP.slice(-4);  // ex: 2014
                (pubs || []).forEach(pub => {
                    if (matchedPub || assignedPubIds.has(String(pub.id))) return;
                    const pubPhone = normalizePhone(pub.data?.phone || pub.data?.contact_phone || '');
                    if (pubPhone && (pubPhone.endsWith(phone7) || pubPhone.endsWith(phoneLast4))) {
                        matchedPub = pub;
                        matchType = 'NAME_MATCH';
                        assignedPubIds.add(String(pub.id));
                    }
                });
            }

            const pubId = matchedPub?.id || null;
            const pubName = matchedPub?.data?.name || null;
            const rvmPhone = matchedPub?.data?.phone || matchedPub?.data?.contact_phone || null;
            const rvmDispPhone = rvmPhone ? formatPhoneDisplay(normalizePhone(rvmPhone)) : null;

            // Identifica se o telefone do grupo difere do cadastrado no RVM
            const currentCleanRvmPhone = normalizePhone(rvmPhone || '');
            const hasPhoneMismatch = matchedPub && (!currentCleanRvmPhone || currentCleanRvmPhone !== cleanP);

            // Busca perfil de usuário associado
            let matchedProfile = pubId ? profileMapByPubId.get(String(pubId)) : null;
            if (!matchedProfile && cleanP) {
                matchedProfile = profileMapByPhone.get(cleanP);
            }

            const profileId = matchedProfile?.id || null;
            const profileEmail = matchedProfile?.email || null;
            const isVerified2FA = matchedProfile?.whatsapp_verified === true;
            const hasRespondedLink =
                (pubId ? respondedPubIds.has(String(pubId)) : false) ||
                respondedPhones.has(cleanP) ||
                (profileEmail ? respondedEmails.has(profileEmail.toLowerCase().trim()) : false);

            let status: ReconciliationItem['status'] = 'UNMATCHED_WA';
            let selected = false;

            if (matchedPub) {
                if (matchedProfile && !isVerified2FA) {
                    status = 'PENDING_2FA';
                    selected = true;
                } else if (hasPhoneMismatch) {
                    status = 'PHONE_UPDATE_NEEDED';
                    selected = true;
                } else {
                    status = 'SYNCED';
                    selected = false;
                }
            }

            items.push({
                id: `item-${idx}-${cleanP}`,
                waPhone: waDispPhone,
                cleanPhone: cleanP,
                waName: rawWaName,
                waPushName: pushName,
                isPushName,
                publisherId: pubId,
                publisherName: pubName,
                rvmPhone,
                rvmDispPhone,
                hasPhoneMismatch: !!hasPhoneMismatch,
                matchType,
                profileId,
                profileEmail,
                isVerified2FA,
                hasRespondedLink,
                status,
                selected,
            });
        });

        // Ordena colocando pendências (2FA e telefone desatualizado) no topo
        items.sort((a, b) => {
            const priority = { PENDING_2FA: 0, PHONE_UPDATE_NEEDED: 1, UNMATCHED_WA: 2, SYNCED: 3 };
            return priority[a.status] - priority[b.status];
        });

        return items;
    },

    /**
     * Executa a sincronização dos telefones e a pré-aprovação de 2FA em lote no banco de dados.
     *
     * Caso A — o publicador já tem `profiles` (já logou ao menos 1x): aprova o 2FA
     * imediatamente (`whatsapp_verified = true`).
     * Caso B — o publicador foi identificado no grupo do WhatsApp mas nunca logou
     * (sem `profiles`, que é FK obrigatória para `auth.users`): não há como aprovar
     * agora, então registramos uma pré-aprovação em `whatsapp_2fa_preapprovals`,
     * consumida automaticamente pelas RPCs `sync_profile_publisher_link()` /
     * `admin_link_profile_to_publisher()` assim que o profile vier a existir.
     */
    async executeSync(selectedItems: ReconciliationItem[]): Promise<{ updatedPublishers: number; updatedProfiles: number; preapproved: number; errors: string[] }> {
        let updatedPublishers = 0;
        let updatedProfiles = 0;
        let preapproved = 0;
        const errors: string[] = [];

        const { data: userData } = await supabase.auth.getUser();
        const adminId = userData?.user?.id || null;

        for (const item of selectedItems) {
            try {
                // 1. Atualiza no publicadores RVM principais
                if (item.publisherId) {
                    const { data: existingPub } = await supabase.from('publishers').select('*').eq('id', item.publisherId).single();
                    if (existingPub) {
                        const updatedData = { ...existingPub.data, phone: item.cleanPhone };
                        const { error: pubErr } = await supabase.from('publishers').update({ data: updatedData }).eq('id', item.publisherId);
                        if (pubErr) errors.push(`Erro publicador ${item.publisherName}: ${pubErr.message}`);
                        else updatedPublishers++;
                    }

                    // Nota: rm.publishers (schema RM/Glide) não possui coluna phone
                    // e seu id é um uuid próprio (não o mesmo id text de public.publishers),
                    // por isso não há espelhamento de telefone nessa tabela.
                }

                // 2. Resolve o profile existente (se houver)
                let targetProfileId = item.profileId;
                if (!targetProfileId && item.publisherId) {
                    const { data: pData } = await supabase.from('profiles').select('id').eq('publisher_id', item.publisherId).maybeSingle();
                    targetProfileId = pData?.id || null;
                }

                if (targetProfileId) {
                    // Caso A: profile já existe → aprova 2FA agora
                    const { error: profErr } = await supabase
                        .from('profiles')
                        .update({
                            phone: item.cleanPhone,
                            whatsapp_verified: true,
                        })
                        .eq('id', targetProfileId);

                    if (profErr) {
                        errors.push(`Erro perfil ${item.profileEmail || item.publisherName}: ${profErr.message}`);
                    } else {
                        updatedProfiles++;
                        console.log(`[zapiGroupSyncService] 2FA aprovado imediatamente para profile ${targetProfileId} (publicador ${item.publisherName})`);
                    }
                } else if (item.publisherId) {
                    // Caso B: publicador identificado no grupo, mas sem profile (nunca logou) →
                    // registra pré-aprovação para ser consumida automaticamente no 1º vínculo.
                    const { error: preErr } = await supabase
                        .from('whatsapp_2fa_preapprovals')
                        .upsert({
                            publisher_id: item.publisherId,
                            phone: item.cleanPhone,
                            preapproved_by: adminId,
                            reason: 'whatsapp_group_verified',
                        }, { onConflict: 'publisher_id' });

                    if (preErr) {
                        errors.push(`Erro pré-aprovação ${item.publisherName}: ${preErr.message}`);
                    } else {
                        preapproved++;
                        console.log(`[zapiGroupSyncService] Pré-aprovação de 2FA registrada para publicador ${item.publisherName} (aguardando 1º login)`);
                    }
                }
            } catch (err: any) {
                console.error(`[zapiGroupSyncService] Falha ao processar item ${item.waName}:`, err);
                errors.push(`Falha no item ${item.waName}: ${err.message}`);
            }
        }

        console.log(`[zapiGroupSyncService] executeSync concluído: ${updatedPublishers} publicadores, ${updatedProfiles} perfis (2FA aprovado agora), ${preapproved} pré-aprovações registradas, ${errors.length} erros.`);

        return { updatedPublishers, updatedProfiles, preapproved, errors };
    },

    /**
     * Retorna a lista completa de publicadores do RVM para associacao/vinculacao manual.
     */
    async getAllPublishers(): Promise<Array<{ id: string; name: string; phone?: string }>> {
        const { data: pubs } = await supabase.from('publishers').select('id, data');
        const list: Array<{ id: string; name: string; phone?: string }> = [];

        (pubs || []).forEach(p => {
            const name = p.data?.name || '';
            const phone = p.data?.phone || p.data?.contact_phone || '';
            if (name) {
                list.push({ id: p.id, name, phone });
            }
        });

        return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },

    /**
     * Executa o robô de varredura/captura automatizado do Z-API no Backend (Edge Function).
     * Inclui resiliência contra 'TypeError: Failed to fetch' com retries automáticos.
     */
    async runBackendZApiRobot(groupQuery: string = 'Congregação Parque Jacaraípe') {
        const payload = { action: 'run-zapi-robot', groupQuery };
        
        // Tentativa 1: Via cliente do Supabase
        try {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', { body: payload });
            if (!error && data) return data;
            if (error) console.warn('[zapiGroupSyncService] supabase.functions.invoke error:', error);
        } catch (e) {
            console.warn('[zapiGroupSyncService] Supabase invoke falhou, tentando fetch direto:', e);
        }

        // Tentativa 2: Direct HTTP Fetch com Retry Fallback (Resistente a interrupções de rede Vercel)
        const endpoint = 'https://pevstuyzlewvjidjkmea.supabase.co/functions/v1/send-whatsapp';
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const data = await res.json();
                    console.log(`[zapiGroupSyncService] Robô Backend respondeu com sucesso no Direct Fetch (tentativa ${attempt})`);
                    return data;
                }
            } catch (err) {
                console.warn(`[zapiGroupSyncService] Direct Fetch tentativa ${attempt} falhou:`, err);
                if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
            }
        }

        throw new Error('Falha ao conectar com o Robô Z-API no backend. Verifique a conexão de rede.');
    }
};

function pubMapMapByName(pub: any, map: Map<string, any>) {
    if (pub.data?.name) {
        map.set(removeAccents(pub.data.name), pub);
    }
}
