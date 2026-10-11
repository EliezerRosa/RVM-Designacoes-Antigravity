import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncPublishers() {
  console.log('🔄 Iniciando sincronização RVM <-> Hourglass...');

  // 1. Carrega os publicadores extraídos do Hourglass
  const hgRaw = JSON.parse(fs.readFileSync('hourglass_ids_extracted.json', 'utf-8'));
  const hgPubs = hgRaw.map((p: any) => ({
      hg_id: parseInt(p.hg_id),
      hg_name: p.name.split('\n')[0].trim() // Remove cargos/status
  }));

  console.log(`Lidos ${hgPubs.length} publicadores do Hourglass.`);

  // 2. Busca todos os publicadores do RVM
  const { data: rvmPubs, error } = await supabase.from('publishers').select('*');
  if (error) throw error;
  
  console.log(`Lidos ${rvmPubs.length} publicadores do RVM.`);

  let exactMatches = 0;
  let fuzzyMatches = 0;
  let notFound = 0;

  for (const rvmPub of rvmPubs) {
      const rvmName = (rvmPub.data.name || '').trim();
      if (!rvmName) continue;

      let match = null;
      let matchStatus = '';

      // Tenta match exato primeiro
      match = hgPubs.find((hg: any) => hg.hg_name.toLowerCase() === rvmName.toLowerCase());
      
      if (match) {
          matchStatus = 'Exato';
          exactMatches++;
      } else {
          // Busca Fuzzy: verifica se o primeiro e último nome batem
          const nameParts = rvmName.split(' ');
          const firstLast = nameParts.length > 1 
            ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}`.toLowerCase() 
            : nameParts[0].toLowerCase();
            
          match = hgPubs.find((hg: any) => hg.hg_name.toLowerCase().includes(nameParts[0].toLowerCase()) && 
                                           hg.hg_name.toLowerCase().includes(nameParts[nameParts.length - 1].toLowerCase()));
          
          if (match) {
              matchStatus = 'Aproximado';
              fuzzyMatches++;
          } else {
              matchStatus = 'Não Encontrado';
              notFound++;
          }
      }

      // Prepara os dados para atualizar o JSONB
      const newData = { ...rvmPub.data };
      
      if (match) {
          newData.hg_id = match.hg_id;
          newData.hg_name = match.hg_name;
          newData.hg_match_status = matchStatus;
      } else {
          newData.hg_match_status = 'Não Encontrado no Hourglass';
      }

      // Salva no banco de dados (coluna JSONB)
      const { error: updateError } = await supabase
          .from('publishers')
          .update({ data: newData })
          .eq('id', rvmPub.id);
          
      if (updateError) {
          console.error(`Erro ao atualizar ${rvmName}:`, updateError.message);
      } else {
          console.log(`[${matchStatus}] ${rvmName} ${match ? '-> ' + match.hg_name + ' (ID: ' + match.hg_id + ')' : ''}`);
      }
  }

  console.log('\n✅ Sincronização concluída!');
  console.log(`📊 Resumo: ${exactMatches} Exatos | ${fuzzyMatches} Aproximados | ${notFound} Não Encontrados`);
}

syncPublishers().catch(console.error);
