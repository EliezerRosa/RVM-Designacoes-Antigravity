import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;

webpush.setVapidDetails(
  'mailto:suporte@rvm.com.br',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    
    // Auth check
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') throw new Error('Acesso negado');

    const { title, body, target_role, target_publisher_id } = await req.json();

    if (!title || !body) {
        throw new Error('Título e Mensagem são obrigatórios');
    }

    // Injetar no banco (histórico)
    const { error: insertErr } = await supabaseClient.from('custom_push_messages').insert({
        title, body, target_role, target_publisher_id, created_by: user.id
    });
    if (insertErr) console.warn('Erro ao salvar no histórico:', insertErr);

    // Buscar subscriptions ignorando RLS (sem FK para publishers)
    const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: subs, error: subsErr } = await adminClient.from('push_subscriptions').select('*');
    if (subsErr) throw subsErr;

    let targetSubs = subs || [];

    if (target_publisher_id) {
        targetSubs = targetSubs.filter((s: any) => s.publisher_id === target_publisher_id);
    } else if (target_role && target_role !== 'all') {
        // Busca os papéis dos publicadores manualmente já que não há FK direta
        const { data: pubs, error: pubErr } = await adminClient.from('publishers').select('id, role');
        if (pubErr) throw pubErr;

        const roleMap = new Map();
        pubs.forEach((p: any) => roleMap.set(p.id, p.role));

        targetSubs = targetSubs.filter((s: any) => {
            const role = roleMap.get(s.publisher_id);
            return role === target_role;
        });
    }

    if (targetSubs.length === 0) {
        return new Response(JSON.stringify({ success: true, sentCount: 0, message: 'Nenhuma assinatura encontrada.' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    const payload = JSON.stringify({
      title,
      body,
      url: '/'
    });

    let sentCount = 0;

    for (const sub of targetSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        );
        sentCount++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Remover inscrição expirada
          await adminClient.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Erro ao enviar web push para', sub.id, err);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error: any) {
    // Retorna 200 para que o cliente supabase-js não oculte o corpo (payload) do erro num status 400 (FunctionsHttpError)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
