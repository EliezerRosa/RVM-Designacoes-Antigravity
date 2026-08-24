import yaml from 'yaml';
import type { Publisher } from '../types';
import { supabase } from '../lib/supabase';

export interface SemanticRule {
    demografia_alvo?: string;
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
export function calculateSemanticScore(publisher: Publisher, rule: SemanticRule, allPublishers?: Publisher[]): SemanticScoreResult {
    let score = 0;
    const matches: string[] = [];
    const misses: string[] = [];
    let hasRules = false;
    
    // 1. Demografia (Jovens vs Idosos)
    const ageGroup = (publisher.ageGroup || '').toLowerCase();
    
    if (rule.demografia_alvo === 'jovens' || rule.demografia_alvo === 'jovem') {
        hasRules = true;
        if (ageGroup === 'jovem') {
            score += 50;
            matches.push('Jovem');
        } else {
            misses.push('Falta: Perfil Jovem');
        }
    }
    
    if (rule.demografia_alvo === 'idosos' || rule.demografia_alvo === 'idoso') {
        hasRules = true;
        if (ageGroup === 'idoso') {
            score += 50;
            matches.push('Idoso');
        } else {
            misses.push('Falta: Perfil Idoso');
        }
    }

    // 2. Perfil Familiar
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

    // 3. Critério Exato e Boost Tags
    if (rule.boost_tags && rule.boost_tags.length > 0) {
        hasRules = true;
        const isElder = publisher.condition === 'Ancião' || publisher.condition === 'Anciao';
        const isMS = publisher.condition === 'Servo Ministerial' || publisher.condition === 'Servo ministerial';
        const isPioneer = publisher.modalidade?.toLowerCase().includes('pioneiro regular');
        const isMature = isElder || isMS || isPioneer;
        
        let tagsMatched = 0;
        if (rule.boost_tags.includes('ancião') && isElder) { score += 40; matches.push('Ancião'); tagsMatched++; }
        if (rule.boost_tags.includes('experiente') && isMature) { score += 30; matches.push('Experiente'); tagsMatched++; }
        if (rule.boost_tags.includes('maduro') && isMature) { score += 30; matches.push('Maduro'); tagsMatched++; }
        if (rule.boost_tags.includes('pioneiro') && isPioneer) { score += 30; matches.push('Pioneiro'); tagsMatched++; }

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
