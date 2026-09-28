import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: "https://741525a522be9026c6301d772ee77f35@o4512163872505856.ingest.de.sentry.io/4512163900686416",
  tracesSampleRate: 1.0,
});

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWhatsApp(phone: string, message: string, options?: any) {
  const payload = { phone, message, ...options };
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Erro na API de envio Z-API para ${phone}: ${errorText}`);
    return { success: false, errorText };
  }
  const data = await res.json();
  return { success: data.success, messageId: data.messageId };
}

async function logToCanonical(partId: string, dispatchType: string, phone: string, status: string, messageId?: string) {
  const payload: any = {
    part_id: partId,
    dispatch_type: dispatchType,
    recipient_phone: phone,
    status: status
  };
  if (messageId) payload.message_id = messageId;
  
  const { error } = await supabase.from('zapi_dispatch_log').insert(payload);
  if (error) {
    console.error(`Falha ao registrar no log canônico (part_id: ${partId}):`, error);
  }
}

async function main() {
  console.log("Iniciando Consumidor Headless da Fila do WhatsApp...");
  let processedCount = 0;
  
  while (true) {
    // 1. Busca o próximo item pendente (FIFO)
    const { data: queueItems, error: fetchErr } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchErr) {
      console.error("Erro ao buscar fila:", fetchErr);
      break;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log("Fila vazia. Todos os itens processados.");
      break;
    }

    const item = queueItems[0];
    console.log(`Processando item [${item.id}] - Tipo: ${item.type}`);

    try {
      const { phone, message, options, partId } = item.payload;

      if (!phone || !message) {
        throw new Error("Payload inválido. 'phone' e 'message' são obrigatórios.");
      }

      // 2. Dispara a mensagem
      const result = await sendWhatsApp(phone, message, options);

      // 3. Log Canônico (se aplicável)
      const shouldLogToCanonical = ['COBRANCA_72H', 'LEMBRETE_D9', 'LEMBRETE_D7', 'LEMBRETE_D2', 'REPARO_ZAPI', 'ALERTA_GHOSTING'].includes(item.type);
      
      if (shouldLogToCanonical && partId) {
         await logToCanonical(partId, item.type, phone, result.success ? 'SUCCESS' : 'ERROR', result.messageId);
      }

      // 4. Atualiza o status na fila
      const newStatus = result.success ? 'PROCESSED' : 'ERROR';
      const errorMessage = result.success ? null : (result.errorText || "Falha desconhecida no envio");

      await supabase
        .from('whatsapp_queue')
        .update({ 
          status: newStatus, 
          processed_at: new Date().toISOString(),
          error_message: errorMessage
        })
        .eq('id', item.id);

      if (result.success) {
        processedCount++;
        console.log(`✅ Sucesso. Esperando 3 segundos (anti-spam)...`);
      } else {
        console.error(`❌ Falha no envio para o item [${item.id}]. Esperando 3 segundos...`);
      }

      // 5. Delay orgânico (Anti-Spam)
      await sleep(3000);

    } catch (err: any) {
      console.error(`Exceção ao processar o item [${item.id}]:`, err);
      Sentry.captureException(err);
      await supabase
        .from('whatsapp_queue')
        .update({ 
          status: 'ERROR', 
          processed_at: new Date().toISOString(),
          error_message: String(err)
        })
        .eq('id', item.id);
    }
  }

  console.log(`Consumo finalizado. Total de itens processados com sucesso: ${processedCount}`);
}

main().catch(console.error);
