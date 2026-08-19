import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { generateRegistrationOptions, generateAuthenticationOptions } from "npm:@simplewebauthn/server";
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
    const { action, email, rpID } = await req.json();

    if (!action || !email) {
      return new Response(JSON.stringify({ error: 'Faltam parametros action ou email' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // [SECURITY] Validar formato de e-mail básico
    if (typeof email !== 'string' || !email.includes('@') || email.length > 320) {
      return new Response(JSON.stringify({ error: 'Email invalido' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // [SECURITY] Para REGISTRO, exigir que o chamador esteja autenticado
    if (action === 'register') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Autenticacao necessaria para registrar dispositivo' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { auth: { persistSession: false } }
      );
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
      const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);

      if (userErr || !user) {
        return new Response(JSON.stringify({ error: 'Token invalido ou expirado. Faca login novamente.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Garantir que o e-mail no request bate com o e-mail do token
      if (user.email?.toLowerCase() !== email.toLowerCase()) {
        return new Response(JSON.stringify({ error: 'Email nao corresponde ao token de autenticacao' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
    }

    // Buscar o ID do usuário (profile)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Usuario nao encontrado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const rpName = 'RVM Designacoes';
    let options;

    if (action === 'register') {
      options = await generateRegistrationOptions({
        rpName,
        rpID: rpID || 'localhost',
        userID: new TextEncoder().encode(profile.id),
        userName: profile.email,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });
    } else if (action === 'authenticate') {
      options = await generateAuthenticationOptions({
        rpID: rpID || 'localhost',
        userVerification: 'preferred',
      });
    } else {
       return new Response(JSON.stringify({ error: 'Acao invalida' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Armazenar o challenge com expiração (5 minutos)
    // Limpar challenges antigos primeiro
    await supabaseAdmin
      .from('webauthn_challenges')
      .delete()
      .eq('profile_id', profile.id);

    const { error: insertError } = await supabaseAdmin
      .from('webauthn_challenges')
      .insert({
        profile_id: profile.id,
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

    if (insertError) {
        throw new Error('Falha ao salvar challenge: ' + insertError.message);
    }

    return new Response(JSON.stringify(options), {
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
