import { supabase } from '../lib/supabase';

export interface CuratorProfileInsight {
    batch_id?: string;
    texto: string;
    palavras_chave?: string[];
    data: string;
}

export interface CuratorProfile {
    id: string;
    nome: string;
    categoria: 'Ministerio' | 'Ensino' | 'Leitura' | 'Pastoral' | 'Familia' | 'Outro';
    descricao: string;
    criterios_elegibilidade?: {
        genero?: 'brother' | 'sister' | 'any';
        ageGroup?: ('Crianca' | 'Jovem' | 'Adulto' | 'Idoso')[];
        condition?: ('Anciao' | 'Servo Ministerial' | 'Publicador')[];
        isBaptized?: boolean;
        isPioneer?: boolean;
        hasSpouse?: boolean;
        hasChildren?: boolean;
        privilegesRequired?: string[];
    };
    afinidades_recomendadas: string[];
    insights: CuratorProfileInsight[];
    total_aplicacoes: number;
    created_at?: string;
    updated_at?: string;
}

export interface CuratorBatchInsight {
    id?: string;
    batch_id?: string;
    batch_name: string;
    semanas_cobertas: string[];
    livro_biblico_foco?: string;
    novos_perfis: string[];
    perfis_enriquecidos: string[];
    resumo_estrategico: string;
    created_at?: string;
}

