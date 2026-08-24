import { getAiProxyUrl } from '../lib/ai/clientProxy';
import { supabase } from '../lib/supabase';
import type { WorkbookPart } from '../types';

export interface AgentGenerationStatus {
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
}

const SYSTEM_PROMPT = `
Você é o Agente Especialista de Critérios para a Reunião Vida e Ministério ("Casting Director").
Sua missão é ler as partes da reunião de uma semana e gerar um YAML com os critérios de busca semânticos, focando na especialidade, perfil familiar e capacidade dos publicadores.

As chaves do YAML devem ser os títulos das partes.
Para cada parte pertinente, retorne APENAS um objeto contendo:
- perfil_sintetico: (Exija um arquétipo cruzado se aplicável. Opções: "conselheiro_experiente", "jovem_promissor", "apologista_maduro", "mentoria_feminina", "familia_base", "jovem_treinamento". Ou omita).
- afinidade_tipo_parte: (O tema/tipo com o qual este cenário mais ressoa, para buscarmos um especialista histórico. Ex: "Iniciando conversas", "Discurso", "Cultivando o interesse". Ou omita).
- demografia_alvo: (ex: "crianca", "jovem", "adulto", "idoso" ou omita)
- genero_alvo: (ex: "masculino", "feminino", ou omita. Só use se a parte for fortemente inclinada a um gênero).
- perfil_familiar: (ex: "pai_ou_mae", "casais", ou omita)
- foco_treinamento: (ex: "batizado", "nao_batizado", ou omita)
- boost_tags: [array de strings genéricas para fallback, ex: "ancião", "empatia"]
- sugestao: "Uma breve frase explicando a escolha do perfil sintético ou demografia com base no texto."
- texto_original: "O trecho da apostila que motivou essa regra."

Regras estritas:
1. Retorne APENAS um bloco YAML válido, sem blocos de código markdown ao redor.
2. Seja MUITO conservador. Se a parte for leitura da Bíblia ou genérica (qualquer um pode fazer), NÃO GERE regra para ela. Gere apenas para partes que claramente se beneficiam de uma demografia ou perfil específico.
3. Use a chave raiz com o formato "semana_YYYY-MM-DD" e dentro dela as partes.
`;

export async function generateSemanticRulesForWeek(weekId: string, parts: WorkbookPart[]): Promise<string> {
    const proxyUrl = getAiProxyUrl();

    // Filtra apenas as partes da semana solicitada que não são cânticos/orações
    const weekParts = parts.filter(p => p.weekId === weekId && !p.tituloParte.toLowerCase().includes('oração'));
    
    let partsTextContext = `Semana: ${weekId}\n\n`;
    weekParts.forEach(part => {
        partsTextContext += `[PARTE: ${part.tituloParte}]\n`;
        partsTextContext += `TEXTO: ${part.descricaoParte || ''} ${part.detalhesParte || ''}\n\n`;
    });

    const payload = {
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: `Aqui estão as partes da semana. Gere o YAML com as regras semânticas.\n\n${partsTextContext}` }]
            }
        ]
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
        
        let rawResult = '';
        if (data && data.candidates && data.candidates.length > 0) {
            const parts = data.candidates[0].content?.parts || [];
            rawResult = parts.map((p: any) => p.text).join('');
        }
        
        // Limpar possíveis marcações de markdown retornadas pelo LLM
        let cleanYaml = rawResult.trim();
        if (cleanYaml.startsWith('\`\`\`yaml')) {
            cleanYaml = cleanYaml.replace(/^\`\`\`yaml\n?/, '');
        }
        if (cleanYaml.startsWith('\`\`\`')) {
            cleanYaml = cleanYaml.replace(/^\`\`\`\n?/, '');
        }
        if (cleanYaml.endsWith('\`\`\`')) {
            cleanYaml = cleanYaml.replace(/\n?\`\`\`$/, '');
        }

        return cleanYaml.trim();
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
