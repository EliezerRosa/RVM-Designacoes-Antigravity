import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    // @ts-ignore
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
    
    if (expectedSecret && secret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const payload = await req.json();
    console.log('[Webhook Orchestrator] Payload recebido:', JSON.stringify(payload));

    const { type, table, record, old_record } = payload;

    if (table !== 'workbook_parts' || type !== 'UPDATE') {
      return new Response(JSON.stringify({ message: 'Ignored: Not a workbook_parts update' }), { status: 200 });
    }

    const newStatus = record.status;
    const oldStatus = old_record?.status;

    if (newStatus === oldStatus) {
      return new Response(JSON.stringify({ message: 'Ignored: Status not changed' }), { status: 200 });
    }

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    // @ts-ignore
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const publisherId = record.resolved_publisher_id;
    if (!publisherId) {
      return new Response(JSON.stringify({ message: 'Ignored: No publisher assigned' }), { status: 200 });
    }

    const { data: pubData } = await supabase.from('publishers').select('data').eq('id', publisherId).single();
    const phone = pubData?.data?.phone || pubData?.data?.contact_phone;
    const pubName = pubData?.data?.name || record.resolved_publisher_name || 'Irmão(ã)';

    if (!phone) {
      return new Response(JSON.stringify({ message: 'Ignored: Publisher has no phone' }), { status: 200 });
    }

    if (newStatus === 'DESIGNADA' && oldStatus === 'ENVIADA') {
      const caption = `✅ *Confirmação Recebida!*\n\nFicamos felizes em saber que você poderá realizar sua parte: *${record.tipo_parte || 'Designação'}*.\nQue Jeová abençoe sua preparação!`;
      await dispatchToWhatsAppService(phone, caption);
      return new Response(JSON.stringify({ message: 'Confirmation receipt sent' }), { status: 200 });
    } else if (newStatus === 'REJEITADA' && oldStatus === 'ENVIADA') {
      const { data: admins } = await supabase
        .from('publishers')
        .select('data');
      
      const { data: confLog } = await supabase
        .from('part_confirmations')
        .select('notes')
        .eq('workbook_part_id', record.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      const reason = confLog?.notes || 'Motivo não informado.';
      const alertMsg = `⚠️ *Alerta de Recusa de Designação*\n\nO(a) publicador(a) *${pubName}* informou que NÃO poderá fazer a parte: *${record.tipo_parte || 'Designação'}*.\n\n*Motivo:* ${reason}\n\nPor favor, providencie um substituto via Painel RM.`;

      let sentCount = 0;
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          const role = admin.data?.role || '';
          if (role === 'admin' || role === 'editor') {
            const adminPhone = admin.data?.phone || admin.data?.contact_phone;
            if (adminPhone) {
              await dispatchToWhatsAppService(adminPhone, alertMsg);
              sentCount++;
            }
          }
        }
      }
      return new Response(JSON.stringify({ message: `Refusal alert sent to ${sentCount} admins` }), { status: 200 });
    }

    return new Response(JSON.stringify({ message: 'Ignored: Status change not actionable' }), { status: 200 });

  } catch (err) {
    console.error('[Webhook Orchestrator] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});

async function dispatchToWhatsAppService(phone: string, message: string) {
  // @ts-ignore
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  // @ts-ignore
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      action: 'send-text',
      phone: phone,
      message: message
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`send-whatsapp failed: ${res.status} ${txt}`);
  }
  return res.json();
}