// 16 Perfis Típicos Fundamentais mapeados a partir das apostilas de 2026
export const INITIAL_CURATOR_PROFILES: CuratorProfile[] = [
    {
        id: 'mentoria_feminina',
        nome: 'Mentoria Feminina',
        categoria: 'Ministerio',
        descricao: 'Para demonstrações entre irmãs envolvendo aconselhamento sobre namoro, casamento, criação de filhos ou suporte pastoral feminino mútuo.',
        criterios_elegibilidade: {
            genero: 'sister',
            ageGroup: ['Adulto', 'Idoso'],
            isPioneer: true
        },
        afinidades_recomendadas: ['Testemunho de Casa em Casa', 'Aconselhamento', 'Iniciando Conversas'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Ideal para cenas em que uma irmã experiente aconselha uma jovem sobre namoro cristão ou desafios morais.',
                palavras_chave: ['namoro', 'jovem', 'irmã', 'conselho', 'pioneira'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'consolador_empatico',
        nome: 'Consolador Empático',
        categoria: 'Pastoral',
        descricao: 'Publicador(a) maduro(a) e sensível para abordar perdas de entes queridos, doença grave, luto ou desânimo.',
        criterios_elegibilidade: {
            ageGroup: ['Adulto', 'Idoso'],
            condition: ['Anciao', 'Servo Ministerial', 'Publicador']
        },
        afinidades_recomendadas: ['Consolo e Empatia', 'Pastoreio', 'Vida Cristã'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Aplicável a considerações de vídeos sobre como recuperar o sentido da vida após a perda do cônjuge.',
                palavras_chave: ['luto', 'perda', 'cônjuge', 'consolo', 'esperança'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'iniciador_conversas',
        nome: 'Iniciador de Conversas',
        categoria: 'Ministerio',
        descricao: 'Publicador comunicativo e desinibido para primeiros contatos de casa em casa ou testemunho informal.',
        criterios_elegibilidade: {
            ageGroup: ['Jovem', 'Adulto'],
            isBaptized: true
        },
        afinidades_recomendadas: ['Iniciando Conversas', 'Testemunho Informal', 'Uso de Vídeos'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Excelente para iniciar diálogos cotidianos usando vídeos do Kit de Ensino ou folhetos.',
                palavras_chave: ['primeiro contato', 'vídeo', 'folheto', 'naturalidade'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'cultivador_discipulador',
        nome: 'Cultivador & Discipulador',
        categoria: 'Ministerio',
        descricao: 'Para revisitas, superação de objeções bíblicas e início de estudos no livro Viva Feliz Para Sempre! (lff).',
        criterios_elegibilidade: {
            ageGroup: ['Adulto', 'Jovem'],
            isBaptized: true
        },
        afinidades_recomendadas: ['Cultivando o Interesse', 'Fazendo Discípulos', 'Estudo Bíblico'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Requer habilidade de fazer perguntas de ponto de vista e raciocinar com base no livro lff.',
                palavras_chave: ['revisita', 'estudo', 'lff', 'objeção', 'perguntas'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'defensor_da_fe',
        nome: 'Defensor da Fé & Neutralidade',
        categoria: 'Ensino',
        descricao: 'Para discursos de estudante ou demonstrações sobre livre-arbítrio, criação, profecias ou neutralidade cristã.',
        criterios_elegibilidade: {
            isBaptized: true,
            ageGroup: ['Jovem', 'Adulto']
        },
        afinidades_recomendadas: ['Explicando Suas Crenças', 'Discurso de Estudante', 'Neutralidade'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Exige clareza de argumentação bíblica para responder a perguntas difíceis com tato e respeito.',
                palavras_chave: ['livre-arbítrio', 'crenças', 'doutrina', 'neutralidade', 'argumentação'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'familia_base',
        nome: 'Família Base',
        categoria: 'Familia',
        descricao: 'Para demonstrações envolvendo casais (marido e esposa) ou pais educando filhos pequenos/adolescentes.',
        criterios_elegibilidade: {
            hasSpouse: true
        },
        afinidades_recomendadas: ['Família', 'Casais', 'Adoração em Família'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Dá realismo máximo a demonstrações de tomada de decisões no lar e testemunho conjunto.',
                palavras_chave: ['casal', 'marido', 'esposa', 'filhos', 'lar'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'jovem_promissor',
        nome: 'Jovem Promissor',
        categoria: 'Ministerio',
        descricao: 'Jovem ou adolescente batizado exemplar para ambientes escolares, pressão de colegas e esportes.',
        criterios_elegibilidade: {
            ageGroup: ['Jovem'],
            isBaptized: true
        },
        afinidades_recomendadas: ['Ambiente Escolar', 'Jovens', 'Demonstração'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Incentiva a juventude da congregação ao ver um jovem defender suas convicções na escola.',
                palavras_chave: ['escola', 'colegas', 'pressão', 'jovens', 'exemplo'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'jovem_treinamento',
        nome: 'Jovem em Treinamento',
        categoria: 'Ministerio',
        descricao: 'Criança ou adolescente não batizado dando os primeiros passos no ministério e na reunião.',
        criterios_elegibilidade: {
            ageGroup: ['Crianca', 'Jovem'],
            isBaptized: false
        },
        afinidades_recomendadas: ['Iniciante', 'Treinamento', 'Ajudante'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Proporciona ambiente seguro de aprendizado ao lado dos pais ou de instrutores experientes.',
                palavras_chave: ['iniciante', 'não batizado', 'criança', 'aprendizado'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'leitor_qualificado',
        nome: 'Leitor Qualificado',
        categoria: 'Leitura',
        descricao: 'Irmão batizado com excelente fluência, dicção clara e respeito à pontuação bíblica.',
        criterios_elegibilidade: {
            genero: 'brother',
            isBaptized: true,
            privilegesRequired: ['canReadCBS']
        },
        afinidades_recomendadas: ['Leitura da Bíblia', 'Leitura do EBC', 'Dicção'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Leituras poéticas e narrativas do livro de Jeremias exigem expressividade e respeito ao sentido.',
                palavras_chave: ['leitura', 'bíblia', 'fluência', 'ebc', 'clareza'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'pastor_instrutor',
        nome: 'Pastor Instrutor (Orador)',
        categoria: 'Ensino',
        descricao: 'Ancião ou Servo Ministerial habilitado para discursos de 10 min em Tesouros ou considerações de 15 min em Vida Cristã.',
        criterios_elegibilidade: {
            genero: 'brother',
            condition: ['Anciao', 'Servo Ministerial'],
            privilegesRequired: ['canGiveTalks']
        },
        afinidades_recomendadas: ['Discurso de Ensino', 'Tesouros da Palavra', 'Vida Cristã'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Requer orador com capacidade de tocar o coração, motivar à obediência e instruir com base na Bíblia.',
                palavras_chave: ['discurso', 'ensino', 'pastoreio', 'tesouros', 'ancião'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'dirigente_pastoral',
        nome: 'Dirigente Pastoral (EBC)',
        categoria: 'Pastoral',
        descricao: 'Ancião experiente e empático para condução semanal do Estudo Bíblico de Congregação.',
        criterios_elegibilidade: {
            genero: 'brother',
            condition: ['Anciao'],
            privilegesRequired: ['canConductCBS']
        },
        afinidades_recomendadas: ['Dirigente do EBC', 'Ensino Participativo', 'Pastoreio'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Estimula a assistência a comentar de coração e extrai lições práticas para o dia a dia.',
                palavras_chave: ['ebc', 'dirigente', 'ancião', 'comentários', 'ensino'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'organizador_pratico',
        nome: 'Organizador Prático',
        categoria: 'Ensino',
        descricao: 'Irmão metódico e pontual para temas de planejamento, logística de campanhas ou necessidades locais.',
        criterios_elegibilidade: {
            genero: 'brother',
            condition: ['Anciao', 'Servo Ministerial']
        },
        afinidades_recomendadas: ['Necessidades Locais', 'Gestão de Tempo', 'Campanhas'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Excelente para organizar a congregação no uso eficiente do tempo em campanhas especiais.',
                palavras_chave: ['organização', 'campanha', 'tempo', 'logística'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'pesquisador_entusiasta',
        nome: 'Pesquisador Bíblico Entusiasta',
        categoria: 'Ensino',
        descricao: 'Irmão dedicado ao estudo profundo para conduzir com riqueza as Joias Espirituais (10 min).',
        criterios_elegibilidade: {
            genero: 'brother',
            condition: ['Anciao', 'Servo Ministerial']
        },
        afinidades_recomendadas: ['Joias Espirituais', 'Pesquisa Bíblica', 'Comentários'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Habilidade de conectar o contexto histórico do texto bíblico a lições espirituais valiosas.',
                palavras_chave: ['joias', 'pesquisa', 'história', 'arqueologia', 'espiritual'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'conselheiro_experiente',
        nome: 'Conselheiro Experiente',
        categoria: 'Pastoral',
        descricao: 'Ancião sênior com longa trajetória na verdade para transmitir peso espiritual e conselhos maduros.',
        criterios_elegibilidade: {
            genero: 'brother',
            condition: ['Anciao'],
            ageGroup: ['Idoso', 'Adulto']
        },
        afinidades_recomendadas: ['Conselho Pastoral', 'Maturidade', 'Presidência'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Autoridade moral e espiritual para temas delicados e fortalecimento de irmãos em provação.',
                palavras_chave: ['ancião', 'experiência', 'conselho', 'firmeza', 'lealdade'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'apologista_maduro',
        nome: 'Apologista Maduro',
        categoria: 'Ensino',
        descricao: 'Irmão experiente e firme para refutar objeções complexas e fortalecer a congregação contra falsos ensinos.',
        criterios_elegibilidade: {
            genero: 'brother',
            condition: ['Anciao', 'Servo Ministerial'],
            isBaptized: true
        },
        afinidades_recomendadas: ['Defesa da Fé', 'Doutrina', 'Discurso'],
        insights: [
            {
                batch_id: 'inicial_2026',
                texto: 'Foco na defesa de profecias cumpridas e advertência contra falsos profetas.',
                palavras_chave: ['apologética', 'doutrina', 'falsos profetas', 'defesa'],
                data: new Date().toISOString()
            }
        ],
        total_aplicacoes: 0
    },
    {
        id: 'nenhum',
        nome: 'Geral / Sem Restrição',
        categoria: 'Outro',
        descricao: 'Partes genéricas sem exigência pedagógica específica.',
        afinidades_recomendadas: [],
        insights: [],
        total_aplicacoes: 0
    }
];

let profilesMemoryCache: CuratorProfile[] | null = null;

export const curatorKnowledgeBaseService = {
    /**
     * Busca todos os perfis ativos da Base de Conhecimento do Supabase
     */
    async fetchCuratorProfiles(forceRefresh = false): Promise<CuratorProfile[]> {
        if (!forceRefresh && profilesMemoryCache && profilesMemoryCache.length > 0) {
            return profilesMemoryCache;
        }

        try {
            const { data, error } = await supabase
                .from('curator_profiles')
                .select('*')
                .order('nome', { ascending: true });

            if (error || !data || data.length === 0) {
                console.warn('[CuratorKnowledgeBase] Tabela vazia ou erro. Realizando seed inicial...');
                const seeded = await this.seedInitialProfiles();
                profilesMemoryCache = seeded;
                return seeded;
            }

            profilesMemoryCache = data as CuratorProfile[];
            return profilesMemoryCache;
        } catch (err) {
            console.error('[CuratorKnowledgeBase] Erro ao buscar perfis:', err);
            return INITIAL_CURATOR_PROFILES;
        }
    },

    /**
     * Insere ou atualiza um perfil e seus insights acumulados
     */
    async upsertCuratorProfile(profile: Partial<CuratorProfile> & { id: string, nome: string }): Promise<CuratorProfile> {
        const payload = {
            ...profile,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('curator_profiles')
            .upsert(payload)
            .select()
            .single();

        if (error) {
            console.error(`[CuratorKnowledgeBase] Erro ao salvar perfil ${profile.id}:`, error);
            throw error;
        }

        // Invalida cache
        profilesMemoryCache = null;
        return data as CuratorProfile;
    },

    /**
     * Enriquece um perfil existente adicionando um novo insight aprendido de um lote
     */
    async addInsightToProfile(profileId: string, newInsight: CuratorProfileInsight): Promise<void> {
        try {
            const { data: existing, error } = await supabase
                .from('curator_profiles')
                .select('insights')
                .eq('id', profileId)
                .single();

            if (error || !existing) return;

            const currentInsights: CuratorProfileInsight[] = existing.insights || [];
            // Evita duplicatas idênticas de texto
            const isDuplicate = currentInsights.some(i => i.texto.trim().toLowerCase() === newInsight.texto.trim().toLowerCase());
            if (isDuplicate) return;

            const updatedInsights = [newInsight, ...currentInsights].slice(0, 15); // Guarda até 15 insights mais recentes

            await supabase
                .from('curator_profiles')
                .update({ 
                    insights: updatedInsights,
                    updated_at: new Date().toISOString()
                })
                .eq('id', profileId);

            profilesMemoryCache = null;
        } catch (err) {
            console.error(`[CuratorKnowledgeBase] Falha ao anexar insight ao perfil ${profileId}:`, err);
        }
    },

    /**
     * Registra os insights gerados para um lote de apostilas
     */
    async recordBatchInsight(insight: CuratorBatchInsight): Promise<CuratorBatchInsight> {
        const { data, error } = await supabase
            .from('curator_batch_insights')
            .insert(insight)
            .select()
            .single();

        if (error) {
            console.error('[CuratorKnowledgeBase] Erro ao registrar lote de insights:', error);
            throw error;
        }

        return data as CuratorBatchInsight;
    },

    /**
     * Busca os lotes de insights salvos
     */
    async fetchBatchInsights(): Promise<CuratorBatchInsight[]> {
        const { data, error } = await supabase
            .from('curator_batch_insights')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[CuratorKnowledgeBase] Erro ao buscar histórico de lotes:', error);
            return [];
        }

        return data as CuratorBatchInsight[];
    },

    /**
     * Popula os 16 perfis típicos iniciais no banco de dados
     */
    async seedInitialProfiles(): Promise<CuratorProfile[]> {
        try {
            console.log(`[CuratorKnowledgeBase] Executando seed de ${INITIAL_CURATOR_PROFILES.length} perfis no Supabase...`);
            const { data, error } = await supabase
                .from('curator_profiles')
                .upsert(INITIAL_CURATOR_PROFILES, { onConflict: 'id' })
                .select();

            if (error) {
                console.error('[CuratorKnowledgeBase] Falha no seed inicial:', error);
                return INITIAL_CURATOR_PROFILES;
            }

            console.log(`[CuratorKnowledgeBase] Seed concluído com sucesso: ${data.length} perfis gravados.`);
            profilesMemoryCache = data as CuratorProfile[];
            return profilesMemoryCache;
        } catch (err) {
            console.error('[CuratorKnowledgeBase] Erro no seed:', err);
            return INITIAL_CURATOR_PROFILES;
        }
    }
};
