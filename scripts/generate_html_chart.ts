import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
let url = '';
let key = '';
envFile.split('\n').forEach(line => {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].replace(/"/g, '').trim();
    if (line.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].replace(/"/g, '').trim();
});

const supabase = createClient(url, key);

const partTypeOrder = [
    'Presidente',
    'Discurso Tesouros',
    'Joias Espirituais',
    'Leitura da Bíblia',
    'O Que Você Diria',
    'Iniciando Conversas',
    'Cultivando o Interesse',
    'Fazendo Discípulos',
    'Explicando Suas Crenças',
    'Discurso de Estudante',
    'Parte Vida Cristã',
    'Necessidades Locais',
    'Boletim',
    'Dirigente EBC',
    'Leitor EBC',
    'Evento Especial',
    'Não pode cumprir'
];

async function main() {
    try {
        const { data: parts, error: partsErr } = await supabase
            .from('workbook_parts')
            .select('id, date, week_id, resolved_publisher_id, tipo_parte, modalidade, substituted_publisher_name, is_substitution, created_at');

        if (partsErr) throw partsErr;

        // Ano pela data da semana da parte; created_at só como fallback para linhas sem date.
        const yearOf = (p: { date?: string | null; week_id?: string | null; created_at?: string | null }) => {
            const src = p.date || p.week_id || p.created_at;
            return src ? src.substring(0, 4) : 'Desconhecido';
        };
        const partYearById = new Map<string, string>();
        parts.forEach(p => partYearById.set(p.id, yearOf(p)));

        const { data: refusals, error: refusalsErr } = await supabase
            .from('zapi_smart_interactions')
            .select('publisher_name, created_at, workbook_part_id')
            .eq('detected_intent', 'RECUSAR');
            
        if (refusalsErr) throw refusalsErr;

        const { data: pubs, error: pubsErr } = await supabase
            .from('publishers')
            .select('id, data');

        if (pubsErr) throw pubsErr;

        const pubMap = new Map();
        const nameToCondition = new Map();
        
        pubs.forEach(p => {
            if (p.data && (p.data.condition === 'Ancião' || p.data.condition === 'Servo Ministerial' || p.data.condition === 'Anciao')) {
                const condition = p.data.condition === 'Anciao' ? 'Ancião' : p.data.condition;
                pubMap.set(p.id, { name: p.data.name, condition });
                nameToCondition.set(p.data.name.trim().toLowerCase(), { name: p.data.name, condition });
            }
        });

        const flatData: any[] = [];
        let minYearGlobal = 9999;
        let maxYearGlobal = 0;

        // Lista de partes excluídas conforme instrução do usuário
        const excludedTypes = [
            'Oração Inicial', 'Oração Final', 'Elogios e Conselhos', 
            'Comentários Iniciais', 'Comentários Finais', 
            'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico',
            'Oracao Inicial', 'Oracao Final', 'Observações Finais', 'Observacoes Finais', 'Comentarios Iniciais', 'Comentarios Finais'
        ];

        for (const p of parts) {
            const year = yearOf(p);
            
            if (year !== 'Desconhecido') {
                const y = parseInt(year);
                if (y < minYearGlobal) minYearGlobal = y;
                if (y > maxYearGlobal) maxYearGlobal = y;
            }

            if (p.resolved_publisher_id) {
                const pubInfo = pubMap.get(p.resolved_publisher_id);
                if (pubInfo) {
                    let tipo = p.tipo_parte || p.modalidade || 'Desconhecido';
                    
                    const tNorm = tipo.trim().toLowerCase();
                    if (tNorm === 'parte ministério' || tNorm === 'parte ministerio' || tNorm === 'faça o seu melhor no ministério') {
                        tipo = 'O Que Você Diria';
                    }
                    if (tNorm === 'explicando nossas crenças' || tNorm === 'explicando nossas crencas' || tNorm === 'explicando suas crencas') {
                        tipo = 'Explicando Suas Crenças';
                    }

                    // Se a parte estiver na lista de exclusão (case insensitive), não adiciona
                    const isExcluded = excludedTypes.some(ex => ex.toLowerCase() === tipo.toLowerCase());

                    if (!isExcluded) {
                        flatData.push({
                            name: pubInfo.name,
                            group: pubInfo.condition,
                            tipo_parte: tipo,
                            year: year
                        });
                    }
                }
            }
            
            if (p.is_substitution && p.substituted_publisher_name) {
                const subName = p.substituted_publisher_name.trim().toLowerCase();
                const pubInfo = nameToCondition.get(subName);
                if (pubInfo) {
                    flatData.push({
                        name: pubInfo.name,
                        group: pubInfo.condition,
                        tipo_parte: 'Não pode cumprir',
                        source: 'manual_or_bot',
                        year: year
                    });
                }
            }
        }

        for (const r of refusals || []) {
            if (r.publisher_name && (r.workbook_part_id || r.created_at)) {
                const year = (r.workbook_part_id && partYearById.get(r.workbook_part_id)) || r.created_at.substring(0,4);
                
                const y = parseInt(year);
                if (!isNaN(y)) {
                    if (y < minYearGlobal) minYearGlobal = y;
                    if (y > maxYearGlobal) maxYearGlobal = y;
                }

                const subName = r.publisher_name.trim().toLowerCase();
                const pubInfo = nameToCondition.get(subName);
                if (pubInfo) {
                    const alreadyLogged = flatData.find(f => f.name === pubInfo.name && f.tipo_parte === 'Não pode cumprir' && f.source === 'manual_or_bot' && f.year === year && f.part_id === r.workbook_part_id);
                    if (!alreadyLogged) {
                        flatData.push({
                            name: pubInfo.name,
                            group: pubInfo.condition,
                            tipo_parte: 'Não pode cumprir',
                            source: 'zapi',
                            part_id: r.workbook_part_id,
                            year: year
                        });
                    }
                }
            }
        }

        const uniqueNames = Array.from(new Set(flatData.map(d => d.name)));
        
        const presentYears = Array.from(new Set(flatData.map(d => d.year))).sort((a, b) => b.localeCompare(a)); 

        uniqueNames.sort((a, b) => {
            const totalA = flatData.filter(d => d.name === a).length;
            const totalB = flatData.filter(d => d.name === b).length;
            return totalB - totalA;
        });

        const rowLabels: string[] = [];
        uniqueNames.forEach(name => {
            const groupInfo = flatData.find(d => d.name === name)?.group || '';
            const groupAbbrev = groupInfo === 'Ancião' ? 'ANC' : 'SM';
            
            presentYears.forEach(year => {
                rowLabels.push(`${name} (${groupAbbrev} - ${year})`);
            });
        });

        const allTypes = new Set(flatData.map(d => d.tipo_parte));
        const typeArray = Array.from(allTypes);
        
        typeArray.sort((a, b) => {
            if (a === 'Não pode cumprir') return 1;
            if (b === 'Não pode cumprir') return -1;
            const indexA = partTypeOrder.indexOf(a);
            const indexB = partTypeOrder.indexOf(b);
            const posA = indexA === -1 ? 99 : indexA;
            const posB = indexB === -1 ? 99 : indexB;
            if (posA === posB) return a.localeCompare(b);
            return posA - posB;
        });

        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', 
            '#f97316', '#84cc16', '#6366f1', '#a855f7', '#14b8a6', '#eab308',
            '#ef4444', '#64748b', '#22c55e', '#d946ef', '#1e3a8a', '#991b1b',
            '#065f46', '#3f6212', '#701a75', '#831843'
        ];

        const datasets = typeArray.map((t, i) => {
            const isSub = t === 'Não pode cumprir';
            
            const data = rowLabels.map(rowLabel => {
                const match = rowLabel.match(/(.+) \((ANC|SM) - (.+)\)/);
                if (!match) return 0;
                const name = match[1];
                const year = match[3];
                
                return flatData.filter(d => d.name === name && d.year === year && d.tipo_parte === t).length;
            });

            return {
                label: t,
                data: data,
                backgroundColor: isSub ? '#000000' : colors[i % colors.length],
                ...(isSub ? { stack: 'recusas' } : {})
            }
        });

        const height = rowLabels.length * 25 + 200;
        const id = 'chart_unified';

        const titleText = minYearGlobal === maxYearGlobal || minYearGlobal === 9999
            ? `Análise Unificada de Privilégios RVM (${minYearGlobal === 9999 ? 'Desconhecido' : minYearGlobal})`
            : `Análise Unificada de Privilégios RVM (${minYearGlobal}-${maxYearGlobal})`;

        const htmlCharts = `
    <div class="chart-wrapper">
        <h2>Participações: Anciãos e Servos Ministeriais</h2>
        <div style="position: relative; height: ${height}px; width: 100%;">
            <canvas id="${id}"></canvas>
        </div>
    </div>
`;

        const scriptCharts = `
    const totalsPlugin = {
        id: 'totals',
        afterDatasetsDraw(chart) {
            const { ctx, data, scales: { x } } = chart;
            ctx.save();
            ctx.font = '600 11px Segoe UI, Tahoma, sans-serif';
            ctx.fillStyle = '#0f172a';
            ctx.textBaseline = 'middle';
            data.labels.forEach((_, i) => {
                let total = 0;
                let anchorY = null;
                data.datasets.forEach((ds, di) => {
                    if (ds.stack === 'recusas' || !chart.isDatasetVisible(di)) return;
                    total += Number(ds.data[i]) || 0;
                    if (anchorY === null) anchorY = chart.getDatasetMeta(di).data[i]?.y ?? null;
                });
                if (total > 0 && anchorY !== null) {
                    ctx.fillText(String(total), x.getPixelForValue(total) + 6, anchorY);
                }
            });
            ctx.restore();
        }
    };

    new Chart(document.getElementById('${id}'), {
        type: 'bar',
        plugins: [totalsPlugin],
        data: {
            labels: ${JSON.stringify(rowLabels)},
            datasets: ${JSON.stringify(datasets)}
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 40 } },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12 } },
                tooltip: { enabled: false }
            },
            scales: {
                x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Total de Participações' } },
                y: { stacked: true, ticks: { font: { size: 12 } } }
            }
        }
    });
`;

        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleText}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
        .container { width: 100%; max-width: 1400px; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        h1 { text-align: center; color: #0f172a; margin-bottom: 40px; font-size: 28px; }
        .chart-wrapper { width: 100%; }
        h2 { color: #334155; margin-bottom: 25px; border-left: 5px solid #3b82f6; padding-left: 15px; font-size: 22px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${titleText}</h1>
        <p style="text-align: center; color: #64748b; margin-top: -30px; margin-bottom: 40px;">Ano classificado pela data da semana da parte. ${maxYearGlobal === new Date().getFullYear() ? `${maxYearGlobal} é parcial (até ${new Date().toLocaleDateString('pt-BR')}). ` : ''}Partes não designáveis (Orações, Cânticos, Elogios etc.) excluídas. <strong>"Não pode cumprir"</strong> é recusa/impedimento, não participação — barra separada, fora do total.</p>
        ${htmlCharts}
    </div>
    <script>
        ${scriptCharts}
    </script>
</body>
</html>`;

        const outPath = process.argv[2] || 'C:/Users/Eliez/Downloads/grafico_participacoes_unificado v3.html';
        fs.writeFileSync(outPath, html, 'utf-8');
        console.log('HTML generated at', outPath);

    } catch (err) {
        console.error(err);
    }
}

main();
