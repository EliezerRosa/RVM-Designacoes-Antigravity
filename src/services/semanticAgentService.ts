import { getAiProxyUrl } from '../lib/ai/clientProxy';
import { supabase } from '../lib/supabase';
import type { WorkbookPart } from '../types';

export interface AgentGenerationStatus {
    status: 'idle' | 'loading' | 'success' | 'error';
    message: string;
}

const SYSTEM_PROMPT = `
Você é o Agente Especialista de Critérios para a Reunião Vida e Ministério.
Sua missão é ler as partes da reunião de uma semana específica e gerar um YAML com os critérios de busca (demografia, perfil, maturidade) para o "Matchmaker".

As chaves do YAML gerado devem ser os títulos das partes (ou fragmentos deles).
Para cada parte, retorne APENAS um objeto contendo:
- demografia_alvo: (ex: "jovens", "idosos", ou omita)
- perfil_familiar: (ex: "pai_ou_mae", "casais", ou omita)
- emocional: (ex: "irritada", "triste", ou omita)
- objeção: (ex: "forte", "fraca", ou omita)
- criterio_exato: (ex: "ancião", "pioneiro", ou omita)
- foco: (resumo da habilidade necessária, ex: "ensino")
- boost_tags: [array de strings, ex: "ancião", "maduro", "experiente", "jovem", "empatia"]
- sugestao: "Uma breve frase explicando por que esta demografia/perfil foi escolhida com base no texto."
- texto_original: "O texto exato da apostila que você analisou para tomar essa decisão."

Regras estritas:
1. Retorne APENAS um bloco YAML válido, sem markdown (\`\`\`yaml) ao redor.
2. Seja conservador. Se a parte for apenas uma leitura da Bíblia ou um discurso genérico que qualquer pessoa pode fazer, NÃO GERE regra para ela. Gere apenas para partes que claramente se beneficiariam de uma demografia ou perfil específico.
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
