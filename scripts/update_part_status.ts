/**
 * Script para atualizar status das partes da apostila
 * Executar com: npx tsx scripts/update_part_status.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mxycvuzwwjnimvqdgyhd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWN2dXp3d2puaW12cWRneWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNDA0NzEsImV4cCI6MjA1MDcxNjQ3MX0.H2-F6PjnAwsAq6ksSNj3FknQI_x-0pX3iQNW6sOb8bU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function updatePartStatus() {
    console.log('🔄 Iniciando atualização de status...\n');

    // 1. Semanas PASSADAS (antes de 29/12/2025) COM publicador → CONCLUIDA
    console.log('1️⃣ Atualizando semanas passadas para CONCLUIDA...');

    const { data: pastData, error: pastError } = await supabase
        .from('workbook_parts')
        .update({ status: 'CONCLUIDA' })
        .lt('date', '2025-12-29')
        .not('raw_publisher_name', 'is', null)
        .neq('raw_publisher_name', '')
        .select('id');

    if (pastError) {
        console.error('❌ Erro ao atualizar semanas passadas:', pastError.message);
    } else {
        console.log(`   ✅ ${pastData?.length || 0} partes atualizadas para CONCLUIDA`);
    }

    // 2. Esta semana até 12/01/2026 COM publicador → APROVADA
    console.log('\n2️⃣ Atualizando semanas atuais até 12/01/2026 para APROVADA...');

    const { data: currentData, error: currentError } = await supabase
        .from('workbook_parts')
        .update({ status: 'APROVADA' })
        .gte('date', '2025-12-29')
        .lte('date', '2026-01-18')
        .not('raw_publisher_name', 'is', null)
        .neq('raw_publisher_name', '')
        .select('id');

    if (currentError) {
        console.error('❌ Erro ao atualizar semanas atuais:', currentError.message);
    } else {
        console.log(`   ✅ ${currentData?.length || 0} partes atualizadas para APROVADA`);
    }

    // 3. Resumo
    console.log('\n📊 Verificando distribuição de status...');

    const { data: summary } = await supabase
        .from('workbook_parts')
        .select('status');

    if (summary) {
        const counts: Record<string, number> = {};
        summary.forEach(p => {
            counts[p.status] = (counts[p.status] || 0) + 1;
        });
        console.log('   Status atual:', counts);
    }

    console.log('\n✅ Atualização concluída!');
}

updatePartStatus().catch(console.error);
