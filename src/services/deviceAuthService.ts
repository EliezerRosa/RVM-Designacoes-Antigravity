/**
 * deviceAuthService.ts — Serviço desacoplado de autenticação por biometria / PIN nativo do aparelho (WebAuthn / Passkeys)
 *
 * Suporta:
 * 1. Dispositivos modernos: WebAuthn (Touch ID, Face ID, Biometria Android, Windows Hello).
 * 2. Dispositivos legados: Credential Management API / Auto-preenchimento protegido pela trava do aparelho.
 *
 * Totalmente desacoplado de Google OAuth e WhatsApp 2FA.
 */

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { supabase } from './../lib/supabase'; // Ajuste o caminho se necessário

export type AuthSystemMode = 'google_oauth' | 'google_whatsapp_2fa' | 'device_biometric' | 'flexible';

export interface DeviceAuthResult {
    success: boolean;
    error?: string;
    email?: string;
}

export const deviceAuthService = {
    /**
     * Verifica se o navegador/dispositivo suporta autenticador nativo do sistema (WebAuthn / Biometria)
     */
    async isWebAuthnAvailable(): Promise<boolean> {
        try {
            if (typeof window === 'undefined' || !window.PublicKeyCredential || !window.isSecureContext) {
                return false;
            }
            if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
                return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            }
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Registra o dispositivo do usuário para login biométrico futuro (WebAuthn Passkey)
     * Chama as Edge Functions: webauthn-challenge e webauthn-register
     */
    async registerDevice(userEmail: string, userId: string): Promise<DeviceAuthResult> {
        try {
            const isAvailable = await this.isWebAuthnAvailable();
            if (!isAvailable) {
                return { success: false, error: 'Dispositivo ou navegador não suporta Biometria/Passkeys.' };
            }

            // 1. Obter o Challenge (Opções de Registro) da Edge Function
            const { data: challengeData, error: challengeError } = await supabase.functions.invoke('webauthn-challenge', {
                body: { action: 'register', email: userEmail, rpID: window.location.hostname }
            });

            if (challengeError || !challengeData || challengeData.error) {
                throw new Error(challengeError?.message || challengeData?.error || 'Falha ao gerar desafio.');
            }

            // 2. Acionar a janela de Passkey nativa do OS/Navegador
            let attResp;
            try {
                attResp = await startRegistration({ optionsJSON: challengeData });
            } catch (error: any) {
                if (error.name === 'NotAllowedError') {
                    return { success: false, error: 'Registro cancelado pelo usuário.' };
                }
                throw error;
            }

            // 3. Enviar a resposta (Assinatura) para validação na Edge Function
            const { data: verificationData, error: verificationError } = await supabase.functions.invoke('webauthn-register', {
                body: { email: userEmail, registrationResponse: attResp, rpID: window.location.hostname }
            });

            if (verificationError || !verificationData || !verificationData.success) {
                throw new Error(verificationError?.message || verificationData?.error || 'Falha na verificação da biometria.');
            }

            // Sucesso! Gravar o último usuário no localStorage apenas para preencher o e-mail no login
            localStorage.setItem('rvm_last_device_user', userEmail);
            localStorage.setItem('rvm_device_registered_' + userEmail, 'true');
            return { success: true, email: userEmail };

        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Falha ao registrar biometria do aparelho.';
            console.error('[DeviceAuth] Registration error:', e);
            return { success: false, error: msg };
        }
    },

    /**
     * Autentica o usuário utilizando o autenticador biométrico/PIN nativo do aparelho
     * Chama as Edge Functions: webauthn-challenge e webauthn-verify
     */
    async authenticate(userEmail?: string): Promise<DeviceAuthResult & { token?: string }> {
        try {
            const targetEmail = userEmail || localStorage.getItem('rvm_last_device_user');
            if (!targetEmail) {
                return { success: false, error: 'Nenhum usuário registrado neste aparelho.' };
            }

            const isAvailable = await this.isWebAuthnAvailable();
            if (!isAvailable) {
                 return { success: false, error: 'Dispositivo ou navegador não suporta Biometria/Passkeys.' };
            }

            // 1. Obter o Challenge (Opções de Autenticação) da Edge Function
            const { data: challengeData, error: challengeError } = await supabase.functions.invoke('webauthn-challenge', {
                body: { action: 'authenticate', email: targetEmail, rpID: window.location.hostname }
            });

            if (challengeError || !challengeData || challengeData.error) {
                throw new Error(challengeError?.message || challengeData?.error || 'Falha ao gerar desafio de autenticação.');
            }

            // 2. Acionar a janela de Passkey nativa do OS/Navegador
            let asseResp;
            try {
                asseResp = await startAuthentication({ optionsJSON: challengeData });
            } catch (error: any) {
                if (error.name === 'NotAllowedError') {
                    return { success: false, error: 'Autenticação cancelada pelo usuário.' };
                }
                throw error;
            }

            // 3. Enviar a resposta (Assinatura) para validação na Edge Function
            const { data: verificationData, error: verificationError } = await supabase.functions.invoke('webauthn-verify', {
                body: { email: targetEmail, authenticationResponse: asseResp, rpID: window.location.hostname }
            });

            if (verificationError || !verificationData || !verificationData.success) {
                const errorMsg = verificationError?.message || verificationData?.error || 'Falha na verificação da biometria.';
                if (errorMsg.includes('Nenhuma credencial WebAuthn encontrada')) {
                    this.clearDeviceRegistration(targetEmail);
                }
                throw new Error(errorMsg);
            }

            // Sucesso! A Edge Function gerou um Magic Link Token seguro
            localStorage.setItem('rvm_last_device_user', targetEmail);
            return { success: true, email: targetEmail, token: verificationData.hashed_token };

        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Autenticação cancelada pelo usuário ou falha na biometria.';
            console.error('[DeviceAuth] Authentication error:', e);
            return { success: false, error: msg };
        }
    },

    /**
     * Remove o registro do dispositivo local
     */
    clearDeviceRegistration(userEmail: string): void {
        localStorage.removeItem(`rvm_device_auth_${userEmail}`);
        localStorage.removeItem(`rvm_device_registered_${userEmail}`);
        if (localStorage.getItem('rvm_last_device_user') === userEmail) {
            localStorage.removeItem('rvm_last_device_user');
        }
    }
};
