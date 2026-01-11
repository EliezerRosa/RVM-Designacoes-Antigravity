/**
 * Auto-Tuning Service - RVM Designações v8.2
 * 
 * Sistema desacoplado para:
 * - Coletar estatísticas de designações
 * - Detectar distorções do algoritmo
 * - Propor ajustes automáticos de parâmetros
 * - Executar bimestralmente (8 semanas) ou manualmente
 */

import { supabase } from '../lib/supabase';
import type {
    AnalysisPeriod,
    TuningMetrics,
    TuningRecommendation,
    TuningConfig,
    WorkbookPart,
    Publisher
} from '../types';
import { DEFAULT_TUNING_CONFIG } from '../types';

// ===== Constantes de Limites Ideais =====

const IDEAL_LIMITS = {
    distributionStdDev: 2.0,    // Desvio padrão máximo aceitável
    maxOverload: 3,             // Diferença máxima (max - média)
    idlePublishers: 0,          // Publicadores ociosos (ideal = 0)
    gapViolations: 0,           // Violações de gap (ideal = 0)
};

// ===== Funções de Período =====

/**
 * Calcula período default (último semestre)
 */
export function getDefaultPeriod(): AnalysisPeriod {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];

    // 6 meses atrás
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - 6);

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate,
        isDefault: true,
    };
}

/**
 * Salva período de análise no Supabase
 */
