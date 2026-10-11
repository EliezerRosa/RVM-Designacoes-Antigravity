import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const hgToken = process.env.HG_SESSION_TOKEN; // Precisaremos do token de sessão do Hourglass

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase credentials missing.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function pushAssignmentsToHourglass(targetWeek: string) {
  if (!hgToken) {
    console.warn("⚠️ ALERTA: HG_SESSION_TOKEN não encontrado no .env.local.");
    console.warn("Para fazer o push direto via API, você precisa pegar seu token de sessão (Bearer) no painel de rede do navegador (F12) ao acessar o Hourglass.");
    // return; // Comentado para mostrar o fluxo
  }

  console.log(`\n🔍 Buscando designações no RVM para a semana: ${targetWeek}`);
  
  const { data: parts, error } = await supabase
    .from('workbook_parts')
    .select('*, publishers:resolved_publisher_id(data)')
    .eq('week_display', targetWeek)
    .not('resolved_publisher_id', 'is', null);

  if (error) throw error;

  console.log(`Encontradas ${parts.length} partes com publicadores designados.`);

  // O fluxo de push exige três etapas:
  // 1. (No Hourglass) Buscar o ID da semana e os IDs de cada bloco (ex: Leitura da Bíblia = id 4599)
  // 2. (No Hourglass) Buscar o de/para de Usuários (saber qual o ID do "João" lá no HG)
  // 3. Fazer o POST / PUT disparando a designação.

  console.log(`\n🚀 Iniciando simulação de Push para o endpoint do HG...`);
  
  for (const part of parts) {
    const publisherName = (part.publishers as any)?.data?.name || 'Desconhecido';
    const partTitle = part.part_title;

    // TODO: Aqui entraria o fetch real para a API do HG
    /*
    await fetch(`https://app.hourglass-app.com/api/v0.2/mm/schedule/${targetWeek}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${hgToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assignment_id: "<ID_DA_PARTE_NO_HG>", // Requer mapeamento
        assignee_id: "<ID_DO_PUBLICADOR_NO_HG>" // Requer mapeamento
      })
    });
    */
    
    console.log(`✅ [MOCK PUSH] -> Enviado para o HG: ${partTitle} => ${publisherName}`);
  }

  console.log("\n🎯 Push finalizado (Mock).");
}

// Exemplo: rodar para uma semana específica
pushAssignmentsToHourglass("2026-10-12");
