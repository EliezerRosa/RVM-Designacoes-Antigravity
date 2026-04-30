/**
 * Script: Verificar e Sincronizar Disponibilidade de Publicadores
 * 
 * Compara os dados do Supabase com initialPublishers.ts
 * Foco especial: Emerson França e outros com disponibilidade restrita
 * 
 * Executar: npx tsx scripts/sync-availability.ts
 */

import { createClient } from '@supabase/supabase-js';
import { initialPublishers } from '../src/data/initialPublishers';

const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface Publisher {
    id: string;
    name: string;
    availability: {
        mode: 'always' | 'never';
        exceptionDates: string[];
        availableDates: string[];
    };
    [key: string]: any;
}

async function main() {
    console.log('🔍 Carregando publicadores do Supabase...\n');

    const { data, error } = await supabase
        .from('publishers')
        .select('id, data')
        .order('id');

    if (error) {
        console.error('❌ Erro ao carregar do Supabase:', error);
        return;
    }

    const supabasePublishers = (data || []).map(row => row.data as Publisher);
    console.log(`📦 ${supabasePublishers.length} publicadores no Supabase`);
    console.log(`📦 ${initialPublishers.length} publicadores no código local\n`);

    // Encontrar publicadores com disponibilidade restrita
    const restrictedLocal = initialPublishers.filter(p => p.availability.mode === 'never');
    console.log(`🔒 ${restrictedLocal.length} publicadores com modo 'never' no código local:`);
    restrictedLocal.forEach(p => {
        console.log(`   - ${p.name}: ${p.availability.availableDates.length} datas disponíveis`);
    });

    console.log('\n' + '='.repeat(60) + '\n');

    // Comparar cada publicador restrito
    for (const localPub of restrictedLocal) {
        const supaPub = supabasePublishers.find(p => p.id === localPub.id || p.name === localPub.name);

        console.log(`📋 ${localPub.name}:`);

        if (!supaPub) {
            console.log('   ⚠️  NÃO ENCONTRADO no Supabase!');
            continue;
        }

        const localMode = localPub.availability.mode;
        const supaMode = supaPub.availability?.mode || 'unknown';
        const localDates = localPub.availability.availableDates || [];
        const supaDates = supaPub.availability?.availableDates || [];

        console.log(`   Código Local: mode="${localMode}", ${localDates.length} datas`);
        console.log(`   Supabase:     mode="${supaMode}", ${supaDates.length} datas`);

        if (localMode !== supaMode) {
            console.log(`   ❌ MODO DIFERENTE!`);
        }

        if (localDates.length !== supaDates.length) {
            console.log(`   ❌ QUANTIDADE DE DATAS DIFERENTE!`);
        }

        // Verificar datas específicas
        const localSet = new Set(localDates);
        const supaSet = new Set(supaDates);

        const missingInSupa = localDates.filter(d => !supaSet.has(d));
        const extraInSupa = supaDates.filter(d => !localSet.has(d));

        if (missingInSupa.length > 0) {
            console.log(`   ❌ Datas FALTANDO no Supabase: ${missingInSupa.slice(0, 5).join(', ')}${missingInSupa.length > 5 ? '...' : ''}`);
        }
        if (extraInSupa.length > 0) {
            console.log(`   ⚠️  Datas EXTRAS no Supabase: ${extraInSupa.slice(0, 5).join(', ')}${extraInSupa.length > 5 ? '...' : ''}`);
        }

        if (localMode === supaMode && localDates.length === supaDates.length && missingInSupa.length === 0) {
            console.log(`   ✅ SINCRONIZADO`);
        }

        console.log('');
    }

    // Perguntar se quer sincronizar
    console.log('\n' + '='.repeat(60));
    console.log('\n🔄 Para SINCRONIZAR do código local para o Supabase, execute:');
    console.log('   npx tsx scripts/sync-availability.ts --sync\n');

    // Se passou --sync, sincronizar
    if (process.argv.includes('--sync')) {
        console.log('🔄 SINCRONIZANDO...\n');

        for (const localPub of restrictedLocal) {
            const supaPub = supabasePublishers.find(p => p.id === localPub.id || p.name === localPub.name);

            if (supaPub) {
                // Atualizar availability
                const updatedPub = {
                    ...supaPub,
                    availability: localPub.availability
                };

                const { error: updateError } = await supabase
                    .from('publishers')
                    .update({ data: updatedPub })
                    .eq('id', supaPub.id);

                if (updateError) {
                    console.log(`   ❌ Erro ao atualizar ${localPub.name}: ${updateError.message}`);
                } else {
                    console.log(`   ✅ ${localPub.name} atualizado!`);
                }
            }
        }

        console.log('\n✅ Sincronização completa!');
    }
}

main().catch(console.error);
