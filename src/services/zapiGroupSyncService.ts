/**
 * zapiGroupSyncService.ts — Serviço de Reconciliação & Sincronização em Lote de Contatos do WhatsApp (Z-API)
 * com Publicadores e Perfis (2FA) no RVM Designações.
 */

import { supabase } from '../lib/supabase';
import { createWhatsAppAutoServiceFromEnv } from './whatsappAutoService';

export interface WaGroupParticipant {
    phone: string;
    name?: string;
    shortName?: string;
    admin?: boolean;
}

export interface ReconciliationItem {
    id: string;
    waPhone: string;
    cleanPhone: string;
    waName: string;
    publisherId: string | null;
    publisherName: string | null;
    rvmPhone: string | null;
    profileId: string | null;
    profileEmail: string | null;
    isVerified2FA: boolean;
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
    if (cleanPhone.length === 11) {
        return `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 7)}-${cleanPhone.slice(7)}`;
    }
    if (cleanPhone.length === 10) {
        return `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 6)}-${cleanPhone.slice(6)}`;
    }
    return cleanPhone;
}

function removeAccents(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export interface ZApiCredentials {
    instanceId: string;
    instanceToken: string;
    clientToken: string;
}

export const zapiGroupSyncService = {
    /**
     * Carrega as credenciais do Z-API a partir das variáveis de ambiente ou do banco de dados (app_settings).
     */
    async getZApiCredentials(): Promise<ZApiCredentials | null> {
        // 1. Variáveis de ambiente
        const envId = import.meta.env.VITE_ZAPI_INSTANCE_ID;
        const envToken = import.meta.env.VITE_ZAPI_INSTANCE_TOKEN;
        const envClient = import.meta.env.VITE_ZAPI_CLIENT_TOKEN;

        if (envId && envToken && envClient) {
            return { instanceId: envId, instanceToken: envToken, clientToken: envClient };
        }

        // 2. Busca no banco de dados (app_settings ou settings)
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('key, value')
                .in('key', ['zapi_instance_id', 'zapi_instance_token', 'zapi_client_token']);

            if (data && data.length > 0) {
                const map = new Map(data.map(d => [d.key, d.value]));
                const id = map.get('zapi_instance_id') || envId;
                const token = map.get('zapi_instance_token') || envToken;
                const client = map.get('zapi_client_token') || envClient;

                if (id && token && client) {
                    return { instanceId: id, instanceToken: token, clientToken: client };
                }
            }
        } catch (e) {
            console.warn('[zapiGroupSyncService] Falha ao carregar credenciais do banco:', e);
        }

        return null;
    },

    /**
     * Salva as credenciais do Z-API no banco de dados (app_settings).
     */
    async saveZApiCredentials(creds: ZApiCredentials): Promise<void> {
        await supabase.from('app_settings').upsert([
            { key: 'zapi_instance_id', value: creds.instanceId.trim(), updated_at: new Date().toISOString() },
            { key: 'zapi_instance_token', value: creds.instanceToken.trim(), updated_at: new Date().toISOString() },
            { key: 'zapi_client_token', value: creds.clientToken.trim(), updated_at: new Date().toISOString() },
        ], { onConflict: 'key' });
    },

    /**
     * Busca os membros do grupo do WhatsApp especificado no Z-API.
     */
    async fetchGroupParticipants(groupQuery: string = 'Congregação Parque Jacaraípe'): Promise<{ groupName: string; participants: WaGroupParticipant[] }> {
        const creds = await this.getZApiCredentials();

        let waService = createWhatsAppAutoServiceFromEnv();

        if (creds && creds.instanceId) {
            // Se o de env não tiver z-api, instancia explicitamente
            if (!waService.fetchGroupMetadata || waService.providerName !== 'z-api') {
                const { createWhatsAppAutoService } = await import('./whatsappAutoService');
                waService = createWhatsAppAutoService({
                    provider: 'z-api',
                    instanceId: creds.instanceId,
                    instanceToken: creds.instanceToken,
                    clientToken: creds.clientToken,
                });
            }
        }
        
        if (!waService.fetchGroupMetadata) {
            throw new Error('Provedor Z-API não configurado. Informe a Instance ID, Instance Token e Client Token do Z-API.');
        }

        const data = await waService.fetchGroupMetadata(groupQuery);
        
        if (!data || !data.participants || !Array.isArray(data.participants)) {
            throw new Error(`Grupo "${groupQuery}" não encontrado no Z-API ou sem membros acessíveis.`);
        }

        const groupName = data.name || data.subject || groupQuery;
        const participants: WaGroupParticipant[] = data.participants.map((p: any) => ({
            phone: p.phone || p.id || '',
            name: p.name || p.pushName || p.shortName || '',
            shortName: p.shortName || '',
            admin: p.admin || p.superAdmin || false,
        }));

        return { groupName, participants };
    },

    /**
     * Reconcilia a lista de participantes do grupo WhatsApp com os publicadores e perfis do RVM.
     */
    async reconcileWithRvm(participants: WaGroupParticipant[]): Promise<ReconciliationItem[]> {
        // 1. Carregar publicadores do RVM
        const { data: pubs } = await supabase.from('publishers').select('*');
        const { data: rmPubs } = await supabase.from('rm.publishers').select('*');
        
        // 2. Carregar perfis de acesso (profiles)
        const { data: profiles } = await supabase.from('profiles').select('*');

        const pubMapByPhone = new Map<string, any>();
        const pubMapByName = new Map<string, any>();

        (pubs || []).forEach(p => {
            const rawP = p.data?.phone || p.data?.contact_phone || '';
            const cP = normalizePhone(rawP);
            if (cP) pubMapByPhone.set(cP, p);
            if (p.data?.name) pubMapMapByName(p, pubMapByName);
        });

        (rmPubs || []).forEach(p => {
            if (p.phone) {
                const cP = normalizePhone(p.phone);
                if (cP && !pubMapByPhone.has(cP)) pubMapByPhone.set(cP, { id: p.id, data: { name: p.name, phone: p.phone } });
            }
        });

        const profileMapByPubId = new Map<string, any>();
        const profileMapByPhone = new Map<string, any>();
        const profileMapByEmail = new Map<string, any>();

        (profiles || []).forEach(prof => {
            if (prof.publisher_id) profileMapByPubId.set(prof.publisher_id, prof);
            if (prof.phone) profileMapByPhone.set(normalizePhone(prof.phone), prof);
            if (prof.email) profileMapByEmail.set(prof.email.toLowerCase(), prof);
        });

        const items: ReconciliationItem[] = [];

        participants.forEach((p, idx) => {
            const cleanP = normalizePhone(p.phone);
            const waDispPhone = formatPhoneDisplay(cleanP);
            const waNameClean = removeAccents(p.name || '');

            let matchedPub = pubMapByPhone.get(cleanP);
            let matchType: 'EXACT_PHONE' | 'NAME_MATCH' | 'UNMATCHED' = matchedPub ? 'EXACT_PHONE' : 'UNMATCHED';

            if (!matchedPub && waNameClean) {
                // Tenta matching por aproximação de nome
                (pubs || []).forEach(pub => {
                    const pubNameClean = removeAccents(pub.data?.name || '');
                    if (pubNameClean && (pubNameClean.includes(waNameClean) || waNameClean.includes(pubNameClean))) {
                        matchedPub = pub;
                        matchType = 'NAME_MATCH';
                    }
                });
            }

            const pubId = matchedPub?.id || null;
            const pubName = matchedPub?.data?.name || p.name || null;
            const rvmPhone = matchedPub?.data?.phone || matchedPub?.data?.contact_phone || null;

            // Busca perfil de usuário associado
            let matchedProfile = pubId ? profileMapByPubId.get(pubId) : null;
            if (!matchedProfile && cleanP) {
                matchedProfile = profileMapByPhone.get(cleanP);
            }

            const profileId = matchedProfile?.id || null;
            const profileEmail = matchedProfile?.email || null;
            const isVerified2FA = matchedProfile?.whatsapp_verified === true;

            let status: ReconciliationItem['status'] = 'UNMATCHED_WA';
            let selected = false;

            if (matchedPub) {
                const currentCleanRvmPhone = normalizePhone(rvmPhone || '');
                const hasPhoneMismatch = !currentCleanRvmPhone || currentCleanRvmPhone !== cleanP;

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
                waName: p.name || 'Sem Nome',
                publisherId: pubId,
                publisherName: pubName,
                rvmPhone: rvmPhone,
                profileId,
                profileEmail,
                isVerified2FA,
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
     */
    async executeSync(selectedItems: ReconciliationItem[]): Promise<{ updatedPublishers: number; updatedProfiles: number; errors: string[] }> {
        let updatedPublishers = 0;
        let updatedProfiles = 0;
        const errors: string[] = [];

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

                    // Atualiza em rm.publishers
                    await supabase.from('rm.publishers').update({ phone: item.cleanPhone }).eq('id', item.publisherId);
                }

                // 2. Atualiza e pré-valida 2FA no profile do usuário (libera a tela do 2FA)
                if (item.profileId || item.publisherId) {
                    let targetProfileId = item.profileId;
                    if (!targetProfileId && item.publisherId) {
                        const { data: pData } = await supabase.from('profiles').select('id').eq('publisher_id', item.publisherId).maybeSingle();
                        targetProfileId = pData?.id || null;
                    }

                    if (targetProfileId) {
                        const { error: profErr } = await supabase
                            .from('profiles')
                            .update({
                                phone: item.cleanPhone,
                                whatsapp_verified: true,
                            })
                            .eq('id', targetProfileId);

                        if (profErr) {
                            errors.push(`Erro perfil ${item.profileEmail}: ${profErr.message}`);
                        } else {
                            updatedProfiles++;
                        }
                    }
                }
            } catch (err: any) {
                errors.push(`Falha no item ${item.waName}: ${err.message}`);
            }
        }

        return { updatedPublishers, updatedProfiles, errors };
    }
};

function pubMapMapByName(pub: any, map: Map<string, any>) {
    if (pub.data?.name) {
        map.set(removeAccents(pub.data.name), pub);
    }
}
