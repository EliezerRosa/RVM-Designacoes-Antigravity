import type { HistoryRecord, Publisher, WorkbookPart } from '../types';

export interface AnalyticsSummary {
    totalAssignments: number;
    uniquePublishersUsed: number;
    coveragePercentage: number;
    distributionByType: { name: string; value: number }[];
    topDesignated: { name: string; count: number }[];
    lowDesignated: { name: string; count: number }[];
    bumpChartData: any; // Dados formatados para o Bump Chart
}

/**
 * Gera relatório completo de analytics para a sessão atual
 */
export function generateSessionReport(
    currentParts: WorkbookPart[],
    publishers: Publisher[],
    history: HistoryRecord[]
): AnalyticsSummary {

    // 1. Unificar Histórico + Designações Atuais (filtrando status ativos)
    const activeCurrent = currentParts.filter(p =>
        p.resolvedPublisherName &&
        !['PENDENTE', 'CANCELADA', 'REJEITADA'].includes(p.status)
    );

    const currentAsHistory: HistoryRecord[] = activeCurrent.map(p => ({
        id: p.id,
        weekId: p.weekId,
        weekDisplay: p.weekDisplay || '',
        date: p.date,
        section: p.section,
        tipoParte: p.tipoParte,
        modalidade: p.modalidade || '',
        tituloParte: p.tituloParte || '',
        descricaoParte: p.descricaoParte || '',
        detalhesParte: p.detalhesParte || '',
        seq: p.seq || 0,
        funcao: p.funcao as 'Titular' | 'Ajudante',
        duracao: p.duracao || 0,
        horaInicio: p.horaInicio || '',
        horaFim: p.horaFim || '',
        resolvedPublisherName: p.resolvedPublisherName!,
        rawPublisherName: p.rawPublisherName || '',
        status: 'VALIDATED',
        importSource: 'Manual',
        importBatchId: 'session',
        createdAt: new Date().toISOString()
    })) as unknown as HistoryRecord[];

    const allRecords = [...history, ...currentAsHistory];

    // 2. Map de Contagem Total por Publicador
    const countMap = new Map<string, number>();
    // Inicializar com 0 para todos os publicadores ativos
    publishers.forEach(p => {
        if (p.isServing && !p.isNotQualified) {
            countMap.set(p.name, 0);
        }
    });

    allRecords.forEach(r => {
        const name = r.resolvedPublisherName || r.rawPublisherName || '';
        if (name && countMap.has(name)) {
            countMap.set(name, countMap.get(name)! + 1);
        }
    });

    // 3. Distribuição por Tipo (Apenas designações ATUAIS da sessão/janela)
    // Se quiser do histórico todo, usar allRecords. Vamos usar ALL para ter volume.
    const typeCount = { 'Ensino': 0, 'Estudante': 0, 'Ajudante': 0, 'Outros': 0 };

    const getCategory = (tipo: string, funcao: string) => {
        const t = tipo.toLowerCase();
        if (funcao === 'Ajudante') return 'Ajudante';
        if (t.includes('leitura') || t.includes('demonstração') || t.includes('estudante')) return 'Estudante';
        if (t.includes('discurso') || t.includes('presidente') || t.includes('oração')) return 'Ensino';
        return 'Outros';
    };

    allRecords.forEach(r => {
        const cat = getCategory(r.tipoParte || '', r.funcao || '');
        if (typeCount[cat as keyof typeof typeCount] !== undefined) {
            typeCount[cat as keyof typeof typeCount]++;
        }
    });

    const distributionByType = Object.entries(typeCount).map(([name, value]) => ({ name, value }));

    // 4. Ranking Geral (Top / Low)
    const sortedPublishers = Array.from(countMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const topDesignated = sortedPublishers.slice(0, 10);
    const lowDesignated = sortedPublishers.slice(-10).reverse(); // Os com menos (muitos com 0)

    // 5. Bump Chart Data (Ranking Semanal - Últimas 12 semanas)
    // Objetivo: Mostrar como o ranking dos Top 5 ACUMULADOS mudou semana a semana.
    // Eixo X: Semanas. Linhas: Publicadores. Eixo Y: Posição no Ranking Acumulado.

    const bumpChartData = generateBumpChartData(allRecords, publishers);

    return {
        totalAssignments: allRecords.length,
        uniquePublishersUsed: sortedPublishers.filter(p => p.count > 0).length,
        coveragePercentage: Math.round((sortedPublishers.filter(p => p.count > 0).length / publishers.length) * 100),
        distributionByType,
        topDesignated,
        lowDesignated,
        bumpChartData
    };
}

/**
 * Gera dados para o Bump Chart (Evolução do Ranking)
 * Considera as últimas 12 semanas presentes nos dados.
 */
function generateBumpChartData(records: HistoryRecord[], _publishers: Publisher[]) {
    // Ordenar registros por data
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));

    if (sortedRecords.length === 0) return [];

    // Identificar todas as semanas únicas e pegar as últimas 12
    const weeks = Array.from(new Set(sortedRecords.map(r => getWeekStart(r.date)))).sort();
    const recentWeeks = weeks.slice(-12);

    if (recentWeeks.length === 0) return [];

    // Calcular contagem ACUMULADA até cada semana para determinar o ranking
    const dataPoints: Record<string, any>[] = [];

    // Lista de publicadores que queremos rastrear (Top 5 atuais para não poluir o gráfico)
    // Quem são os Top 5 HOJE?
    const totalCounts = new Map<string, number>();
    sortedRecords.forEach(r => {
        const name = r.resolvedPublisherName || '';
        if (name) {
            totalCounts.set(name, (totalCounts.get(name) || 0) + 1);
        }
    });
    const topNames = Array.from(totalCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => e[0]);

    // Para cada semana, calcular o ranking acumulado até aquele momento
    recentWeeks.forEach(week => {
        // Filtrar registros ATÉ esta semana (inclusive)
        const recordsUntilWeek = sortedRecords.filter(r => getWeekStart(r.date) <= week);

        // Contar
        const countsUntilNow = new Map<string, number>();
        recordsUntilWeek.forEach(r => {
            const name = r.resolvedPublisherName || '';
            if (name) {
                countsUntilNow.set(name, (countsUntilNow.get(name) || 0) + 1);
            }
        });

        // Rankear TODOS (para saber a posição real)
        const rankedList = Array.from(countsUntilNow.entries())
            .sort((a, b) => b[1] - a[1]) // Maior count primeiro
            .map((e, index) => ({ name: e[0], count: e[1], rank: index + 1 }));

        // Criar datapoint para o gráfico
        const point: Record<string, any> = { name: formatDateDisplay(week) };

        // Preencher rank apenas para os Top Names que estamos rastreando
        topNames.forEach(name => {
            const entry = rankedList.find(r => r.name === name);
            // Se não tiver rank (0 parts), colocar lá embaixo (ex: rank 100)
            point[name] = entry ? entry.rank : null;
        });

        dataPoints.push(point);
    });

    return { data: dataPoints, trackedKeys: topNames };
}

// Helper simples para agrupar por semana (início)
function getWeekStart(dateStr: string): string {
    if (!dateStr) return '0000-00-00';
    return dateStr;
    // Idealmente, converter para o "Domingo" ou "Segunda" da semana.
    // Como os dados já vêm com data da reunião, e geralmente é 1 por semana,
    // podemos usar a própria data ou truncar se tiver múltiplas datas na semana.
    // Para simplificar, vamos assumir que a data string serve de identificador se ordenado.
    // Mas para Bump Chart real de semanas, seria melhor agrupar.
    // V2: Agrupar por YYYY-WW se necessário. Por enquanto usa data direta.
}

function formatDateDisplay(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
}
