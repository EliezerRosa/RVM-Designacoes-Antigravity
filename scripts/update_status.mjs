/**
 * Script para atualizar status das partes da apostila
 * Executar com: node scripts/update_status.mjs
 */

const supabaseUrl = 'https://mxycvuzwwjnimvqdgyhd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWN2dXp3d2puaW12cWRneWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNDA0NzEsImV4cCI6MjA1MDcxNjQ3MX0.H2-F6PjnAwsAq6ksSNj3FknQI_x-0pX3iQNW6sOb8bU';

async function updateStatus() {
    console.log('🔄 Iniciando atualização de status...\n');

    // 1. Semanas PASSADAS → CONCLUIDA
    console.log('1️⃣ Atualizando semanas passadas para CONCLUIDA...');

    const res1 = await fetch(`${supabaseUrl}/rest/v1/workbook_parts?date=lt.2025-12-29&raw_publisher_name=not.is.null&raw_publisher_name=neq.`, {
        method: 'PATCH',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status: 'CONCLUIDA' })
    });

    if (!res1.ok) {
        console.error('❌ Erro:', await res1.text());
    } else {
        const data1 = await res1.json();
        console.log(`   ✅ ${data1.length} partes atualizadas para CONCLUIDA`);
    }

    // 2. Esta semana até 18/01/2026 → APROVADA
    console.log('\n2️⃣ Atualizando semanas atuais para APROVADA...');

    const res2 = await fetch(`${supabaseUrl}/rest/v1/workbook_parts?date=gte.2025-12-29&date=lte.2026-01-18&raw_publisher_name=not.is.null&raw_publisher_name=neq.`, {
        method: 'PATCH',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status: 'APROVADA' })
    });

    if (!res2.ok) {
        console.error('❌ Erro:', await res2.text());
    } else {
        const data2 = await res2.json();
        console.log(`   ✅ ${data2.length} partes atualizadas para APROVADA`);
    }

    // 3. Resumo
    console.log('\n📊 Verificando distribuição de status...');

    const res3 = await fetch(`${supabaseUrl}/rest/v1/workbook_parts?select=status`, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });

    const summary = await res3.json();
    const counts = {};
    summary.forEach(p => {
        counts[p.status] = (counts[p.status] || 0) + 1;
    });
    console.log('   Status:', counts);

    console.log('\n✅ Atualização concluída!');
}

updateStatus().catch(console.error);
