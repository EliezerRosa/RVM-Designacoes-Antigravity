import { getAiProxyUrl } from '../lib/ai/clientProxy';
import { supabase } from '../lib/supabase';
import type { WorkbookPart } from '../types';

export interface AgentGenerationStatus {
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
}

const SYSTEM_PROMPT = `
Você é o Agente Especialista de Critérios para a Reunião Vida e Ministério ("Casting Director").
Sua missão é ler as partes da reunião de uma semana e gerar regras semânticas determinísticas (Pesos Dinâmicos e Perfis Sintéticos).
Você NÃO precisa se preocupar com fadiga ou frequência, seu foco é 100% no "Curriculo" e "Perfil" ideal para a parte.

EXEMPLO 1: Parte sobre defender a fé na escola.
Regra Ideal: perfil_sintetico: jovem_promissor (MANDATÓRIO), afinidade: "Discurso" (DESEJAVEL).
Sugestão: "A parte envolve ambiente escolar, ideal para um jovem dar o exemplo."

EXEMPLO 2: Parte de demonstração sobre iniciar conversa com o cônjuge descrente.
Regra Ideal: perfil_familiar: casais, perfil_sintetico: conselheiro_experiente (MANDATÓRIO), afinidade: "Iniciando Conversas" (MANDATÓRIO).

Para a parte de 'Presidente da Reunião', analise a TEMÁTICA GERAL da reunião (se fornecida) e defina um perfil_sintetico e foco alinhados ao tema.

Seja conservador: partes genéricas (como Leitura da Bíblia) não precisam de regras complexas, a menos que o tema exija.
Para campos que não se aplicam, retorne 'nenhum'.
`;

const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        regras: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    part_id: { type: 'string' },
                    titulo_parte: { type: 'string' },
                    perfil_sintetico: {
                        type: 'object',
                        properties: {
                            tipo: { type: 'string', enum: ['conselheiro_experiente', 'jovem_promissor', 'apologista_maduro', 'mentoria_feminina', 'familia_base', 'jovem_treinamento', 'nenhum'] },
                            peso: { type: 'string', enum: ['MANDATORIO', 'DESEJAVEL'] }
                        }
                    },
                    afinidade_tipo_parte: {
                        type: 'object',
                        properties: {
                            tipo: { type: 'string' },
                            peso: { type: 'string', enum: ['MANDATORIO', 'DESEJAVEL'] }
                        }
                    },
                    demografia_alvo: { type: 'string', enum: ['crianca', 'jovem', 'adulto', 'idoso', 'nenhum'] },
                    genero_alvo: { type: 'string', enum: ['masculino', 'feminino', 'nenhum'] },
                    foco_treinamento: { type: 'string', enum: ['batizado', 'nao_batizado', 'nenhum'] },
                    perfil_familiar: { type: 'string', enum: ['pai_ou_mae', 'casais', 'nenhum'] },
                    boost_tags: { type: 'array', items: { type: 'string' } },
                    sugestao: { type: 'string' },
                    texto_original: { type: 'string' }
                },
                required: ["part_id", "titulo_parte", "sugestao"]
            }
        }
    },
    required: ["regras"]
};

export async function generateSemanticRulesForWeek(weekId: string, parts: WorkbookPart[]): Promise<string> {
    const proxyUrl = getAiProxyUrl();

    // Extrair "Tema da Reunião" baseado nas partes chaves
    const bibleReading = parts.find(p => p.modalidade === 'Leitura de Estudante');
    const firstTreasures = parts.find(p => p.section === 'Tesouros da Palavra de Deus' && p.modalidade === 'Discurso de Ensino');
    const firstLife = parts.find(p => p.section === 'Nossa Vida Cristã' && p.modalidade === 'Discurso de Ensino');
    
    let meetingThemeContext = '';
    if (bibleReading) meetingThemeContext += `Leitura da Bíblia: ${bibleReading.tituloParte}. `;
    if (firstTreasures) meetingThemeContext += `Tesouros: ${firstTreasures.tituloParte}. `;
    if (firstLife) meetingThemeContext += `Vida Cristã: ${firstLife.tituloParte}.`;

    // Filtra cânticos e orações da análise para poupar tokens
    const weekParts = parts.filter(p => 
        p.weekId === weekId && 
        !p.modalidade.toLowerCase().includes('oração') && 
        !p.modalidade.toLowerCase().includes('cântico')
    );
    
    let partsTextContext = `Semana: ${weekId}\n\n`;
    if (meetingThemeContext) {
        partsTextContext += `TEMÁTICA GERAL DA REUNIÃO: ${meetingThemeContext}\n\n`;
    }

    weekParts.forEach(part => {
        partsTextContext += `[PART_ID: ${part.id}]\n`;
        partsTextContext += `TÍTULO: ${part.tituloParte}\n`;
        partsTextContext += `TEXTO: ${part.descricaoParte || ''} ${part.detalhesParte || ''}\n\n`;
    });

    const payload = {
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: `Aqui estão as partes da semana. Analise e retorne estritamente o JSON seguindo o schema.\n\n${partsTextContext}` }]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1 // Força determinismo
        }
    };

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Erro na API Gemini: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        let rawResult = '{}';
        if (data && data.candidates && data.candidates.length > 0) {
            const parts = data.candidates[0].content?.parts || [];
            rawResult = parts.map((p: any) => p.text).join('');
        }
        
        // Remove blocos de markdown que a IA pode retornar (ex: ```json ... ```)
        let cleanedResult = rawResult.trim();
        if (cleanedResult.startsWith('```json')) {
            cleanedResult = cleanedResult.substring(7);
        } else if (cleanedResult.startsWith('```')) {
            cleanedResult = cleanedResult.substring(3);
        }
        if (cleanedResult.endsWith('```')) {
            cleanedResult = cleanedResult.substring(0, cleanedResult.length - 3);
        }
        cleanedResult = cleanedResult.trim();
        
        const parsedAi = JSON.parse(cleanedResult);
        const weekKey = `semana_${weekId}`;
        const dict: any = { [weekKey]: {} };
        
        if (parsedAi.regras && Array.isArray(parsedAi.regras)) {
            for (const rule of parsedAi.regras) {
                const { titulo_parte, part_id, ...ruleData } = rule;
                
                // Limpar campos "nenhum" para manter a estrutura limpa
                for (const key of Object.keys(ruleData)) {
                    const val = ruleData[key];
                    if (val === 'nenhum' || val?.tipo === 'nenhum') {
                        delete ruleData[key];
                    }
                }
                
                // Gravar usando part_id como chave principal (fallback para titulo para retrocompatibilidade temporária se faltar id)
                const key = part_id || titulo_parte;
                if (key) {
                    dict[weekKey][key] = ruleData;
                }
            }
        }

        return JSON.stringify(dict, null, 2);
    } catch (err) {
        console.error('[semanticAgentService] Falha ao gerar regras:', err);
        throw err;
    }
}

export async function saveSemanticRulesToDb(weekId: string, yamlContent: string): Promise<void> {
    const { error } = await supabase
        .from('semantic_rules')
        .upsert(
            { 
                week_id: weekId, 
                rule_yaml: yamlContent 
            }, 
            { onConflict: 'week_id' }
        );

    if (error) {
        throw new Error(`Erro ao salvar no banco: ${error.message}`);
    }
}
