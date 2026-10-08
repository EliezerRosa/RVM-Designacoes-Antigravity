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
  const now = new Date();
  
  // 1. Carregar configuração de reunião e Semanas Publicadas (O filtro mestre)
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

  const { data: wpData } = await supabase.from('app_settings').select('value').eq('key', 'week_published').maybeSingle();
  const publishedMap = (wpData?.value as Record<string, string>) || {};
  
  // As semanas que são OFICIAIS e ATIVAS (Data >= hoje)
  const publishedWeekIds = Object.keys(publishedMap).filter(wId => {
    const md = calculateMeetingDate(wId);
    return md && md >= now;
  });
  publishedWeekIds.sort();

  // 2. Buscar fila
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

  const weeksToProcess: string[] = [];
  const processedIds: string[] = [];

  for (const [weekId, info] of weekMap.entries()) {
    const lastChange = new Date(info.status_changed_at);
    const diffMin = (now.getTime() - lastChange.getTime()) / 60000;
    
    // Sempre processamos para limpar a fila
    processedIds.push(...info.ids);

    if (diffMin < DEBOUNCE_MINUTES) {
      console.log(`Semana ${weekId} ignorada por debounce (alterada há ${diffMin.toFixed(1)} min).`);
      // Devolve para a fila removendo dos processados
      for (const id of info.ids) {
          const idx = processedIds.indexOf(id);
          if (idx > -1) processedIds.splice(idx, 1);
      }
      continue;
    }

    // === FILTRO RESTRITO ===
    // Só prosseguimos se a semana ESTIVER PUBLICADA e ATIVA (mesma regra do S-140)
    if (!publishedWeekIds.includes(weekId)) {
        console.log(`Semana ${weekId} ignorada pois NÃO está publicada (ou já passou).`);
        continue;
    }

    weeksToProcess.push(weekId);
  }

  if (weeksToProcess.length === 0) {
    console.log("Nenhuma semana válida/pública pronta para processar após debounce e filtros.");
    // Limpar fila silenciosamente das semanas que foram ignoradas (ex: rascunhos ou passadas)
    if (processedIds.length > 0) {
      await supabase.from('status_pdf_queue').update({ processed: true }).in('id', processedIds);
      console.log(`Fila limpa (${processedIds.length} eventos de rascunho/passado removidos).`);
    }
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
    .select('week_id, titulo_parte, descricao_parte, tipo_parte, funcao, status, status_changed_at, resolved_publisher_id, is_substitution, substituted_publisher_name')
    .in('week_id', weeksToProcess)
    .gte('status_changed_at', twentyFourHoursAgo)
    .order('status_changed_at', { ascending: false });

  const { data: publishersData } = await supabase
    .from('publishers')
    .select('id, name');
  const pubMap = new Map(publishersData?.map(p => [p.id, p.name]) || []);

  const formatDatePTBR = (wId: string) => wId.split('-').reverse().join('/');

  let newWeeksText = '';
  let updatesText = '';

  if (recentParts && recentParts.length > 0) {
    const partsByWeek = recentParts.reduce((acc: any, p: any) => {
      if (!acc[p.week_id]) acc[p.week_id] = [];
      acc[p.week_id].push(p);
      return acc;
    }, {});

    const weeksWithAdjustments = Object.keys(partsByWeek);
    const weeksWithoutAdjustments = weeksToProcess.filter(w => !weeksWithAdjustments.includes(w));

    if (weeksWithoutAdjustments.length > 0) {
       newWeeksText = `\n\n✅ *Semanas confirmadas (sem alterações):* ` + weeksWithoutAdjustments.map(w => `• Semana de ${formatDatePTBR(w)}`).join('; ');
    }

    updatesText = '\n\n🔄 *Ajustes de Designação Realizados:*';
    for (const [wId, pts] of Object.entries(partsByWeek)) {
      updatesText += `\n      • Semana de ${formatDatePTBR(wId)}:`;
      const uniquePts = Array.from(new Set(pts.map((p: any) => {
          const pubName = pubMap.get(p.resolved_publisher_id) || 'A Designar';
          const partName = p.tipo_parte || p.titulo_parte;
          const roleLabel = p.funcao === 'Ajudante' ? '(Ajudante)' : '';
          const roleDisplay = roleLabel ? ` ${roleLabel}` : '';
          
          if (p.is_substitution && p.substituted_publisher_name) {
              return `            ${partName}${roleDisplay}: ${p.substituted_publisher_name} ➡️ ${pubName}`;
          } else {
              return `            ${partName}${roleDisplay}: ➡️ ${pubName}`;
          }
      })));
      updatesText += '\n' + uniquePts.join('\n');
    }
  } else {
      newWeeksText = `\n\n✅ *Semanas confirmadas (sem alterações):* ` + weeksToProcess.map(w => `• Semana de ${formatDatePTBR(w)}`).join('; ');
  }

  // A lista publishedWeekIds já foi calculada no início do script.
  // Ela contém estritamente as semanas publicadas e não vencidas.

  const combinedWeeks = publishedWeekIds.join(',');
  const versionHash = Math.random().toString(36).substring(2, 6).toUpperCase();
  const dataHoraStr = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  
  // Tag com hash para o nome do arquivo (evita cache do WhatsApp)
  const versionTag = `[VERSÃO DE ATUALIZAÇÃO ${dataHoraStr} #${versionHash}]`;
  
  const periodStart = publishedWeekIds.length > 0 ? formatDatePTBR(publishedWeekIds[0]) : '';
  const periodEnd = publishedWeekIds.length > 0 ? formatDatePTBR(publishedWeekIds[publishedWeekIds.length - 1]) : '';
  
  const richCaption = `📦 *PACOTE DE STATUS RVM* — 🏛️ Congregação Parque Jacaraípe\n\n` +
    `🚨 *VERSÃO GERENCIAL DO PACOTE*\n` +
    `⏱️ *Emitido em:* ${dataHoraStr}\n` +
    `📅 *Semanas Inclusas:* ${periodStart} até ${periodEnd}` +
    `${newWeeksText}${updatesText}\n\n` +
    `Segue anexo o Quadro de Status unificado em *PDF*.\n` +
    `📌 *Ação Recomendada:* Abra o PDF e clique no número de telefone para chamar o publicador pendente no WhatsApp.`;

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
