import type { WorkbookPart } from '../types';
import { getAiProxyUrl } from '../lib/ai/clientProxy';
import { curatorKnowledgeBaseService, type CuratorProfile } from './curatorKnowledgeBaseService';

interface BatchAnalysisResult {
    success: boolean;
    batchId: string;
    batchName: string;
    livroBiblico?: string;
    resumoEstrategico: string;
    novosPerfisCriados: string[];
    perfisEnriquecidos: string[];
    error?: string;
}

const SPECIALIST_SYSTEM_PROMPT = `Você é o Agente Especialista em Taxonomia e Síntese Curatorial da Reunião Vida e Ministério (RVM) das Testemunhas de Jeová.
Sua missão é analisar um LOTE COMPLETO de apostilas recém-importadas, comparar as lições bíblicas, demonstrações do ministério e considerações com a Base de Conhecimento de Perfis existente.

Suas diretrizes:
1. Identifique o livro bíblico ou tema espiritual predominante no lote (ex: Jeremias, Atos, Salmos).
2. Analise os cenários do ministério ("Faça Seu Melhor no Ministério"), discursos de Tesouros e considerações de Vida Cristã.
3. Para os perfis já existentes na base: gere insights novos e práticos observados neste lote (ex: "Em partes de namoro da brochura lmd lição X, priorizar irmãs maduras com tato").
4. Crie novos perfis sintéticos APENAS se surgirem cenários pedagógicos inéditos que nenhum perfil existente atenda bem.
5. Elabore um resumo estratégico de alto nível para o superintendente da reunião sobre o estilo das partes deste lote.`;

const SPECIALIST_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        livro_biblico_foco: { 
            type: "STRING", 
            description: "Livro bíblico ou tema central predominante nas leituras e tesouros deste lote (ex: Jeremias)." 
        },
        resumo_estrategico: { 
            type: "STRING", 
            description: "Síntese em 2 a 4 frases destacando o foco pedagógico e os principais desafios das designações deste lote." 
        },
        insights_para_perfis_existentes: {
            type: "ARRAY",
            description: "Novos insights extraídos das apostilas para enriquecer os perfis que já existem.",
            items: {
                type: "OBJECT",
                properties: {
                    perfil_id: { type: "STRING", description: "ID exato do perfil existente no snake_case." },
                    insight_texto: { type: "STRING", description: "Observação prática de como aplicar esse perfil nas partes deste lote." },
                    palavras_chave: { 
                        type: "ARRAY", 
                        items: { type: "STRING" },
                        description: "Termos chave da apostila associados a este insight."
                    }
                },
                required: ["perfil_id", "insight_texto", "palavras_chave"]
            }
        },
        novos_perfis: {
            type: "ARRAY",
            description: "Novos perfis a serem cadastrados na base permanente se houver necessidade real.",
            items: {
                type: "OBJECT",
                properties: {
                    id: { type: "STRING", description: "ID único em snake_case (ex: especialista_idiomas)." },
                    nome: { type: "STRING", description: "Nome legível do perfil (ex: Especialista em Idiomas Estrangeiros)." },
                    categoria: { 
                        type: "STRING", 
                        enum: ["Ministerio", "Ensino", "Leitura", "Pastoral", "Familia", "Outro"] 
                    },
                    descricao: { type: "STRING", description: "Propósito e quando utilizar este perfil." },
                    afinidades_recomendadas: { 
                        type: "ARRAY", 
                        items: { type: "STRING" } 
                    },
                    insight_inicial: { type: "STRING" },
                    palavras_chave: { 
                        type: "ARRAY", 
                        items: { type: "STRING" } 
                    }
                },
                required: ["id", "nome", "categoria", "descricao", "afinidades_recomendadas", "insight_inicial"]
            }
        }
    },
    required: ["resumo_estrategico", "insights_para_perfis_existentes", "novos_perfis"]
};

