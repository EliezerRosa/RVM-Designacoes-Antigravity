import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server";
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
    const { email, authenticationResponse, rpID } = await req.json();

    if (!email || !authenticationResponse) {
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

    // Buscar as credenciais registradas do usuário (todas)
    const { data: credentials, error: credError } = await supabaseAdmin
      .from('webauthn_credentials')
      .select('*')
      .eq('profile_id', profile.id);

    if (credError || !credentials || credentials.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma credencial WebAuthn encontrada para este usuario. Cadastre novamente.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Identificar qual credencial foi usada
    const usedCredential = credentials.find(c => c.id === authenticationResponse.id);
    
    // Se não achou por ID direto (pode ter diferença de encoding base64 vs base64url, hex)
    // Para simplificar, vou confiar na validação matemática do simplewebauthn se eu passar a primeira ou iterar
    if (!usedCredential) {
       return new Response(JSON.stringify({ error: 'Credencial utilizada não corresponde as registradas' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
      verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: req.headers.get('origin') || '',
        expectedRPID: rpID || 'localhost',
        credential: {
          id: usedCredential.id,
          publicKey: Uint8Array.from(atob(usedCredential.public_key), c => c.charCodeAt(0)),
          counter: usedCredential.counter,
          transports: usedCredential.transports || [],
        },
        requireUserVerification: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: 'Falha na verificacao criptografica: ' + msg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (!verification.verified || !verification.authenticationInfo) {
      return new Response(JSON.stringify({ error: 'Verificacao falhou' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Atualizar counter
    await supabaseAdmin
      .from('webauthn_credentials')
      .update({ counter: verification.authenticationInfo.newCounter, updated_at: new Date() })
      .eq('id', usedCredential.id);

    // Limpar os challenges
    await supabaseAdmin.from('webauthn_challenges').delete().eq('profile_id', profile.id);

    // O PULO DO GATO: Gerar um Magic Link via Admin API para obter o hashed_token
    // E retornar esse token pro Front-end poder logar de verdade!
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
    });

    if (linkError) {
      throw new Error('Falha ao gerar sessao segura: ' + linkError.message);
    }

    // Obter apenas o fragmento #access_token ou token_hash (no GoTrue novo)
    // O link gerado geralmente contém o 'token_hash' como param
    const magicLink = linkData.properties.action_link;
    const url = new URL(magicLink);
    const hashed_token = url.searchParams.get('token');

    return new Response(JSON.stringify({ 
      success: true, 
      hashed_token, 
      type: 'magiclink' 
    }), {
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
