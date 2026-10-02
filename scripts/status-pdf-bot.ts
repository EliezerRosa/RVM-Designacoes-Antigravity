import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_BASE_URL || 'https://rvm-designacoes-antigravity.vercel.app';
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.VITE_BOT_TOKEN || 'rvm_bot_8f4a1c9e2b7d3f5a0e6c8b1d4e7a9f2c';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEBOUNCE_MINUTES = 2; // Tempo de debounce (esperar 2 min após a última alteração antes de gerar o PDF)

async function getRecipientsPhones(): Promise<string[]> {
  const targetRoles = [
    'Superintendente da Reunião Vida e Ministério',
    'Ajudante do Superintendente da Reunião Vida e Ministério',
    'Ajudante SRVM Lembretes'
  ];

  const { data, error } = await supabase.from('publishers').select('data');
  if (error || !data) {
    console.error("Erro ao buscar publicadores:", error);
    return [];
  }

  const phones = new Set<string>();
  data.forEach((p: any) => {
    if (p.data && targetRoles.includes(p.data.funcao)) {
      const phone = p.data.phone || p.data.contact_phone;
      if (phone) phones.add(phone.replace(/\D/g, ''));
    }
  });

  return Array.from(phones);
}

async function sendPdf(phone: string, pdfBuffer: Buffer, caption: string, versionTag: string) {
  const base64Pdf = pdfBuffer.toString('base64');
  
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        action: 'send-document',
        phone,
        document: base64Pdf,
        extension: 'pdf',
        fileName: `${versionTag}_Status_Designacoes.pdf`,
        caption
      }
    });

    if (error) {
      console.error(`Erro ao enviar para ${phone}:`, error);
      const { error: logErr } = await supabase.from('zapi_dispatch_log').insert({
          dispatch_type: 'STATUS_BOARD',
          recipient_phone: phone,
          status: 'ERROR: ' + error.message
      });
      if (logErr) console.error(`Falha gravíssima ao logar erro no BD:`, logErr);
    } else {
      console.log(`Enviado com sucesso para ${phone}:`, data);
      const { error: logErr } = await supabase.from('zapi_dispatch_log').insert({
          dispatch_type: 'STATUS_BOARD',
          recipient_phone: phone,
          status: 'SUCCESS',
          message_id: data?.messageId
      });
      if (logErr) console.error(`Falha gravíssima ao logar SUCESSO no BD:`, logErr);
    }
  } catch (err: any) {
    console.error(`Exceção ao enviar para ${phone}:`, err);
    const { error: logErr } = await supabase.from('zapi_dispatch_log').insert({
        dispatch_type: 'STATUS_BOARD',
        recipient_phone: phone,
        status: 'ERROR: ' + String(err)
    });
    if (logErr) console.error(`Falha gravíssima ao logar EXCEÇÃO no BD:`, logErr);
  }
}

