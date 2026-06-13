import { supabase } from '../lib/supabase';

export const onboardingTokenService = {
    /**
     * Resgata o token VIP existente para o publicador ou gera um novo se não existir.
     * Retorna a URL completa do portal de convite.
     */
    async getOrGenerateInviteLink(publisherId: string, phone: string): Promise<string | null> {
        try {
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length < 10) return null;

            // 1. Tentar achar um token existente não usado e não expirado
            const { data: existing, error: findErr } = await supabase
                .from('onboarding_tokens')
                .select('token')
                .eq('publisher_id', publisherId)
                .is('used_at', null)
                .gte('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (findErr) {
                console.warn('[onboardingTokenService] Erro ao buscar token existente:', findErr);
            }

            if (existing?.token) {
                return `${window.location.origin}/?portal=invite&token=${existing.token}`;
            }

            // 2. Se não existir, gerar um novo
            const { data: newToken, error: insertErr } = await supabase
                .from('onboarding_tokens')
                .insert({ publisher_id: publisherId, phone: cleanPhone })
                .select('token')
                .single();

            if (insertErr || !newToken) {
                console.error('[onboardingTokenService] Erro ao gerar novo token:', insertErr);
                return null;
            }

            return `${window.location.origin}/?portal=invite&token=${newToken.token}`;
        } catch (error) {
            console.error('[onboardingTokenService] Falha inesperada:', error);
            return null;
        }
    }
};
