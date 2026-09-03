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
Você NÃO precisa se preocupar com fadiga ou frequência, seu foco é 100% no "Currículo" e "Perfil" ideal para a parte.

PERFIS TÍPICOS OFICIAIS (Escolha estritamente entre estes):
1. 'mentoria_feminina': Para demonstrações entre irmãs envolvendo aconselhamento, namoro, criação de filhos ou auxílio mútuo feminino.
2. 'consolador_empatico': Para considerações ou demonstrações sobre luto, doença, perda de cônjuge ou desânimo.
3. 'iniciador_conversas': Para demonstrações de primeiro contato, de casa em casa ou testemunho informal.
4. 'cultivador_discipulador': Para revisitas, início de estudos bíblicos (lff) ou explicações didáticas.
5. 'defensor_da_fe': Para discursos ou demonstrações sobre temas polêmicos ou neutralidade cristã.
6. 'familia_base': Para partes com temática de casamento, pais e filhos ou família.
7. 'jovem_promissor': Para partes em ambiente escolar, colegas ou desafios da juventude.
8. 'jovem_treinamento': Para estudantes iniciantes ou não batizados em treinamento.
9. 'leitor_qualificado': Para Leitura da Bíblia (Tesouros) ou Leitura do EBC.
10. 'pastor_instrutor': Para Discursos de 10 min (Tesouros) ou 15 min (Vida Cristã).
11. 'dirigente_pastoral': Para condução do Estudo Bíblico de Congregação (EBC).
12. 'organizador_pratico': Para necessidades locais organizacionais ou planejamento.
13. 'pesquisador_entusiasta': Para joias espirituais e pesquisa bíblica.
14. 'conselheiro_experiente': Para anciãos experientes com longa trajetória.
15. 'apologista_maduro': Para defesa de crenças fundamentais.
16. 'nenhum': Quando a parte for genérica e não exigir perfil específico.

REGRA DE OURO: Você OBRIGATORIAMENTE deve retornar um objeto de regra dentro do array 'regras' para CADA UMA das partes que receber no prompt. NENHUMA parte pode ficar de fora do JSON.
Se uma parte for muito genérica (ex: Leitura da Bíblia) e não exigir restrições complexas, preencha os campos de perfil com 'nenhum', mas SEMPRE forneça uma 'sugestao' clara.
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
                            tipo: { 
                                type: 'string', 
                                enum: [
                                    'mentoria_feminina',
                                    'consolador_empatico',
                                    'iniciador_conversas',
                                    'cultivador_discipulador',
                                    'defensor_da_fe',
                                    'familia_base',
                                    'jovem_promissor',
                                    'jovem_treinamento',
                                    'leitor_qualificado',
                                    'pastor_instrutor',
                                    'dirigente_pastoral',
                                    'organizador_pratico',
                                    'pesquisador_entusiasta',
                                    'conselheiro_experiente',
                                    'apologista_maduro',
                                    'nenhum'
                                ] 
                            },
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

    console.log(`[SemanticAgent] weekId=${weekId}, totalParts=${parts.length}, filteredParts=${weekParts.length}`);
    if (weekParts.length === 0) {
        throw new Error(`Nenhuma parte filtrável para a semana ${weekId}. Verifique se a apostila foi importada.`);
    }
    
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
        },
        thinking_level: 'LOW' // Força Gemini Flash (único que suporta responseSchema)
    };

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        const modelUsed = response.headers.get('X-RVM-Model-Used') || 'unknown';
        console.log(`[SemanticAgent] Proxy respondeu: status=${response.status}, model=${modelUsed}`);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[SemanticAgent] Erro do proxy:`, errorBody.substring(0, 300));
            throw new Error(`Erro na API: ${response.status} (${modelUsed}) ${errorBody.substring(0, 100)}`);
        }

        const data = await response.json();
        
        let rawResult = '{}';
        if (data && data.candidates && data.candidates.length > 0) {
            const parts = data.candidates[0].content?.parts || [];
            rawResult = parts.map((p: any) => p.text).join('');
        }
        console.log(`[SemanticAgent] rawResult.length=${rawResult.length}, preview=${rawResult.substring(0, 120)}`);
        
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

        // ETAPA 2: Validar que a IA retornou regras válidas antes de salvar lixo no banco
        if (!parsedAi.regras || !Array.isArray(parsedAi.regras) || parsedAi.regras.length === 0) {
            console.error('[SemanticAgent] IA retornou JSON sem regras válidas:', cleanedResult.substring(0, 200));
            throw new Error(`IA retornou 0 regras (modelo=${modelUsed}). Resposta pode ser de provider não-Gemini sem suporte a responseSchema. Tente novamente.`);
        }
        console.log(`[SemanticAgent] IA retornou ${parsedAi.regras.length} regras (modelo=${modelUsed})`);

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
                
                // Tratar caso a IA retorne a string bruta "[PART_ID: 12345]" em vez de apenas "12345"
                let cleanPartId = part_id;
                if (typeof cleanPartId === 'string' && cleanPartId.includes('[PART_ID:')) {
                    cleanPartId = cleanPartId.replace(/\[PART_ID:\s*/i, '').replace(/\]/g, '').trim();
                }
                
                // Gravar usando part_id como chave principal (fallback para titulo para retrocompatibilidade temporária se faltar id)
                const key = cleanPartId || titulo_parte;
                if (key) {
                    dict[weekKey][key] = ruleData;
                }
            }
        }

        const rulesCount = Object.keys(dict[weekKey]).length;
        console.log(`[SemanticAgent] Dict final: ${rulesCount} regras mapeadas para semana ${weekId}`);
        if (rulesCount === 0) {
            throw new Error(`Nenhuma regra foi mapeada após processar ${parsedAi.regras.length} itens da IA. Verifique part_id.`);
        }

        return JSON.stringify(dict, null, 2);
    } catch (err) {
        console.error('[semanticAgentService] Falha ao gerar regras:', err);
        throw err;
    }
}

export async function saveSemanticRulesToDb(weekId: string, yamlContent: string): Promise<void> {
    console.log(`[SemanticAgent] Salvando regras no Supabase para weekId=${weekId} (${yamlContent.length} bytes)`);
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
        console.error(`[SemanticAgent] Erro ao salvar no Supabase:`, error);
        throw new Error(`Erro ao salvar no banco: ${error.message}`);
    }
    console.log(`[SemanticAgent] Regras salvas com sucesso para ${weekId}`);
}