export async function saveAnalysisPeriod(period: AnalysisPeriod): Promise<void> {
    const { error } = await supabase
        .from('settings')
        .upsert({
            key: 'analysis_period',
            value: period,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

    if (error) throw error;
}

/**
 * Carrega período de análise do Supabase
 */
export async function loadAnalysisPeriod(): Promise<AnalysisPeriod> {
    const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'analysis_period')
        .single();

    if (error || !data) {
        return getDefaultPeriod();
    }

    return data.value as AnalysisPeriod;
}

// ===== Funções de Configuração =====

/**
 * Salva configuração de tuning no Supabase
 */
export async function saveTuningConfig(config: TuningConfig): Promise<void> {
    const { error } = await supabase
        .from('settings')
        .upsert({
            key: 'tuning_config',
            value: { ...config, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

    if (error) throw error;
}

/**
 * Carrega configuração de tuning do Supabase
 */
export async function loadTuningConfig(): Promise<TuningConfig> {
    const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'tuning_config')
        .single();

    if (error || !data) {
        return DEFAULT_TUNING_CONFIG;
    }

    return { ...DEFAULT_TUNING_CONFIG, ...(data.value as Partial<TuningConfig>) };
}

// ===== Coleta de Métricas =====

/**
 * Coleta métricas do período especificado
 */
export async function collectMetrics(
    period: AnalysisPeriod,
    publishers: Publisher[]
): Promise<TuningMetrics> {
    // Buscar partes do período
    const { data: parts, error } = await supabase
        .from('workbook_parts')
        .select('*')
        .gte('date', period.startDate)
        .lte('date', period.endDate)
        .in('status', ['DESIGNADA', 'CONCLUIDA', 'APROVADA'])
        .range(0, 9999);

    if (error) throw error;

    const workbookParts = (parts || []) as WorkbookPart[];
    const activePublishers = publishers.filter(p => p.isServing && !p.isNotQualified);

    // Contar participações por publicador
    const participationCount: Record<string, number> = {};
    activePublishers.forEach(p => { participationCount[p.name] = 0; });

    workbookParts.forEach(part => {
        const name = part.resolvedPublisherName || part.rawPublisherName;
        if (name && participationCount[name] !== undefined) {
            participationCount[name]++;
        }
    });

    const counts = Object.values(participationCount);
    const total = counts.reduce((a, b) => a + b, 0);
    const avg = counts.length > 0 ? total / counts.length : 0;

    // Calcular desvio padrão
    const variance = counts.length > 0
        ? counts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / counts.length
        : 0;
    const stdDev = Math.sqrt(variance);

    // Calcular sobrecarga
    const maxCount = Math.max(...counts, 0);
    const maxOverload = maxCount - avg;

    // Contar publicadores ociosos (0 participações no período)
    const idlePublishers = counts.filter(c => c === 0).length;

    // Contar violações de gap (partes na mesma semana para mesmo publicador)
    const gapViolations = countGapViolations(workbookParts);

    return {
        period,
        totalParticipations: total,
        activePublishers: activePublishers.length,
        avgParticipationsPerPublisher: Math.round(avg * 10) / 10,
        distributionStdDev: Math.round(stdDev * 100) / 100,
        maxOverload: Math.round(maxOverload * 10) / 10,
        idlePublishers,
        gapViolations,
        collectedAt: new Date().toISOString(),
    };
}

/**
 * Conta violações de gap (mais de 1 parte por semana por publicador)
 */
function countGapViolations(parts: WorkbookPart[]): number {
    const byWeekAndPublisher = new Map<string, number>();

    parts.forEach(part => {
        const name = part.resolvedPublisherName || part.rawPublisherName;
        if (!name) return;

        const key = `${part.weekId}:${name}`;
        byWeekAndPublisher.set(key, (byWeekAndPublisher.get(key) || 0) + 1);
    });

    // Contar quantos têm mais de 1 parte na mesma semana
    return Array.from(byWeekAndPublisher.values()).filter(count => count > 1).length;
}

// ===== Análise e Recomendações =====

/**
 * Analisa métricas e gera recomendações de ajuste
 */
export function analyzeAndRecommend(
    metrics: TuningMetrics,
    currentConfig: TuningConfig
): TuningRecommendation[] {
    const recommendations: TuningRecommendation[] = [];

    // 1. Distribuição desigual → Aumentar WEEKS_FACTOR
    if (metrics.distributionStdDev > IDEAL_LIMITS.distributionStdDev) {
        const proposedValue = Math.min(currentConfig.weeksFactor + 10, 100);
        if (proposedValue !== currentConfig.weeksFactor) {
            recommendations.push({
                parameter: 'weeksFactor',
                currentValue: currentConfig.weeksFactor,
                proposedValue,
                reason: `Distribuição desigual (σ=${metrics.distributionStdDev.toFixed(2)}). Aumentar peso do tempo.`,
                impact: 'medium',
            });
        }
    }

    // 2. Muitos ociosos → Aumentar BIMONTHLY_BONUS
    if (metrics.idlePublishers > 0) {
        const proposedValue = Math.min(currentConfig.bimonthlyBonus + 200, 2000);
        if (proposedValue !== currentConfig.bimonthlyBonus) {
            recommendations.push({
                parameter: 'bimonthlyBonus',
                currentValue: currentConfig.bimonthlyBonus,
                proposedValue,
                reason: `${metrics.idlePublishers} publicador(es) sem participação. Aumentar bônus bimestral.`,
                impact: 'high',
            });
        }
    }

    // 3. Sobrecarga alta → Aumentar WEIGHT_FACTOR
    if (metrics.maxOverload > IDEAL_LIMITS.maxOverload) {
        const proposedValue = Math.min(currentConfig.weightFactor + 1, 10);
        if (proposedValue !== currentConfig.weightFactor) {
            recommendations.push({
                parameter: 'weightFactor',
                currentValue: currentConfig.weightFactor,
                proposedValue,
                reason: `Sobrecarga de ${metrics.maxOverload.toFixed(1)} partes acima da média. Penalizar mais a carga.`,
                impact: 'medium',
            });
        }
    }

    // 4. Violações de gap → Aumentar COOLDOWN_WEEKS
    if (metrics.gapViolations > IDEAL_LIMITS.gapViolations) {
        const proposedValue = Math.min(currentConfig.cooldownWeeks + 1, 6);
        if (proposedValue !== currentConfig.cooldownWeeks) {
            recommendations.push({
                parameter: 'cooldownWeeks',
                currentValue: currentConfig.cooldownWeeks,
                proposedValue,
                reason: `${metrics.gapViolations} violações de gap. Aumentar cooldown.`,
                impact: 'low',
            });
        }
    }

    return recommendations;
}

// ===== Aplicação de Recomendações =====

/**
 * Aplica recomendações ao config e salva
 */
export async function applyRecommendations(
    recommendations: TuningRecommendation[],
    currentConfig: TuningConfig
): Promise<TuningConfig> {
    const newConfig = { ...currentConfig };

    recommendations.forEach(rec => {
        switch (rec.parameter) {
            case 'weeksFactor':
                newConfig.weeksFactor = rec.proposedValue;
                break;
            case 'weightFactor':
                newConfig.weightFactor = rec.proposedValue;
                break;
            case 'bimonthlyBonus':
                newConfig.bimonthlyBonus = rec.proposedValue;
                break;
            case 'cooldownWeeks':
                newConfig.cooldownWeeks = rec.proposedValue;
                break;
            case 'bimonthlyThreshold':
                newConfig.bimonthlyThreshold = rec.proposedValue;
                break;
        }
    });

    newConfig.lastAutoRunAt = new Date().toISOString();
    newConfig.updatedAt = new Date().toISOString();

    await saveTuningConfig(newConfig);

    return newConfig;
}

// ===== Execução Completa =====

/**
 * Executa ciclo completo de auto-tuning
 * @returns Métricas, recomendações e novo config
 */
export async function runAutoTuning(
    publishers: Publisher[],
    period?: AnalysisPeriod
): Promise<{
    metrics: TuningMetrics;
    recommendations: TuningRecommendation[];
    newConfig: TuningConfig;
}> {
    // 1. Carregar período (ou usar default)
    const analysisPeriod = period || await loadAnalysisPeriod();

    // 2. Carregar config atual
    const currentConfig = await loadTuningConfig();

    // 3. Coletar métricas
    const metrics = await collectMetrics(analysisPeriod, publishers);

    // 4. Analisar e gerar recomendações
    const recommendations = analyzeAndRecommend(metrics, currentConfig);

    // 5. Aplicar recomendações (se houver)
    let newConfig = currentConfig;
    if (recommendations.length > 0) {
        newConfig = await applyRecommendations(recommendations, currentConfig);
    } else {
        // Apenas atualizar lastAutoRunAt
        newConfig = { ...currentConfig, lastAutoRunAt: new Date().toISOString() };
        await saveTuningConfig(newConfig);
    }

    return { metrics, recommendations, newConfig };
}

/**
 * Verifica se é hora de executar auto-tuning
 */
export async function shouldRunAutoTuning(): Promise<boolean> {
    const config = await loadTuningConfig();

    if (!config.autoRunEnabled) return false;
    if (!config.lastAutoRunAt) return true;

    const lastRun = new Date(config.lastAutoRunAt);
    const now = new Date();
    const weeksSinceLastRun = Math.floor(
        (now.getTime() - lastRun.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    return weeksSinceLastRun >= config.autoRunIntervalWeeks;
}
