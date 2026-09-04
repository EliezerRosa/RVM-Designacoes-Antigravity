import yaml from 'yaml';
import type { Publisher } from '../types';
import { supabase } from '../lib/supabase';
import type { PublisherStats } from './participationAnalyticsService';

export interface DynamicWeight {
    tipo: string;
    peso: 'MANDATORIO' | 'DESEJAVEL';
}

export interface SemanticRule {
    perfil_sintetico?: DynamicWeight | string;
    afinidade_tipo_parte?: DynamicWeight | string;
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

        let parsed: SemanticRulesDict;
        try {
            parsed = JSON.parse(data.rule_yaml);
        } catch {
            try {
                parsed = yaml.parse(data.rule_yaml) as SemanticRulesDict;
            } catch (yamlErr) {
                console.warn('[SemanticRules] Falha no yaml.parse. Tentando sanitizar YAML...', yamlErr);
                try {
                    // Tenta remover linhas problemáticas como texto_original
                    const sanitized = data.rule_yaml
                        .split('\n')
                        .filter(line => !line.trim().startsWith('texto_original:'))
                        .join('\n');
                    parsed = yaml.parse(sanitized) as SemanticRulesDict;
                } catch (sanitizedErr) {
                    console.error('[SemanticRules] YAML corrompido, ativando fallback rules para evitar loop de IA.', sanitizedErr);
                    return fetchFallbackRules();
                }
            }
        }
        return parsed;
    } catch (err) {
        console.error('[SemanticRules] Erro ao carregar regras DB:', err);
        return fetchFallbackRules();
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
 * Retorna as regras específicas para uma semana e uma parte (baseada no ID exato ou título)
 */
export async function getRuleForPart(weekId: string, partTitle: string, partId?: string): Promise<SemanticRule | null> {
    const rules = await fetchSemanticRulesForWeek(weekId);
    
    // Normalizar weekId para encontrar no formato "semana_YYYY-MM-DD"
    const weekKey = `semana_${weekId}`;
    const weekRules = rules[weekKey];
    
    if (!weekRules) return null;

    // 1. Busca pelo ID exato (Formato novo)
    if (partId && weekRules[partId]) {
        return weekRules[partId] as SemanticRule;
    }

    // 2. Busca pelo título da parte (Fallback legado)
    // Como os títulos podem variar sutilmente, fazemos uma busca parcial
    for (const [key, rule] of Object.entries(weekRules)) {
        if (partTitle.includes(key) || key.includes(partTitle)) {
            return rule as SemanticRule;
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

    // 0. Ponto de Partida Determinístico (Item 4 e 5):
    // Se o publicador possui perfis sintéticos atribuídos em sua ficha de cadastro
    if (publisher.syntheticProfiles && publisher.syntheticProfiles.length > 0 && rule.perfil_sintetico) {
        const perfilObj = typeof rule.perfil_sintetico === 'string'
            ? { tipo: rule.perfil_sintetico, peso: 'DESEJAVEL' }
            : rule.perfil_sintetico;
        const targetProfile = perfilObj.tipo.toLowerCase();

        const hasDeterministicMatch = publisher.syntheticProfiles.some(sp => {
            const spLower = sp.toLowerCase();
            return spLower === targetProfile || targetProfile.includes(spLower) || spLower.includes(targetProfile);
        });

        if (hasDeterministicMatch) {
            score += 300; // Ponto de partida prioritário
            matches.unshift('💎 Perfil Atribuído no Cadastro (+300)');
        }
    }

    // 0.1 Perfil Sintético Contextual (Cruzamentos Inteligentes e Flexíveis)
    if (rule.perfil_sintetico) {
        hasRules = true;
        const perfilObj = typeof rule.perfil_sintetico === 'string'
            ? { tipo: rule.perfil_sintetico, peso: 'DESEJAVEL' }
            : rule.perfil_sintetico;
            
        const perfil = perfilObj.tipo.toLowerCase();
        const pts = perfilObj.peso === 'MANDATORIO' ? 1000 : 75;
        
        if (perfil === 'conselheiro_experiente' || perfil === 'conselheiro_reflexivo' || perfil === 'conselheiro_empatico') {
            if (ageGroup === 'idoso' && isElder) {
                score += pts;
                matches.push(`Conselheiro Experiente (+${pts})`);
            } else if (isElder || (ageGroup === 'idoso' && isMS)) {
                score += Math.floor(pts * 0.8);
                matches.push(`Conselheiro Maduro (+${Math.floor(pts * 0.8)})`);
            } else {
                misses.push('Falta: Conselheiro Experiente (Idoso+Ancião)');
            }
        } else if (perfil === 'consolador_empatico' || perfil === 'consolador_experiente') {
            if ((ageGroup === 'idoso' || ageGroup === 'adulto') && (isElder || isPioneer || !!publisher.spouseId)) {
                score += pts;
                matches.push(`Consolador Empático (+${pts})`);
            } else if (ageGroup === 'adulto' || ageGroup === 'idoso') {
                score += Math.floor(pts * 0.7);
                matches.push(`Perfil Maduro/Empático (+${Math.floor(pts * 0.7)})`);
            } else {
                misses.push('Falta: Maturidade/Empatia para Consolo');
            }
        } else if (perfil === 'jovem_promissor') {
            if (ageGroup === 'jovem' && isBaptized && !isElder) {
                score += pts;
                matches.push(`Jovem Promissor (+${pts})`);
            } else {
                misses.push('Falta: Jovem Promissor (Jovem Batizado não Ancião)');
            }
        } else if (perfil === 'jovem_treinamento' || perfil === 'iniciador_conversas' || perfil === 'iniciador_de_conversas' || perfil === 'iniciador_entusiasmado' || perfil === 'iniciador_criativo') {
            if ((ageGroup === 'jovem' || ageGroup === 'crianca') && !isBaptized) {
                score += pts;
                matches.push(`Iniciante em Treinamento (+${pts})`);
            } else if (!isElder || ageGroup === 'jovem' || isPioneer) {
                score += Math.floor(pts * 0.85);
                matches.push(`Iniciador de Conversas (+${Math.floor(pts * 0.85)})`);
            } else {
                score += Math.floor(pts * 0.5);
                matches.push(`Publicador Apto (+${Math.floor(pts * 0.5)})`);
            }
        } else if (perfil === 'cultivador_discipulador' || perfil === 'cultivador_de_interesse' || perfil === 'cultivador_persuasivo' || perfil === 'discipulador_experiente') {
            if (isPioneer || isElder || isMS) {
                score += pts;
                matches.push(`Discipulador Experiente (+${pts})`);
            } else if (isBaptized && ageGroup !== 'crianca') {
                score += Math.floor(pts * 0.75);
                matches.push(`Cultivador de Interesse (+${Math.floor(pts * 0.75)})`);
            } else {
                misses.push('Falta: Experiência em Fazer Discípulos');
            }
        } else if (perfil === 'defensor_da_fe' || perfil === 'defensor_da_neutralidade' || perfil === 'apologista_maduro') {
            if (gender === 'masculino' && (isElder || isMS || isPioneer)) {
                score += pts;
                matches.push(`Defensor da Fé (+${pts})`);
            } else if (isBaptized && ageGroup !== 'crianca') {
                score += Math.floor(pts * 0.75);
                matches.push(`Fé e Firmeza (+${Math.floor(pts * 0.75)})`);
            } else {
                misses.push('Falta: Apologista Maduro / Defensor da Fé');
            }
        } else if (perfil === 'mentoria_feminina' || perfil === 'ajudante_empático' || perfil === 'apoio_persuasivo' || perfil === 'apoio_criativo') {
            if (gender === 'feminino' && (isPioneer || ageGroup === 'idoso' || ageGroup === 'adulto')) {
                score += pts;
                matches.push(`Mentoria Feminina (+${pts})`);
            } else if (gender === 'feminino') {
                score += Math.floor(pts * 0.7);
                matches.push(`Irmã Qualificada (+${Math.floor(pts * 0.7)})`);
            } else {
                misses.push('Falta: Mentoria Feminina (Irmã Experiente)');
            }
        } else if (perfil === 'familia_base') {
            const hasSpouse = !!publisher.spouseId;
            const hasChildren = allPublishers ? allPublishers.some(p => p.parentIds && p.parentIds.includes(publisher.id)) : false;
            if (hasSpouse && hasChildren) {
                score += pts;
                matches.push(`Família Base (+${pts})`);
            } else if (hasSpouse) {
                score += Math.floor(pts * 0.8);
                matches.push(`Casal (+${Math.floor(pts * 0.8)})`);
            } else {
                misses.push('Falta: Família (Casado com filhos)');
            }
        } else if (perfil === 'leitor_qualificado' || perfil === 'leitor_experiente') {
            if (gender === 'masculino' && isBaptized && (publisher.privileges?.canReadCBS || publisher.privileges?.canGiveStudentTalks !== false)) {
                score += pts;
                matches.push(`Leitor Qualificado (+${pts})`);
            } else {
                misses.push('Falta: Privilégio de Leitura Bíblica');
            }
        } else if (perfil === 'pastor_instrutor' || perfil === 'expositor_inspirador' || perfil === 'apresentador_inspirador') {
            if (isElder || (isMS && publisher.privileges?.canGiveTalks)) {
                score += pts;
                matches.push(`Pastor Instrutor (+${pts})`);
            } else {
                misses.push('Falta: Ancião / Servo Instrutor');
            }
        } else if (perfil === 'dirigente_pastoral' || perfil === 'mediador_equilibrado') {
            if (isElder && publisher.privileges?.canConductCBS) {
                score += pts;
                matches.push(`Dirigente Pastoral (+${pts})`);
            } else {
                misses.push('Falta: Ancião Dirigente de EBC');
            }
        } else if (perfil === 'organizador_pratico' || perfil === 'planejador_eficiente' || perfil === 'apoio_organizado' || perfil === 'apoiador_organizacional') {
            if (isMS || isElder || isPioneer || (isBaptized && ageGroup === 'adulto')) {
                score += pts;
                matches.push(`Organizador Prático (+${pts})`);
            } else {
                misses.push('Falta: Perfil Prático Organizacional');
            }
        } else if (perfil === 'pesquisador_entusiasta' || perfil === 'pesquisador_espiritual' || perfil === 'estudioso_da_biblia') {
            if (isBaptized && (isPioneer || isMS || isElder || ageGroup !== 'crianca')) {
                score += pts;
                matches.push(`Pesquisador Espiritual (+${pts})`);
            } else {
                misses.push('Falta: Pesquisador Espiritual');
            }
        } else if (perfil !== 'nenhum' && perfil !== '') {
            const norm = perfil.replace(/_/g, ' ');
            const fallbackPts = Math.max(Math.floor(pts / 2), 25);
            score += fallbackPts;
            matches.push(`Perfil: ${norm} (+${fallbackPts})`);
        }
    }

    // 0.5 Afinidade Histórica (O "Currículo" com Time-Decay)
    if (rule.afinidade_tipo_parte && affinityMap) {
        hasRules = true;
        const stats = affinityMap[publisher.name];
        
        const afinidadeObj = typeof rule.afinidade_tipo_parte === 'string'
            ? { tipo: rule.afinidade_tipo_parte, peso: 'DESEJAVEL' }
            : rule.afinidade_tipo_parte;
            
        const targetType = afinidadeObj.tipo.toLowerCase();
        
        if (stats && stats.recentParticipations) {
            let affinityBonus = 0;
            let matchCount = 0;
            const now = new Date();
            
            for (const part of stats.recentParticipations) {
                if (part.tipoParte.toLowerCase().includes(targetType) || targetType.includes(part.tipoParte.toLowerCase())) {
                    matchCount++;
                    const partDate = new Date(part.date);
                    const monthsAgo = (now.getFullYear() - partDate.getFullYear()) * 12 + (now.getMonth() - partDate.getMonth());
                    
                    if (monthsAgo <= 1) affinityBonus += 15;
                    else if (monthsAgo <= 6) affinityBonus += 5;
                    else affinityBonus += 1;
                }
            }

            if (afinidadeObj.peso === 'MANDATORIO' && matchCount === 0) {
                // Se é mandatório e não tem histórico, derruba a nota
                score -= 500;
                misses.push(`Veto: Sem histórico Mandatório de ${afinidadeObj.tipo}`);
            } else if (matchCount > 0) {
                // Se é mandatório, dá um bônus absurdo caso tenha experiência
                if (afinidadeObj.peso === 'MANDATORIO') {
                    affinityBonus += 500;
                }
                score += affinityBonus;
                matches.push(`Afinidade Histórica: ${matchCount}x ${afinidadeObj.tipo} (+${affinityBonus})`);
            } else {
                misses.push(`Falta: Sem histórico recente de ${afinidadeObj.tipo}`);
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
