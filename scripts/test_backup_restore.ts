/**
 * Teste de Backup/Restore com dados mockados
 * Executa via: npx tsx scripts/test_backup_restore.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Dados mockados
const MOCK_PUBLISHERS = [
    {
        id: 'test-001',
        data: {
            id: 'test-001',
            name: 'João Teste',
            phone: '27 99999-0001',
            gender: 'brother',
            condition: 'Ancião',
            isBaptized: true,
            isServing: true,
            ageGroup: 'Adulto',
            parentIds: [],
            isHelperOnly: false,
            canPairWithNonParent: true,
            aliases: ['João T.'],
            privileges: { canPray: true, canPreside: true, canReadCBS: true, canGiveTalks: true, canConductCBS: true },
            privilegesBySection: { canParticipateInLife: true, canParticipateInMinistry: true, canParticipateInTreasures: true },
            availability: { mode: 'always', exceptionDates: [] }
        }
    },
    {
        id: 'test-002',
        data: {
            id: 'test-002',
            name: 'Maria Teste',
            phone: '27 99999-0002',
            gender: 'sister',
            condition: 'Publicador',
            isBaptized: true,
            isServing: true,
            ageGroup: 'Adulto',
            parentIds: [],
            isHelperOnly: false,
            canPairWithNonParent: true,
            aliases: [],
            privileges: { canPray: false, canPreside: false, canReadCBS: false, canGiveTalks: false, canConductCBS: false },
            privilegesBySection: { canParticipateInLife: true, canParticipateInMinistry: true, canParticipateInTreasures: false },
            availability: { mode: 'always', exceptionDates: ['2026-01-15'] }
        }
    }
];

async function runTests() {
    console.log('🧪 INICIANDO TESTES DE BACKUP/RESTORE\n');
    console.log('='.repeat(50));

    // 1. Inserir dados mockados
    console.log('\n📥 1. Inserindo dados mockados...');
    const { error: insertError } = await supabase
        .from('publishers')
        .upsert(MOCK_PUBLISHERS, { onConflict: 'id' });

    if (insertError) {
        console.log('❌ Erro ao inserir:', insertError.message);
        return;
    }
    console.log('✅ 2 publicadores mockados inseridos');

    // 2. Buscar dados (simular export)
    console.log('\n📤 2. Buscando dados (simular export)...');
    const { data: exportedData, error: fetchError } = await supabase
        .from('publishers')
        .select('*')
        .in('id', ['test-001', 'test-002']);

    if (fetchError) {
        console.log('❌ Erro ao buscar:', fetchError.message);
        return;
    }
    console.log(`✅ ${exportedData?.length} registros exportados`);
    console.log('   Estrutura:', JSON.stringify(Object.keys(exportedData?.[0] || {})));

    // 3. Simular serialização Excel
    console.log('\n📊 3. Simulando serialização Excel...');
    const excelFormat = exportedData?.map(pub => ({
        id: pub.id,
        data: JSON.stringify(pub.data),  // Serializa como string
        created_at: pub.created_at
    }));
    console.log('   Exemplo após serialização:');
    console.log(`   id: ${excelFormat?.[0]?.id}`);
    console.log(`   data (primeiros 100 chars): ${excelFormat?.[0]?.data.substring(0, 100)}...`);

    // 4. Simular parse do Excel
    console.log('\n📥 4. Simulando parse do Excel...');
    const parsedFromExcel = excelFormat?.map(row => ({
        id: row.id,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
        created_at: row.created_at
    }));
    console.log('   Após parse:');
    console.log(`   name: ${(parsedFromExcel?.[0]?.data as any)?.name}`);
    console.log(`   phone: ${(parsedFromExcel?.[0]?.data as any)?.phone}`);
    console.log(`   aliases: ${JSON.stringify((parsedFromExcel?.[0]?.data as any)?.aliases)}`);

    // 5. Deletar e recriar (simular restore)
    console.log('\n🔄 5. Simulando restore...');

    // Delete
    const { error: deleteError } = await supabase
        .from('publishers')
        .delete()
        .in('id', ['test-001', 'test-002']);

    if (deleteError) {
        console.log('❌ Erro ao deletar:', deleteError.message);
        return;
    }
    console.log('   Dados deletados');

    // Verificar que foram deletados
    const { count: countAfterDelete } = await supabase
        .from('publishers')
        .select('*', { count: 'exact', head: true })
        .in('id', ['test-001', 'test-002']);
    console.log(`   Verificação: ${countAfterDelete} registros de teste (esperado: 0)`);

    // Re-inserir
    const { error: restoreError } = await supabase
        .from('publishers')
        .upsert(parsedFromExcel!, { onConflict: 'id' });

    if (restoreError) {
        console.log('❌ Erro ao restaurar:', restoreError.message);
        return;
    }
    console.log('   Dados restaurados');

    // 6. Verificar integridade
    console.log('\n🔍 6. Verificando integridade...');
    const { data: verifyData, error: verifyError } = await supabase
        .from('publishers')
        .select('*')
        .in('id', ['test-001', 'test-002']);

    if (verifyError) {
        console.log('❌ Erro ao verificar:', verifyError.message);
        return;
    }

    const original1 = MOCK_PUBLISHERS[0].data;
    const restored1 = verifyData?.find(p => p.id === 'test-001')?.data;

    const checks = [
        { field: 'name', original: original1.name, restored: restored1?.name },
        { field: 'phone', original: original1.phone, restored: restored1?.phone },
        { field: 'gender', original: original1.gender, restored: restored1?.gender },
        { field: 'condition', original: original1.condition, restored: restored1?.condition },
        { field: 'aliases', original: JSON.stringify(original1.aliases), restored: JSON.stringify(restored1?.aliases) },
        { field: 'privileges.canPray', original: original1.privileges.canPray, restored: restored1?.privileges?.canPray },
    ];

    let allPassed = true;
    for (const check of checks) {
        const passed = check.original === check.restored;
        console.log(`   ${passed ? '✅' : '❌'} ${check.field}: ${check.original} ${passed ? '=' : '≠'} ${check.restored}`);
        if (!passed) allPassed = false;
    }

    // 7. Limpeza
    console.log('\n🧹 7. Limpando dados de teste...');
    await supabase
        .from('publishers')
        .delete()
        .in('id', ['test-001', 'test-002']);
    console.log('   Dados de teste removidos');

    // Resultado final
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('🎉 TODOS OS TESTES PASSARAM!');
        console.log('   O backup/restore está funcionando corretamente.');
    } else {
        console.log('❌ ALGUNS TESTES FALHARAM!');
        console.log('   Verifique os erros acima.');
    }
}

runTests().catch(console.error);
