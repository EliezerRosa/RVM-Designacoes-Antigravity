import yaml from 'yaml';
import type { Publisher } from '../types';
import { supabase } from '../lib/supabase';
import type { PublisherStats } from './participationAnalyticsService';

export interface SemanticRule {
    perfil_sintetico?: string;
    afinidade_tipo_parte?: string;
    demografia_alvo?: string;
    genero_alvo?: string;
    foco_treinamento?: string;
    perfil_familiar?: string;
    emocional?: string;
    objeção?: string;
    criterio_exato?: string;
    foco?: string;
    boost_tags?: string[];
    sugestao: string;
    texto_original?: string;
}

export interface SemanticRulesDict {
    [weekId: string]: {
        [partTitle: string]: SemanticRule;
    };
}

let cachedRules: SemanticRulesDict | null = null;

/**
 * Faz o fetch das regras semânticas do banco de dados (tabela semantic_rules)
 */
export async function fetchSemanticRulesForWeek(weekId: string): Promise<SemanticRulesDict> {
    try {
        const { data, error } = await supabase
            .from('semantic_rules')
            .select('rule_yaml')
            .eq('week_id', weekId)
            .single();

        if (error || !data) {
            // Fallback para o arquivo estático se não existir no banco
            return fetchFallbackRules();
        }

        const parsed = yaml.parse(data.rule_yaml) as SemanticRulesDict;
        return parsed;
    } catch (err) {
        console.error('[SemanticRules] Erro ao carregar regras DB:', err);
        return {};
    }
}

async function fetchFallbackRules(): Promise<SemanticRulesDict> {
    if (cachedRules) return cachedRules;

    try {
        const response = await fetch('/semantic-rules/2026.yml');
        if (!response.ok) return {};
        
        const text = await response.text();
        const parsed = yaml.parse(text) as SemanticRulesDict;
        cachedRules = parsed;
        return parsed;
    } catch (err) {
        return {};
    }
}

/**
 * Retorna as regras específicas para uma semana e uma parte (baseada no título ou ID)
 */
export async function getRuleForPart(weekId: string, partTitle: string): Promise<SemanticRule | null> {
    const rules = await fetchSemanticRulesForWeek(weekId);
    
    // Normalizar weekId para encontrar no formato "semana_YYYY-MM-DD"
    const weekKey = `semana_${weekId}`;
    const weekRules = rules[weekKey];
    
    if (!weekRules) return null;

    // Buscar a regra pelo título da parte
    // Como os títulos podem variar sutilmente, fazemos uma busca parcial
    for (const [key, rule] of Object.entries(weekRules)) {
        if (partTitle.includes(key) || key.includes(partTitle)) {
            return rule;
        }
    }

    return null;
}

export interface SemanticScoreResult {
    score: number;
    matches: string[];
    misses: string[];
    isPerfectMatch: boolean;
}

/**
 * Função inteligente de Score: Avalia o perfil de um publicador contra a regra semântica.
 * O Curador usa os `matches` e `misses` para auditar a indicação.
 */