export const curatorBatchSpecialistAgent = {
    /**
     * Analisa um lote completo de partes importadas, compara com a base de perfis e enriquece permanentemente o Supabase.
     */
    async specializeOnBatch(
        batchId: string,
        batchName: string,
        parts: WorkbookPart[]
    ): Promise<BatchAnalysisResult> {
        console.log(`[CuratorSpecialist] Iniciando especialização para lote "${batchName}" (batchId=${batchId}, totalParts=${parts.length})`);

        if (!parts || parts.length === 0) {
            return {
                success: false,
                batchId,
                batchName,
                resumoEstrategico: 'Nenhuma parte fornecida para análise.',
                novosPerfisCriados: [],
                perfisEnriquecidos: [],
                error: 'Lista de partes vazia'
            };
        }

        try {
            // 1. Carrega base de conhecimento atual de perfis
            const existingProfiles = await curatorKnowledgeBaseService.fetchCuratorProfiles();
            const existingProfilesSummary = existingProfiles.map(p => ({
                id: p.id,
                nome: p.nome,
                categoria: p.categoria,
                descricao: p.descricao
            }));

            // 2. Extrai semanas e organiza partes resumidas (filtrando orações e cânticos)
            const weeksCovered = Array.from(new Set(parts.map(p => p.weekId))).filter(Boolean).sort();
            const relevantParts = parts.filter(p => 
                !p.modalidade.toLowerCase().includes('oração') && 
                !p.modalidade.toLowerCase().includes('cântico')
            );

            // Amostra representativa para caber no contexto da IA
            let batchContextText = `LOTE: ${batchName}\n`;
            batchContextText += `SEMANAS COBERTAS (${weeksCovered.length}): ${weeksCovered.join(', ')}\n\n`;
            batchContextText += `BASE DE PERFIS ATUAIS NA BASE DE CONHECIMENTO:\n${JSON.stringify(existingProfilesSummary, null, 2)}\n\n`;
            batchContextText += `AMOSTRA DAS PRINCIPAIS PARTES DO LOTE:\n`;

            relevantParts.slice(0, 70).forEach((part, index) => {
                batchContextText += `${index + 1}. [${part.weekId}] ${part.section || ''} - ${part.tituloParte} (${part.modalidade || ''})\n`;
                if (part.descricaoParte) {
                    batchContextText += `   Desc: ${part.descricaoParte.substring(0, 140)}\n`;
                }
            });

            // 3. Chamada ao Gemini Flash via proxy
            const proxyUrl = getAiProxyUrl();
            const payload = {
                systemInstruction: {
                    parts: [{ text: SPECIALIST_SYSTEM_PROMPT }]
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ 
                            text: `Analise as partes deste novo lote de apostilas e atualize a taxonomia de perfis.\n\n${batchContextText}` 
                        }]
                    }
                ],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: SPECIALIST_RESPONSE_SCHEMA,
                    temperature: 0.2
                },
                thinking_level: 'LOW'
            };

            console.log(`[CuratorSpecialist] Enviando meta-análise do lote para IA...`);
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Erro na IA Especialista: ${response.status} - ${errText.substring(0, 150)}`);
            }

            const data = await response.json();
            let rawJson = '{}';
            if (data?.candidates?.[0]?.content?.parts?.length > 0) {
                rawJson = data.candidates[0].content.parts.map((p: any) => p.text).join('');
            }

            let cleanedJson = rawJson.trim();
            if (cleanedJson.startsWith('```json')) cleanedJson = cleanedJson.substring(7);
            if (cleanedJson.endsWith('```')) cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);

            const parsed = JSON.parse(cleanedJson);
            console.log(`[CuratorSpecialist] IA retornou análise do lote:`, {
                livro: parsed.livro_biblico_foco,
                insightsCount: parsed.insights_para_perfis_existentes?.length || 0,
                novosCount: parsed.novos_perfis?.length || 0
            });

            const enrichedProfileIds: string[] = [];
            const newProfileIds: string[] = [];

            // 4. Grava novos insights nos perfis existentes no Supabase
            if (Array.isArray(parsed.insights_para_perfis_existentes)) {
                for (const item of parsed.insights_para_perfis_existentes) {
                    if (item.perfil_id && item.insight_texto) {
                        await curatorKnowledgeBaseService.addInsightToProfile(item.perfil_id, {
                            batch_id: batchId,
                            texto: item.insight_texto,
                            palavras_chave: item.palavras_chave || [],
                            data: new Date().toISOString()
                        });
                        enrichedProfileIds.push(item.perfil_id);
                    }
                }
            }

            // 5. Cadastra novos perfis sintéticos se a IA propôs
            if (Array.isArray(parsed.novos_perfis)) {
                for (const np of parsed.novos_perfis) {
                    if (np.id && np.nome) {
                        const newProf: Partial<CuratorProfile> & { id: string, nome: string } = {
                            id: np.id.toLowerCase().replace(/\s+/g, '_'),
                            nome: np.nome,
                            categoria: np.categoria || 'Outro',
                            descricao: np.descricao || '',
                            afinidades_recomendadas: np.afinidades_recomendadas || [],
                            insights: [
                                {
                                    batch_id: batchId,
                                    texto: np.insight_inicial || 'Criado durante especialização de lote.',
                                    palavras_chave: np.palavras_chave || [],
                                    data: new Date().toISOString()
                                }
                            ],
                            total_aplicacoes: 0
                        };
                        await curatorKnowledgeBaseService.upsertCuratorProfile(newProf);
                        newProfileIds.push(newProf.id);
                    }
                }
            }

            // 6. Registra o lote histórico no Supabase
            const batchInsightRecord = await curatorKnowledgeBaseService.recordBatchInsight({
                batch_id: batchId,
                batch_name: batchName,
                semanas_cobertas: weeksCovered,
                livro_biblico_foco: parsed.livro_biblico_foco || 'Geral',
                novos_perfis: newProfileIds,
                perfis_enriquecidos: Array.from(new Set(enrichedProfileIds)),
                resumo_estrategico: parsed.resumo_estrategico || 'Especialização de lote concluída com sucesso.'
            });

            console.log(`[CuratorSpecialist] Concluído com sucesso! Lote gravado: ${batchInsightRecord.id}`);

            return {
                success: true,
                batchId,
                batchName,
                livroBiblico: parsed.livro_biblico_foco,
                resumoEstrategico: parsed.resumo_estrategico,
                novosPerfisCriados: newProfileIds,
                perfisEnriquecidos: Array.from(new Set(enrichedProfileIds))
            };

        } catch (err) {
            console.error('[CuratorSpecialist] Erro ao especializar lote:', err);
            return {
                success: false,
                batchId,
                batchName,
                resumoEstrategico: 'Falha durante o processamento da especialização.',
                novosPerfisCriados: [],
                perfisEnriquecidos: [],
                error: err instanceof Error ? err.message : 'Erro desconhecido'
            };
        }
    }
};
