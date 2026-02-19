import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const sb = createClient(
    'https://pevstuyzlewvjidjkmea.supabase.co',
    'sb_publishable_SObnBXFPKyoPO7-b4ldeqg_i2gpKOrv'
);

async function main() {
    const lines: string[] = [];

    // 1. Check if workbook_parts has any update timestamps
    const { data: sampleParts, error } = await sb
        .from('workbook_parts')
        .select('*')
        .like('week_id', '2026-03-23%')
        .limit(3);

    if (error) {
        lines.push('ERROR: ' + JSON.stringify(error));
    } else if (sampleParts && sampleParts.length > 0) {
        lines.push('=== Estrutura de parte (semana 2026-03-23) ===\n');
        const sample = sampleParts[0];
        const keys = Object.keys(sample).sort();
        for (const key of keys) {
            lines.push(`  ${key}: ${JSON.stringify(sample[key])}`);
        }

        lines.push('\n=== Timestamps de TODAS as partes 2026-03-23 ===\n');
        for (const p of sampleParts) {
            lines.push(`  ${(p.tipo_parte || '').padEnd(30)} updated: ${p.updated_at || p.modified_at || 'N/A'}  created: ${p.created_at || 'N/A'}`);
        }
    }

    // 2. Check ALL parts of that week for timestamps
    const { data: allParts } = await sb
        .from('workbook_parts')
        .select('tipo_parte,resolved_publisher_name,updated_at,created_at,status')
        .like('week_id', '2026-03-23%');

    if (allParts) {
        lines.push('\n=== Todas as 23 partes (2026-03-23) ===\n');
        for (const p of allParts) {
            const pub = p.resolved_publisher_name || '(vazio)';
            lines.push(`  ${(p.tipo_parte || '').padEnd(35)} ${pub.padEnd(20)} updated: ${p.updated_at || 'N/A'}  status: ${p.status}`);
        }
    }

    // 3. Check a WORKING week for comparison
    const { data: workingWeek } = await sb
        .from('workbook_parts')
        .select('tipo_parte,resolved_publisher_name,updated_at,created_at,status')
        .like('week_id', '2026-03-16%')
        .limit(5);

    if (workingWeek) {
        lines.push('\n=== Comparação: 5 partes de 2026-03-16 (funcional) ===\n');
        for (const p of workingWeek) {
            const pub = p.resolved_publisher_name || '(vazio)';
            lines.push(`  ${(p.tipo_parte || '').padEnd(35)} ${pub.padEnd(20)} updated: ${p.updated_at || 'N/A'}  status: ${p.status}`);
        }
    }

    // 4. Check extraction_history for any extraction events
    const { data: extractionHist } = await sb
        .from('extraction_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (extractionHist && extractionHist.length > 0) {
        lines.push('\n=== Últimos 5 registros de extraction_history ===\n');
        for (const e of extractionHist) {
            lines.push(`  ${e.created_at} | ${e.batch_id || 'N/A'} | ${e.source || 'N/A'} | ${e.status || 'N/A'}`);
        }
    }

    const output = lines.join('\n');
    writeFileSync('scripts/week_check_output.txt', output, 'utf-8');
    console.log('Done. Output in scripts/week_check_output.txt');
}

main().catch(console.error);