export function calculateSemanticScore(
    publisher: Publisher, 
    rule: SemanticRule, 
    allPublishers?: Publisher[],
    affinityMap?: Record<string, PublisherStats>
): SemanticScoreResult {
    let score = 0;
    const matches: string[] = [];
    const misses: string[] = [];
    let hasRules = false;
    
    const ageGroup = (publisher.ageGroup || '').toLowerCase();
    const gender = (publisher.gender || '').toLowerCase();
    const condition = (publisher.condition || '').toLowerCase();
    const isElder = condition === 'ancião' || condition === 'anciao';
    const isMS = condition === 'servo ministerial' || condition === 'servo';
    const isPioneer = publisher.funcao?.toLowerCase().includes('pioneiro regular');
    const isBaptized = publisher.isBaptized !== false; // assume true if undefined

    // 0. Perfil Sintético (Cruzamentos Inteligentes)
    if (rule.perfil_sintetico) {
        hasRules = true;
        const perfil = rule.perfil_sintetico.toLowerCase();
        
        if (perfil === 'conselheiro_experiente') {
            if (ageGroup === 'idoso' && isElder) {
                score += 75;
                matches.push('Conselheiro Experiente');
            } else {
                misses.push('Falta: Conselheiro Experiente (Idoso+Ancião)');
            }
        } else if (perfil === 'jovem_promissor') {
            if (ageGroup === 'jovem' && isBaptized && !isElder) {
                score += 75;
                matches.push('Jovem Promissor');
            } else {
                misses.push('Falta: Jovem Promissor (Jovem Batizado não Ancião)');
            }
        } else if (perfil === 'apologista_maduro') {
            if (gender === 'masculino' && (isElder || isMS || isPioneer)) {
                score += 75;
                matches.push('Apologista Maduro');
            } else {
                misses.push('Falta: Apologista Maduro (Irmão Experiente)');
            }
        } else if (perfil === 'mentoria_feminina') {
            if (gender === 'feminino' && (isPioneer || ageGroup === 'idoso' || ageGroup === 'adulto')) {
                score += 75;
                matches.push('Mentoria Feminina');
            } else {
                misses.push('Falta: Mentoria Feminina (Irmã Experiente)');
            }
        } else if (perfil === 'familia_base') {
            const hasSpouse = !!publisher.spouseId;
            const hasChildren = allPublishers ? allPublishers.some(p => p.parentIds && p.parentIds.includes(publisher.id)) : false;
            if (hasSpouse && hasChildren) {
                score += 75;
                matches.push('Família Base');
            } else {
                misses.push('Falta: Família (Casado com filhos)');
            }
        } else if (perfil === 'jovem_treinamento') {
            if ((ageGroup === 'jovem' || ageGroup === 'crianca') && !isBaptized) {
                score += 50;
                matches.push('Jovem em Treinamento');
            } else {
                misses.push('Falta: Jovem/Criança Não Batizado');
            }
        }
    }

    // 0.5 Afinidade Histórica (O "Currículo")
    if (rule.afinidade_tipo_parte && affinityMap) {
        hasRules = true;
        const stats = affinityMap[publisher.name];
        if (stats && stats.byTipoParte) {
            // Check if they have history in this specific part type
            // rule.afinidade_tipo_parte might be "Discurso", "Iniciando conversas", etc.
            const targetType = rule.afinidade_tipo_parte.toLowerCase();
            let affinityCount = 0;
            
            for (const [tipo, count] of Object.entries(stats.byTipoParte)) {
                if (tipo.toLowerCase().includes(targetType) || targetType.includes(tipo.toLowerCase())) {
                    affinityCount += count;
                }
            }

            if (affinityCount > 0) {
                const bonus = affinityCount * 10;
                score += bonus;
                matches.push(`Afinidade Histórica: ${affinityCount}x ${rule.afinidade_tipo_parte} (+${bonus})`);
            } else {
                misses.push(`Falta: Sem histórico recente de ${rule.afinidade_tipo_parte}`);
            }
        }
    }

    // 1. Demografia
    if (rule.demografia_alvo) {
        hasRules = true;
        const target = rule.demografia_alvo.toLowerCase();
        
        if (target.includes('jovem') && ageGroup === 'jovem') {
            score += 50; matches.push('Jovem');
        } else if (target.includes('idoso') && ageGroup === 'idoso') {
            score += 50; matches.push('Idoso');
        } else if (target.includes('crianca') && ageGroup === 'crianca') {
            score += 50; matches.push('Criança');
        } else if (target.includes('adulto') && ageGroup === 'adulto') {
            score += 50; matches.push('Adulto');
        } else {
            misses.push(`Falta: Perfil ${rule.demografia_alvo}`);
        }
    }

    // 1.5 Gênero e Foco de Treinamento
    if (rule.genero_alvo) {
        hasRules = true;
        if (gender === rule.genero_alvo.toLowerCase()) {
            score += 30; matches.push(`Gênero: ${rule.genero_alvo}`);
        } else {
            misses.push(`Falta: Gênero ${rule.genero_alvo}`);
        }
    }

    if (rule.foco_treinamento) {
        hasRules = true;
        if (rule.foco_treinamento === 'batizado' && isBaptized) {
            score += 30; matches.push('Batizado');
        } else if (rule.foco_treinamento === 'nao_batizado' && !isBaptized) {
            score += 30; matches.push('Não Batizado');
        } else {
            misses.push(`Falta: ${rule.foco_treinamento}`);
        }
    }

    // 2. Perfil Familiar (Legado)
    if (rule.perfil_familiar === 'pai_ou_mae' || rule.perfil_familiar === 'casais') {
        hasRules = true;
        
        const hasSpouse = !!publisher.spouseId;
        const hasChildren = allPublishers ? allPublishers.some(p => p.parentIds && p.parentIds.includes(publisher.id)) : false;
        
        if (rule.perfil_familiar === 'pai_ou_mae') {
            if (hasChildren) {
                score += 50;
                matches.push('Pai/Mãe');
            } else {
                misses.push('Falta: Perfil Pai/Mãe (Filhos)');
            }
        } else if (rule.perfil_familiar === 'casais') {
            if (hasSpouse) {
                score += 50;
                matches.push('Casal');
            } else {
                misses.push('Falta: Cônjuge vinculado');
            }
        }
    }

    // 3. Fallbacks (Boost Tags e Critérios exatos)
    if (rule.boost_tags && rule.boost_tags.length > 0) {
        hasRules = true;
        let tagsMatched = 0;
        for (const tag of rule.boost_tags) {
            const t = tag.toLowerCase();
            if (t.includes('ancião') && isElder) {
                score += 40; matches.push('Tag: Ancião'); tagsMatched++;
            }
            else if (t.includes('pioneiro') && isPioneer) {
                score += 30; matches.push('Tag: Pioneiro'); tagsMatched++;
            }
            else if (t.includes('maduro') && (isElder || isMS || isPioneer)) {
                score += 30; matches.push('Tag: Maduro'); tagsMatched++;
            }
            else if (t.includes('experiente') && (isElder || isMS || isPioneer)) {
                score += 30; matches.push('Tag: Experiente'); tagsMatched++;
            }
            else if (t.includes('jovem') && ageGroup === 'jovem') {
                score += 30; matches.push('Tag: Jovem'); tagsMatched++;
            }
        }
        if (tagsMatched === 0) {
            misses.push(`Falta tags: ${rule.boost_tags.join(', ')}`);
        }
    }

    if (rule.criterio_exato) {
        hasRules = true;
        const val = rule.criterio_exato.toLowerCase();
        if (val === 'ancião' || val === 'anciao') {
            const isElder = publisher.condition === 'Ancião' || publisher.condition === 'Anciao';
            if (isElder) {
                score += 100;
                matches.push('Ancião (Exato)');
            } else {
                misses.push('Critério FALHOU: Exige Ancião');
                // Se é exato e falhou, score despenca
                score -= 1000; 
            }
        }
    }

    const isPerfectMatch = hasRules && misses.length === 0;

    return { score, matches, misses, isPerfectMatch };
}

/** 
 * Helper para extrair campos dinâmicos/meta do publicador.
 * (Como o app usa um type flexível para Publisher, alguns campos podem estar em metadata ou direto no objeto)
 */
function getPublisherField(publisher: any, field: string): any {
    if (field === 'age_group') return publisher.ageGroup;
    if (field === 'has_children') return !!publisher.spouseId;
    if (publisher.metadata && publisher.metadata[field] !== undefined) return publisher.metadata[field];
    return publisher[field];
}
