import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, registrationResponse, rpID } = await req.json();

    if (!email || !registrationResponse) {
      return new Response(JSON.stringify({ error: 'Faltam parametros' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar o ID do usuário (profile)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Usuario nao encontrado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Pegar o último challenge gravado (ordenado por created_at)
    const { data: challengeData, error: challengeError } = await supabaseAdmin
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (challengeError || !challengeData) {
      return new Response(JSON.stringify({ error: 'Challenge expirado ou não encontrado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: req.headers.get('origin') || '',
        expectedRPID: rpID || 'localhost',
        requireUserVerification: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: 'Falha na verificacao criptografica: ' + msg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(JSON.stringify({ error: 'Verificacao falhou' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Helper para converter Uint8Array para base64 em Deno sem usar Buffer
    function uint8ArrayToBase64(bytes: Uint8Array) {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Salvar no BD
    const { error: insertError } = await supabaseAdmin
      .from('webauthn_credentials')
      .insert({
        id: credential.id, // v10 uses string
        profile_id: profile.id,
        public_key: uint8ArrayToBase64(credential.publicKey),
        counter: credential.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        transports: credential.transports || registrationResponse.response.transports || [],
      });

    if (insertError) {
      throw new Error('Erro ao salvar credencial: ' + insertError.message);
    }

    // Limpar os challenges velhos
    await supabaseAdmin.from('webauthn_challenges').delete().eq('profile_id', profile.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const e = error as Error;
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