async function main() {
  console.log("Iniciando Status PDF Bot...");
  
  // Buscar fila
  const { data: queue, error } = await supabase
    .from('status_pdf_queue')
    .select('*')
    .eq('processed', false)
    .order('status_changed_at', { ascending: false });

  if (error) {
    console.error("Erro ao ler status_pdf_queue:", error);
    process.exit(1);
  }

  if (!queue || queue.length === 0) {
    console.log("Nenhum item na fila.");
    process.exit(0);
  }

  // Agrupar por week_id e pegar a última alteração
  const weekMap = new Map<string, { id: string; status_changed_at: string; ids: string[] }>();
  
  queue.forEach(item => {
    const existing = weekMap.get(item.week_id);
    if (!existing) {
      weekMap.set(item.week_id, { id: item.id, status_changed_at: item.status_changed_at, ids: [item.id] });
    } else {
      existing.ids.push(item.id);
      // Fica com a data mais recente
      if (new Date(item.status_changed_at) > new Date(existing.status_changed_at)) {
        existing.status_changed_at = item.status_changed_at;
      }
    }
  });

  const now = new Date();
  
  // Fetch meeting days to accurately calculate the meeting date for each week
  const { data: mdData } = await supabase.from('app_settings').select('value').eq('key', 'meeting_days').maybeSingle();
  const meetingDays = (mdData?.value as Record<string, number>) || {};

  function calculateMeetingDate(wId: string): Date | null {
      const dp = wId.split('-');
      if (dp.length !== 3) return null;
      const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
      const dow = meetingDays[wId] ?? 4; // fallback quinta-feira
      const daysToMeeting = (dow - baseDate.getDay() + 7) % 7;
      const meetingDate = new Date(baseDate);
      meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
      // Set to end of day to include the day of the meeting
      meetingDate.setHours(23, 59, 59, 999);
      return meetingDate;
  }

  const weeksToProcess: string[] = [];
  const processedIds: string[] = [];

  for (const [weekId, info] of weekMap.entries()) {
    const lastChange = new Date(info.status_changed_at);
    const diffMin = (now.getTime() - lastChange.getTime()) / 60000;
    
    if (diffMin >= DEBOUNCE_MINUTES) {
      const meetingDate = calculateMeetingDate(weekId);
      // Check if meetingDate is today or in the future
      if (meetingDate && meetingDate >= now) {
        weeksToProcess.push(weekId);
      } else {
        console.log(`Semana ${weekId} ignorada por ser do PASSADO (Reunião ocorreu em: ${meetingDate?.toISOString()}).`);
      }
      // Mesmo as semanas ignoradas do passado devem ser marcadas como processadas para limpar a fila
      processedIds.push(...info.ids);
    } else {
      console.log(`Semana ${weekId} ignorada por debounce (alterada há ${diffMin.toFixed(1)} min).`);
    }
  }

  if (weeksToProcess.length === 0) {
    console.log("Nenhuma semana pronta para processar após debounce.");
    process.exit(0);
  }

  const recipients = await getRecipientsPhones();
  if (recipients.length === 0) {
    console.error("Nenhum destinatário encontrado com as funções necessárias.");
    process.exit(1);
  }

  console.log(`Destinatários encontrados: ${recipients.length} (${recipients.join(', ')})`);

  // Iniciar puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  try {
  // === MODIFICAÇÃO: AGRUPAMENTO DE SEMANAS E TEXTO RICO ===

  // 1. Busca quais partes foram alteradas nas últimas 24h (para colocar no texto)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentParts } = await supabase
    .from('workbook_parts')
    .select('week_id, titulo_parte, descricao_parte, tipo_parte, funcao, status, status_changed_at, resolved_publisher_id')
    .in('week_id', weeksToProcess)
    .gte('status_changed_at', twentyFourHoursAgo)
    .order('status_changed_at', { ascending: false });

  const { data: publishersData } = await supabase
    .from('publishers')
    .select('id, name');
  const pubMap = new Map(publishersData?.map(p => [p.id, p.name]) || []);

  let textDetails = '';
  if (recentParts && recentParts.length > 0) {
    const partsByWeek = recentParts.reduce((acc: any, p: any) => {
      if (!acc[p.week_id]) acc[p.week_id] = [];
      acc[p.week_id].push(p);
      return acc;
    }, {});

    textDetails = '\n\n*Mudanças Recentes Identificadas:*';
    for (const [wId, pts] of Object.entries(partsByWeek)) {
      textDetails += `\n🗓️ *Semana ${wId}:*\n`;
      const uniquePts = Array.from(new Set(pts.map((p: any) => {
          const pubName = pubMap.get(p.resolved_publisher_id) || 'A Designar';
          return `  ↳ ${p.tipo_parte || p.titulo_parte} (${p.funcao === 'Ajudante' ? 'Ajudante' : 'Titular'}) ➜ *${pubName}* (Status Atual: *${p.status}*)`;
      })));
      textDetails += uniquePts.join('\n');
    }
  }

  // 2. Buscar semanas publicadas para gerar o PDF consolidado
  const { data: wpData } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'week_published')
    .maybeSingle();
  const publishedMap = (wpData?.value as Record<string, string>) || {};
  const publishedWeekIds = Object.keys(publishedMap).filter(wId => {
    const md = calculateMeetingDate(wId);
    return md && md >= now;
  });
  
  for (const w of weeksToProcess) {
    if (!publishedWeekIds.includes(w)) publishedWeekIds.push(w);
  }
  publishedWeekIds.sort();

  const combinedWeeks = publishedWeekIds.join(',');
  const versionHash = Math.random().toString(36).substring(2, 6).toUpperCase();
  const dataHoraStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  
  // Tag com hash para o nome do arquivo (evita cache do WhatsApp)
  const versionTag = `[VERSÃO DE ATUALIZAÇÃO ${dataHoraStr} #${versionHash}]`;
  // Tag sem hash para a mensagem de texto
  const captionTag = `[VERSÃO DE ATUALIZAÇÃO ${dataHoraStr}]`;
  
  const richCaption = `🚨 ${captionTag} 🚨\n\nSegue o Quadro Geral unificado contemplando as semanas afetadas:\n${weeksToProcess.map(w => `• ${w}`).join('\n')}${textDetails}\n\n_(Abra o PDF e clique no número de telefone para chamar no WhatsApp)_`;

  console.log(`Gerando PDF ÚNICO para as semanas: ${combinedWeeks}...`);
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  const targetUrl = `${APP_URL}/?portal=status-pdf-print&weekId=${combinedWeeks}&token=${BOT_TOKEN}`;
  console.log(`URL do PDF: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  
  try {
    await page.waitForSelector('#status-pdf-root', { timeout: 10000 });
  } catch (err) {
    const html = await page.content();
    console.error("ERRO AO ENCONTRAR #status-pdf-root! CONTEÚDO DA PÁGINA:");
    console.error(html);
    throw err;
  }
  
  // Ajustar viewport e estilos para melhor impressão
  await page.addStyleTag({
    content: `
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #s89-loading { display: none !important; }
    `
  });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
  });

  console.log(`PDF gerado (${pdfBuffer.length} bytes). Enviando via Z-API...`);

  for (const phone of recipients) {
    await sendPdf(phone, Buffer.from(pdfBuffer), richCaption, versionTag);
  }

  await page.close();

    // Marcar como processado
    if (processedIds.length > 0) {
      const { error: updErr } = await supabase
        .from('status_pdf_queue')
        .update({ processed: true })
        .in('id', processedIds);

      if (updErr) {
        console.error("Erro ao marcar fila como processada:", updErr);
      } else {
        console.log(`${processedIds.length} itens marcados como processados.`);
      }
    }

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Erro fatal no bot:", err);
  process.exit(1);
});
