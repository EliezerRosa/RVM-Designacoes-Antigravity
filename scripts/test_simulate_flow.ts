import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// MOCK: Evita o erro de DOMMatrix do pdfjs no Node.js
(globalThis as any).DOMMatrix = class DOMMatrix {
    constructor() {}
    multiply() {}
    translate() {}
    scale() {}
};

async function run() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { publishWeek } = await import('../src/services/weekPublishService');
    console.log('--- PREPARANDO FASE 0 & 1 ---');

    // 1. Encontrar a semana 19 de Outubro (2026-10-19)
    // O usuário disse que a semana já existe.
    // Vamos buscar partes no workbook_parts que tenham week_id iniciando com 2026-10-19
    const { data: parts } = await supabase.from('workbook_parts').select('*').like('week_id', '2026-10-19%');
    
    if (!parts || parts.length === 0) {
        console.error('Nenhuma parte encontrada para a semana de 19 de Outubro de 2026!', parts);
        return;
    }
    const targetWeekId = parts[0].week_id;
    console.log(`Semana encontrada: ID = ${targetWeekId} (Temos ${parts.length} partes nessa semana)`);

    // 2. Encontrar e atualizar os publicadores de teste
    const { data: pubs } = await supabase.from('publishers').select('id, data');
    const testPubs = pubs?.filter(p => p.data?.name?.includes('Teste')) || [];
    
    const targetPhone = '5527981170400';
    for (const p of testPubs) {
        const newData = { ...p.data, phone: targetPhone, contact_phone: targetPhone };
        await supabase.from('publishers').update({ data: newData }).eq('id', p.id);
        console.log(`Publicador ${p.data.name} (ID: ${p.id}) atualizado para telefone ${targetPhone}`);
    }

    // 3. Encontrar as partes (workbook_parts) da semana
    // Como a variável parts já tem todas as partes dessa semana, podemos reusá-la
    if (parts.length < 3) {
        console.error('Menos de 3 partes encontradas para essa semana!', parts);
        return;
    }

    // Designar 3 partes para os 3 publicadores de teste
    for (let i = 0; i < 3; i++) {
        const pub = testPubs[i];
        const part = parts[i];
        await supabase.from('workbook_parts').update({
            status: 'PROPOSTA',
            resolved_publisher_id: pub.id,
            resolved_publisher_name: pub.data?.name,
            raw_publisher_name: pub.data?.name
        }).eq('id', part.id);
        console.log(`Parte '${part.part_title}' designada para ${pub.data?.name} (Status: PROPOSTA)`);
    }

    console.log('\n--- EXECUTANDO FASE 2: DISPARO (publishWeek) ---');
    // Chamamos a função real que o aplicativo usa para publicar
    const result = await publishWeek(targetWeekId, parts as any, pubs as any);
    
    if (result.success) {
        console.log('✅ Disparo realizado com sucesso!', result);
        console.log('🔔 Você deve receber 3 mensagens S-89 no seu WhatsApp agora.');
    } else {
        console.error('❌ Falha ao disparar:', result.error);
        console.dir(result.errors, { depth: null });
    }
}

run().catch(console.error);
