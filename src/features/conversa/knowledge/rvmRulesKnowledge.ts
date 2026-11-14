/**
 * Base de Conhecimento Curada e Versionada — Especialista RVM Designações
 *
 * Cobre de forma canônica:
 * - Objetivo, módulos e intenções do sistema RVM Designações
 * - Regras Algorítmicas do Motor Lexicográfico (M-0 a M-12, v2026-10-15.01)
 * - Invariantes de Relatórios Mensais (RM I-0 a I-7)
 * - Diretrizes S-38-T e Formulários Oficiais (S-140, S-89, S-4, S-1)
 * - Mensageria Z-API (6 Invariantes de Botões, Resumo Desacoplado, Aquiescência Tácita)
 * - Papéis Teocráticos, Permissões e Isolamento de Dados
 *
 * Proibido alucinar regras: se a pergunta não estiver catalogada com fonte,
 * o sistema responde honestamente que não possui a informação registrada.
 */

export interface KnowledgeEntry {
  topicId: string;
  title: string;
  category: 'motor' | 's38' | 'organizacao' | 'mensageria' | 'relatorios' | 'permissoes' | 'sistema';
  summary: string;
  details: string[];
  officialSource: string;
  keywords: string[];
}

export const RVM_KNOWLEDGE_BASE: readonly KnowledgeEntry[] = [
  {
    topicId: 'objetivo-sistema-rvm',
    title: 'Objetivo, Arquitetura e Capacidades do RVM Designações',
    category: 'sistema',
    summary:
      'O RVM Designações organiza as designações da Reunião Nossa Vida e Ministério Cristão (S-140/S-89), a disponibilidade dos publicadores, os relatórios de serviço de campo (S-4/S-1) e as confirmações via WhatsApp (Z-API).',
    details: [
      'Apostas e Programação (S-140 / S-89): importa a apostila oficial, elege designados via motor lexicográfico (M-0 a M-12), permite revisão e publica os cartões S-89.',
      'Relatórios Mensais (S-4 / S-1): registra a atividade mensal de cada publicador e gera a consolidação da congregação.',
      'Conversa RVM (UI-Chat-IA): consulta designações, partes vagas, históricos, elegibilidade, ranking e exibe cartões S-140/S-89/S-4/S-1 no carrossel flutuante.',
      'Micro-ações autorizadas: pelo perfil logado, permite confirmar/recusar S-89 (com os mesmos webhooks Z-API), registrar ausências, aprovar propostas, gerar/limpar semanas, designar/rejeitar partes e gerenciar Necessidades Locais.',
    ],
    officialSource: 'Arquitetura Canônica RVM Designações / _ESTADO-ATUAL.md & plano-ui-conversa-ia',
    keywords: [
      'objetivo',
      'objetivo do rvm',
      'objetivo do sistema',
      'proposito',
      'rvm',
      'rvm designacoes',
      'sistema rvm',
      'arquitetura',
      'o que e o rvm',
      'para que serve',
      'como funciona o sistema',
      'o que voce faz',
      'o que voce sabe',
      'funcionalidades',
      'comandos',
      'ajuda',
      'capacidades',
      'modulos',
      'conversa rvm',
      'intencoes',
      's-140',
      's140',
      's-89',
      's89',
    ],
  },
  {
    topicId: 'rodizio-e-motor',
    title: 'Critérios de Rodízio e Motor Lexicográfico (M-0 a M-12)',
    category: 'motor',
    summary:
      'O motor de designações decide por faixas categóricas (buckets) e ordem lexicográfica estrita (M-0), sem pontuação numérica aditiva e sem cooldown bloqueante artificial.',
    details: [
      '1º Passo (Faixa / Bucket): menor faixa sempre vence (Presidência cíclica M-1, Garantia de estudante para Anciãos/SMs M-3, Prioridade de irmãs em demonstrações M-4).',
      '2º Passo (Ordem lexicográfica dentro da faixa): (1) menor proximidade de outra parte MAIN em ±4 semanas; (2) menor carga em ±12 semanas (passadas e futuras já marcadas); (3) mais semanas desde a última vez na mesma parte; (4) mais tempo sem qualquer parte; (5) menos partes no ano; (6) nome.',
      'Gates absolutos (nunca relaxados): elegibilidade estrutural, disponibilidade na data, máximo de 1 parte na semana (exceto Oração Final) e Memória de Recusa semanal (M-12).',
      'Gates relaxáveis em cascata (para não deixar parte vazia): não repetir a mesma parte em ±4 semanas, alternância de seção (M-7), alternância FSM e par recente.',
    ],
    officialSource: 'Invariantes do Motor M-0 (Regras 2026-10-15.01 / motor-invariants.intent.md)',
    keywords: [
      'rodizio',
      'motor',
      'ranking',
      'criterio',
      'desempate',
      'm-0',
      'm0',
      'lexicografico',
      'score',
      'pontuacao',
      'faixa',
      'bucket',
      'intervalo',
      'proximidade',
      'carga',
      'cooldown',
      'invariante',
      'invariantes',
    ],
  },
  {
    topicId: 'presidencia-ciclica',
    title: 'Presidência Cíclica e Precedência F1 (M-1 e M-2)',
    category: 'motor',
    summary:
      'A Presidência da Reunião segue uma fila cíclica justa em janela de 52 semanas (M-1) e é sempre designada antes das demais partes do lote (M-2).',
    details: [
      'M-1 (Fila cíclica): a faixa do Presidente equivale à quantidade de presidências na janela de ±52 semanas; ninguém preside pela (k+1)-ésima vez enquanto houver elegível disponível com k.',
      'M-2 (Precedência F1): a Presidência é eleita em todas as semanas do lote antes do preenchimento das partes de Ensino, Estudantes e Oração.',
      'Oração Inicial, Comentários Iniciais, Elogios e Conselhos e Comentários Finais são derivados automaticamente do Presidente e nunca podem ser designados a terceiros.',
    ],
    officialSource: 'Invariantes do Motor M-1 e M-2 / S-38-T 8/26 § 3',
    keywords: [
      'presidente',
      'presidencia',
      'presidir',
      'm-1',
      'm1',
      'm-2',
      'm2',
      'ciclo',
      '52 semanas',
      'comentarios iniciais',
      'oracao inicial',
    ],
  },
  {
    topicId: 'garantia-estudante-anciaos-sm',
    title: 'Garantia de Parte de Estudante para Anciãos e Servos Ministeriais (M-3)',
    category: 'motor',
    summary:
      'Anciãos e Servos Ministeriais sem nenhuma participação de estudante (titular ou ajudante) em ±13 semanas entram na faixa 0 em partes de estudante elegíveis.',
    details: [
      'Quando um Ancião ou SM está há ±13 semanas sem participar na seção de estudantes, recebe faixa 0 (prioridade imediata, inclusive antes das irmãs em demonstrações).',
      'Limite de equilíbrio (M-3): teto de no máximo 2 titulares Ancião/SM garantidos por semana para preservar o equilíbrio com o ensino.',
      'Fora da seca de ±13 semanas: em Demonstrações vale Irmãs (1) › Irmãos (2) › SMs (3) › Anciãos (4); em Leitura/Discurso de Estudante vale Publicador (1) › SM (2) › Ancião (3).',
    ],
    officialSource: 'Invariante do Motor M-3 (motor-invariants.intent.md)',
    keywords: [
      'm-3',
      'm3',
      'garantia',
      '13 semanas',
      'anciao em demonstracao',
      'servo em demonstracao',
      'parte de estudante',
    ],
  },
  {
    topicId: 'prioridade-irmas-demonstracoes',
    title: 'Prioridade Absoluta de Irmãs em Demonstrações (M-4)',
    category: 'motor',
    summary:
      'Fora dos casos de garantia de Ancião/SM (M-3), toda irmã elegível tem faixa absoluta antes de qualquer irmão em demonstrações.',
    details: [
      'Em Iniciando Conversas, Cultivando o Interesse, Fazendo Discípulos e Explicando Suas Crenças, as irmãs ficam na faixa 1 (antes de irmãos publicadores, SMs e anciãos).',
      'Esta é uma diretriz fixa do motor (não é convertida em critério numérico de desempate).',
      'Irmãs não são designadas para Discursos de Ensino, Leitura da Bíblia, Discurso de Estudante, Presidência, Oração ou EBC.',
    ],
    officialSource: 'Invariante do Motor M-4 / S-38-T 8/26',
    keywords: [
      'm-4',
      'm4',
      'irma',
      'irmas',
      'faixa de irmas',
      'prioridade irmas',
    ],
  },
  {
    topicId: 'ensino-por-escassez-e-secao',
    title: 'Ensino por Escassez (M-5) e Rotação Intra-Seção (M-7)',
    category: 'motor',
    summary:
      'Partes de ensino são processadas da menor para a maior quantidade de candidatos elegíveis (M-5), evitando repetir a mesma modalidade na seção sem antes rodar as demais (M-7).',
    details: [
      'M-5 (Escassez real): dentro da semana, Discurso Tesouros, Joias Espirituais, Parte na Vida Cristã e Dirigente EBC são ordenados pelo menor número de elegíveis no momento.',
      'M-7 (Gate de seção): compara apenas partes da mesma classe — Tesouros (Discurso Tesouros ↔ Joias Espirituais) e Vida Cristã (Parte VC ↔ Dirigente EBC).',
      'Leitura da Bíblia e Leitor do EBC não entram na dívida de seção do M-7.',
    ],
    officialSource: 'Invariantes do Motor M-5 e M-7 (motor-invariants.intent.md)',
    keywords: [
      'm-5',
      'm5',
      'm-7',
      'm7',
      'escassez',
      'ensino',
      'secao',
      'divida de secao',
      'joias espirituais',
      'discurso tesouros',
      'vida crista',
    ],
  },
  {
    topicId: 'historico-e-status-vivos',
    title: 'Histórico Vivo, Cancelamentos e Fidelidade (M-6, M-10 e M-11)',
    category: 'motor',
    summary:
      'Todas as partes em status vivo (PROPOSTA, DESIGNADA, APROVADA, CONCLUIDA) pesam igualmente no histórico, enquanto CANCELADA e REJEITADA são descartadas.',
    details: [
      'M-6: CANCELADA e REJEITADA não contam como participação mesmo que mantenham o nome visível para auditoria/aviso.',
      'M-10 (Sem ghost history): ao regenerar partes, suas atribuições antigas saem do cálculo do histórico; sem substituto válido no sanity-check, o status volta para PENDENTE.',
      'M-11 (Operador › Motor): designações manuais marcadas (`is_manual_override`) e partes já DESIGNADA/APROVADA não são sobrescritas na geração automática sem pedido explícito.',
    ],
    officialSource: 'Invariantes do Motor M-6, M-10 e M-11 / historyAdapter',
    keywords: [
      'm-6',
      'm6',
      'm-10',
      'm10',
      'm-11',
      'm11',
      'historico',
      'cancelada',
      'rejeitada',
      'proposta',
      'designada',
      'override',
      'regenerar',
      'status',
    ],
  },
  {
    topicId: 'partes-especiais-e-oracao',
    title: 'Semântica da Oração Final e Partes Especiais (M-8)',
    category: 'motor',
    summary:
      'A Oração Final é exclusiva para irmãos batizados, isenta de penalidade de proximidade, pode ser a 2ª parte do irmão na semana, mas nunca pode ser o próprio Presidente.',
    details: [
      'Oração Inicial, Comentários Iniciais/Finais, Elogios e Conselhos e Cânticos nunca entram no rodízio do motor e não geram S-89 individual.',
      'Oração Final não conta como carga ao avaliar outras partes MAIN, mas conta ao avaliar a própria rotação de Oração Final.',
      'Ajudante de demonstração conta como parte MAIN para cálculo de proximidade em ±4 semanas e como participação de estudante em M-3.',
    ],
    officialSource: 'Invariante do Motor M-8 / S-38-T 8/26',
    keywords: [
      'oracao',
      'oracao final',
      'm-8',
      'm8',
      'segunda parte',
      'cantico',
      'ajudante conta',
    ],
  },
  {
    topicId: 'regras-genero-estudantes',
    title: 'Gênero, Parentesco e Alternância em Estudantes (M-9 e Regra 2026-10-15.01)',
    category: 's38',
    summary:
      'Duplas de demonstração exigem obrigatoriamente o mesmo sexo (Titular ↔ Ajudante), salvo exceção comprovada de parentesco direto (cônjuges ou pais e filhos).',
    details: [
      'Blindagem bidirecional (2026-10-15.01): a checagem de gênero/parentesco bloqueia pares incompatíveis tanto ao escolher o Ajudante quanto ao trocar o Titular.',
      'Exceções de parentesco: cônjuges (`spouseId` cruzado) e pai/mãe com filho(a) (`parentIds`/`childIds` bidirecionais) podem formar dupla em qualquer combinação.',
      'Alternância FSM (8 semanas): o motor alterna papéis de Titular e Ajudante, exceto para publicadores marcados como "Só Ajudante" (`isHelperOnly`).',
      'Não-repetição de par (16 semanas): o motor evita repetir a mesma dupla titular+ajudante, com bypass para parentesco.',
      'M-9: menção a "irmã/irmão" no texto da apostila só restringe gênero em modalidades mistas (demonstração/ajudante).',
    ],
    officialSource: 'S-38-T 8/26 §§ 5, 7, 8, 11 e 12 / Regras 2026-10-15.01 (M-9)',
    keywords: [
      'genero',
      'sexo',
      'ajudante',
      'parentesco',
      'conjuge',
      'esposa',
      'marido',
      'filho',
      'filha',
      'demonstracao',
      'm-9',
      'm9',
      'alternancia',
      'par',
      'dupla',
    ],
  },
  {
    topicId: 'memoria-de-recusa',
    title: 'Memória Semanal de Recusa e Substituição (M-12)',
    category: 'motor',
    summary:
      'Quem recusou uma parte na semana (Portal, Z-API ou Agente) ou foi substituído em semana já publicada torna-se inelegível para qualquer outra parte naquela mesma semana.',
    details: [
      'M-12 vale como gate absoluto em toda a semana-alvo: geração automática, dropdown manual, painel e sugestão de substituto.',
      'Fora da semana da recusa, o registro é neutro: não conta como participação (M-6) nem gera penalidade futura.',
      'Remanejos manuais feitos antes da publicação da semana não gravam substituição e não bloqueiam o publicador.',
    ],
    officialSource: 'Invariante do Motor M-12 (motor-invariants.intent.md)',
    keywords: [
      'm-12',
      'm12',
      'recusa',
      'recusou',
      'substituido',
      'memoria de recusa',
      'inelegivel na semana',
    ],
  },
  {
    topicId: 'leitura-e-ebc',
    title: 'Leitura da Bíblia e Estudo Bíblico de Congregação (EBC)',
    category: 's38',
    summary:
      'A Leitura da Bíblia (4 min) é designada a estudante homem, enquanto o Estudo Bíblico de Congregação (30 min) é dirigido por Ancião aprovado e lido por irmão batizado qualificado.',
    details: [
      'O Dirigente do EBC requer privilégio `canConductCBS` e condição de Ancião.',
      'O Leitor do EBC requer privilégio `canReadCBS` e sexo masculino (`brother`).',
      'Na semana de visita do Superintendente de Circuito, o EBC é substituído pelo discurso de serviço de 30 minutos do Superintendente.',
    ],
    officialSource: 'S-38-T 8/26 §§ 5, 17 e 21',
    keywords: [
      'leitura',
      'leitura da biblia',
      'ebc',
      'estudo biblico',
      'dirigente ebc',
      'leitor ebc',
      'superintendente de circuito',
      'visita',
    ],
  },
  {
    topicId: 'necessidades-locais-e-eventos',
    title: 'Necessidades Locais e Eventos Especiais (S-38)',
    category: 's38',
    summary:
      'Necessidades Locais são designadas exclusivamente a Anciãos conforme a fila pré-aprovada; Eventos Especiais (Visita do SC, Assembleia, Congresso, Celebração) ajustam automaticamente as partes da semana.',
    details: [
      'Necessidades Locais contam como parte MAIN no histórico e honram a fila (`local_needs_preassignments`) por semana específica ou ordem da fila.',
      'Servos Ministeriais não podem assumir Necessidades Locais.',
      'Eventos Especiais como Visita do Superintendente de Circuito ou Assembleia/Congresso ajustam ou cancelam as designações regulares da semana afetada.',
    ],
    officialSource: 'S-38-T 8/26 § 16 / special_events & local_needs_preassignments',
    keywords: [
      'necessidades locais',
      'nciao',
      'anciao',
      'fila de necessidades',
      'evento especial',
      'eventos especiais',
      'assembleia',
      'congresso',
      'celebracao',
    ],
  },
  {
    topicId: 'relatorios-mensais-s4-s1',
    title: 'Relatórios Mensais de Campo (S-4) e Consolidação (S-1) — Invariantes I-0 a I-7',
    category: 'relatorios',
    summary:
      'O módulo de Relatórios Mensais separa membresia de status de campo (I-0), computa o ano de serviço a partir de setembro (I-1) e garante um único cartão S-4 por publicador em cada mês (I-4).',
    details: [
      'I-0 (Ortogonalidade): `is_congregated` (pertencer à congregação) e `field_service_status` (ativo/irregular/inativo no campo) são eixos independentes e nunca substituem um ao outro.',
      'I-1 (Ano de Serviço): `service_year = mês >= 9 ? ano + 1 : ano` (setembro abre o novo ano de serviço teocrático).',
      'I-2 (Mês Pendente): o mês em coleta é sempre o mês civil imediatamente anterior ao atual.',
      'I-4 e I-6: no máximo 1 relatório por publicador por mês civil (`S-4-T`); o campo `hours` é exigido/habilitado apenas para pioneiros (regulares, auxiliares ou especiais).',
      'Consolidação S-1 (`S-1-T`): totaliza os envios do mês para a congregação e fica restrita aos perfis autorizados na aba Relatórios Mensais.',
    ],
    officialSource: 'Invariantes de Relatórios Mensais I-0 a I-7 (`rm-invariants.intent.md`)',
    keywords: [
      'relatorio mensal',
      'relatorios mensais',
      's-4',
      's4',
      's-1',
      's1',
      'ano de servico',
      'horas',
      'pioneiro',
      'i-0',
      'i-1',
      'i-2',
      'i-4',
      'i-6',
      'is_congregated',
      'field_service_status',
      'consolidacao',
    ],
  },
  {
    topicId: 'mensageria-zapi-e-botoes',
    title: 'Mensageria WhatsApp Z-API, Publicação S-89 e 6 Invariantes de Botões',
    category: 'mensageria',
    summary:
      'O envio de S-89 depende exclusivamente do botão manual Publicar do SRVM; os lembretes D-7/D-2 exigem log `PUBLICACAO_S89 = SUCCESS` e seguem as 6 Invariantes dos botões Z-API.',
    details: [
      'Publicação Exclusiva: nenhum cron gera designações ou publica S-89 automaticamente; lembretes D-7 e D-2 verificam `PUBLICACAO_S89 = SUCCESS` antes de disparar.',
      'Resumo Desacoplado: quem possui ≥ 2 designações futuras publicadas recebe resumo adicional desacoplado (excluindo cânticos e derivadas do presidente), com debounce de 10 min e link permanente do portal.',
      '6 Invariantes dos Botões Z-API: sempre que a parte ainda está como PROPOSTA (não confirmada), o botão Confirmar é exibido obrigatoriamente; se já está DESIGNADA/confirmada, Confirmar é omitido (dando lugar a Ativar Notificações nos 3 botões do WhatsApp).',
      'Carrossel S-89 na Conversa RVM: aciona o mesmo webhook (`zapi-smart-webhook` com `CONFIRMAR:<partId>` / `RECUSAR:<partId>`) exclusivamente nos cartões do próprio publicador logado.',
    ],
    officialSource: '_ESTADO-ATUAL.md (§§ 2, 3, 43.3) / 6 Invariantes de Botões Z-API',
    keywords: [
      'z-api',
      'zapi',
      'whatsapp',
      'webhook',
      'botoes',
      'botao',
      'confirmar',
      'nao poderei',
      'publicar',
      'publicacao',
      'd-7',
      'd-2',
      'lembrete',
      'lembretes',
      'resumo desacoplado',
      'carrossel',
    ],
  },
  {
    topicId: 'aquiescencia-tacita',
    title: 'Filosofia de Aquiescência Tácita em Designações',
    category: 'mensageria',
    summary:
      'Para irmãos com múltiplos privilégios ou anciãos ocupados, o silêncio após o recebimento da designação publicada é tratado como aceite tácito até que haja recusa explícita.',
    details: [
      'O publicador recebe o cartão S-89 via WhatsApp com botões de confirmação (`CONFIRMAR:<partId>`) e aviso de indisponibilidade (`RECUSAR:<partId>`).',
      'Caso não recuse formalmente, a parte permanece programada na reunião, evitando atritos operacionais desnecessários.',
      'Lembretes corteses D-7/D-2 e os botões interativos do carrossel S-89 facilitam confirmar ou avisar com antecedência em 1 toque.',
    ],
    officialSource: 'Diretrizes de Mensageria RVM / docs/MESSAGING_PHILOSOPHY.md',
    keywords: [
      'tacita',
      'tacito',
      'aquiescencia',
      'silencio',
      'aceite',
    ],
  },
  {
    topicId: 'governanca-permissoes-e-papeis',
    title: 'Papéis Teocráticos, Permissões, CCA e Comissão de Serviço',
    category: 'permissoes',
    summary:
      'Cada usuário atua segundo suas permissões configuradas (`all`, `filtered` ou `self`) com validação no cliente (`PermissionGate`) e no servidor (`assert_agent_action` e RLS).',
    details: [
      'Invariante do CCA: o Coordenador do Corpo de Anciãos NÃO possui nem recebe status técnico de Admin de sistema — todos os irmãos são identificados fielmente pela sua função congregacional (CCA, Secretário, SS, SRVM, Ajd SRVM).',
      'Tokens da Comissão de Serviço (Fase 9): formulários administrativos vinculam `publisher_id` e `bound_email` por First-Access Binding com login Google obrigatório e bloqueio em caso de mismatch.',
      'Escopo na Conversa RVM: cada consulta e micro-ação é validada contra o `PermissionGate` do usuário logado e revalidada server-side via RPC `assert_agent_action`.',
    ],
    officialSource: '_ESTADO-ATUAL.md (§ 2 e Fase 9) / permissionService.ts',
    keywords: [
      'permissao',
      'permissoes',
      'governanca',
      'papel',
      'papeis',
      'perfil',
      'perfis',
      'cca',
      'coordenador',
      'secretario',
      'srvm',
      'superintendente',
      'comissao de servico',
      'admin',
      'acesso',
      'seguranca',
      'token',
      'permitido',
      'autorizado',
    ],
  },
  {
    topicId: 'arquitetura-abas-rvm',
    title: 'Abas, Módulos e Ações Operacionais do RVM Designações',
    category: 'sistema',
    summary:
      'O sistema unificado organiza a congregação em 9 áreas principais: Apostila (Planejamento, Relatórios e Análises), Publicadores, Territórios, Backup, Comunicação Z-API, Relatório Mensal (S-4/S-1), Admin, S-38 e UI-Chat Conversa RVM.',
    details: [
      'Aba Apostila (`workbook`): reúne os sub-painéis Planejamento (grade semanal, `Carregar Excel`, `Gerar`, `Fila NL`, `Eventos`, `Reset Período`, `Publicar`/`Despublicar`), Relatórios (`S-140`, `S-89`, `Pacote PDF`, `Disparo Status PDF`) e Análises.',
      'Botões de Fluxo Rápido no Planejamento: `Eventos`, `Fila NL`, `S-140 Pacote`, `Disparo Status PDF`, `Minhas Designações` e `Solicitar Liberação CS` (Comissão de Serviço).',
      'Aba Publicadores (`publishers`): cadastro completo, condição, função congregacional, gênero/parentesco, privilégios, seções habilitadas, pausas e datas de disponibilidade.',
      'Aba Comunicação (`communication`): disparos S-89 via WhatsApp Z-API, acompanhamento de confirmações/recusas e lembretes D-7/D-2.',
      'Aba Relatório Mensal (`monthly-reports`): cartões individuais S-4 e consolidação S-1 conforme invariantes I-0 a I-7.',
      'Aba S-38 (`s38-profiles`), Admin (`admin`), Territórios (`territories`) e Backup (`backup`): perfis sintéticos/critérios do motor, política RBAC por papel, gestão de territórios e exportação/restauração de cópia de segurança.',
    ],
    officialSource: 'Arquitetura Canônica RVM (`App.tsx` / `permissionService.ts`)',
    keywords: [
      'aba',
      'abas',
      'tela',
      'telas',
      'modulo',
      'modulos',
      'planejamento',
      'apostila',
      'menu',
      'botoes',
      'carregar excel',
      'pacote pdf',
      'reset periodo',
      'visao geral',
      'panorama',
      'funcionalidades',
      'sistema completo',
    ],
  },
  {
    topicId: 'configuracao-motor-engine-config',
    title: 'Parâmetros Configuráveis do Motor Lexicográfico (`engine_config`)',
    category: 'motor',
    summary:
      'O motor determinístico aceita 8 parâmetros calibráveis em `engine_config` (`supabase`) que ajustam janelas de rotação, garantia de estudante, alternância FSM e presidência cíclica.',
    details: [
      '`MAX_LOOKBACK_WEEKS` (padrão 52): janela histórica máxima de frescor e carga total considerada pelo motor.',
      '`HEAVY_ROLE_RADIUS` (padrão 4): raio em semanas (passado + futuro) para proximidade e cooldown de mesma parte (`M-5`/`M-7`).',
      '`ROLE_ALTERNATION_WINDOW_WEEKS` (padrão 4): janela para alternar Titular ↔ Ajudante em partes de estudante (FSM).',
      '`PAIR_REPETITION_WINDOW_WEEKS` (padrão 4): janela para evitar repetir exatamente a mesma dupla Titular + Ajudante (com bypass para parentesco direto).',
      '`ENABLE_SECTION_ROTATION_GATE` (padrão true): habilita o soft gate de rotação intra-seção (`M-7`) em Tesouros e Vida Cristã.',
      '`PRESIDENCY_CYCLE_WINDOW_WEEKS` (padrão 52): janela da fila cíclica de Presidência (`M-1`).',
      '`STUDENT_PART_GUARANTEE_WEEKS` (padrão 13) e `STUDENT_GUARANTEE_MAX_PER_WEEK` (padrão 2): garantem até 2 anciãos/SMs em jejum de estudante por semana no Balde 0 (`M-3`).',
    ],
    officialSource: 'EngineConfig (`src/types.ts` / `engine_config`)',
    keywords: [
      'engine_config',
      'parametro',
      'parametros',
      'configuracao do motor',
      'janela',
      'lookback',
      'heavy_role_radius',
      'alternancia fsm',
      'garantia 13',
      'presidencia ciclica',
    ],
  },
  {
    topicId: 'fluxo-importacao-e-publicacao',
    title: 'Ciclo de Vida da Semana: Apostila → Proposta → Aprovação → Publicação S-89',
    category: 'organizacao',
    summary:
      'Cada semana da Apostila segue uma máquina de estados rígida: importação (Excel/JW.org) → `PENDENTE` → geração automática/manual em `PROPOSTA` → aprovação para `DESIGNADA` → publicação manual do S-89 pelo SRVM → `CONCLUIDA`.',
    details: [
      '1. Importação (`PENDENTE`): carrega a grade da semana da Apostila Vida e Ministério (`workbook_parts`) com sequência, seção, tipo de parte e duração.',
      '2. Geração (`PROPOSTA`): o motor (`M-0` a `M-12`) preenche as partes designáveis sem deixar conflitos semanais nem desrespeitar M-12 (recusas).',
      '3. Revisão e Aprovação (`DESIGNADA`): o SRVM/Admin revisa, pode trocar designados manualmente (mantendo blindagem S-38/gênero) e aprova a semana.',
      '4. Publicação (`Publicar S-89` / `Pacote S-140`): somente a publicação manual dispara S-89 via WhatsApp (Z-API) e libera o status nos portais e na Conversa RVM.',
      '5. Conclusão (`CONCLUIDA`): após a reunião, as partes realizadas são baixadas e alimentam o histórico do rodízio.',
    ],
    officialSource: 'Ciclo de Vida do Workbook (`_ESTADO-ATUAL.md` / `workbookLifecycleService`)',
    keywords: [
      'ciclo',
      'fluxo',
      'publicar',
      'despublicar',
      'rascunho',
      'proposta',
      'aprovacao',
      'aprovar semana',
      'importar',
      'excel',
      'jw.org',
      'concluir',
      'limpar semana',
      'reset periodo',
    ],
  },
  {
    topicId: 'comissao-de-servico-e-anuncios',
    title: 'Comissão de Serviço (CS), Anúncios e Liberação Administrativa',
    category: 'permissoes',
    summary:
      'Eventos especiais classificados como Anúncio ou Notificação passam pelo fluxo de aprovação da Comissão de Serviço (CCA, Secretário e SS) via links com First-Access Binding (Google Login).',
    details: [
      'Botão `Solicitar Liberação CS`: gera links individuais autenticados para os 3 membros da Comissão de Serviço aprovarem ou devolverem anúncios/notificações.',
      'First-Access Binding (Fase 9): cada link grava `publisher_id` + `bound_email` no primeiro acesso autenticado e bloqueia acessos posteriores de outros e-mails.',
      'Sem intervenção no motor: anúncios (`NO_IMPACT`) não alteram designações nem tempos das partes da reunião.',
    ],
    officialSource: 'Fluxo Comissão de Serviço (`_ESTADO-ATUAL.md` Fase 9)',
    keywords: [
      'comissao de servico',
      'liberacao cs',
      'cs',
      'anuncio',
      'anuncios',
      'notificacao',
      'first access binding',
      'bound_email',
      'no_impact',
    ],
  },
  {
    topicId: 'territorios-e-backup',
    title: 'Gestão de Territórios, Backup e Proteção de Dados Sensíveis',
    category: 'sistema',
    summary:
      'Além das designações da reunião, o RVM mantém o módulo de Territórios da congregação, rotinas de Backup/Restore de registros e políticas rígidas de privacidade de publicadores.',
    details: [
      'Territórios (`territories`): organização e acompanhamento de mapas/designações territoriais pelos irmãos autorizados.',
      'Backup & Restore (`backup`): exportação e restauração segura de configurações e dados congregacionais para perfis autorizados.',
      'Proteção de Dados: dados sensíveis (telefone, e-mail, ausências/motivos pastorais) são mascarados ou ocultados conforme o nível `all`, `filtered` ou `self` do usuário autenticado.',
    ],
    officialSource: 'Módulos Unificados RVM (`permissionService.ts` / `_ESTADO-ATUAL.md`)',
    keywords: [
      'territorio',
      'territorios',
      'backup',
      'restore',
      'restaurar',
      'exportar',
      'privacidade',
      'dados sensiveis',
      'seguranca de dados',
    ],
  },
  {
    topicId: 'disponibilidade-e-autoria',
    title: 'Disponibilidade de Publicadores e Auditoria de Autoria',
    category: 'organizacao',
    summary:
      'Cada publicador possui modo de disponibilidade (`always` com `exceptionDates` de ausência, ou `never` com `availableDates`), com registro automático de autor (`availabilityMeta`).',
    details: [
      'Indisponibilidade registrada: impede que o motor ou atribuição manual escalem o publicador para a semana da data bloqueada.',
      'Autoria (`availabilityMeta` + `record_availability_change`): registra quem atualizou (`Admin`, `Agente` ou `Publicador (auto)` via Portal/Conversa RVM) e o carimbo temporal UTC.',
      'Na Conversa RVM, dizer `"vou viajar de DD/MM a DD/MM"` ou `"não poderei estar dia DD/MM"` abre a prévia para registrar as datas com segurança.',
    ],
    officialSource: 'Modelo PublisherAvailability (`src/types.ts` / `publisherAvailabilityService`)',
    keywords: [
      'disponibilidade',
      'ausencia',
      'viajar',
      'excecao',
      'exceptiondates',
      'autoria',
      'availabilitymeta',
      'indisponivel',
      'ferias',
    ],
  },
];

const QUERY_STOPWORDS = new Set([
  'para',
  'como',
  'onde',
  'qual',
  'quais',
  'quem',
  'quando',
  'sobre',
  'fazer',
  'esta',
  'este',
  'esse',
  'essa',
  'isso',
  'tudo',
  'aqui',
  'pode',
  'posso',
  'tenho',
  'minha',
  'minhas',
  'meu',
  'meus',
  'suas',
  'seus',
  'voce',
  'dela',
  'dele',
  'pelo',
  'pela',
  'nosso',
  'nossa',
  'sistema',
]);

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,:;()"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeStems(norm: string): string[] {
  return norm
    .split(' ')
    .filter((w) => w.length >= 4 && !QUERY_STOPWORDS.has(w))
    .map((w) => (w.length >= 6 ? w.slice(0, 5) : w));
}

/**
 * Pesquisa entradas relevantes por pontuação de palavras-chave exatas e radicais (stems)
 */
export function searchKnowledgeEntries(query: string, limit: number = 3): KnowledgeEntry[] {
  const norm = normalizeQuery(query);
  if (!norm) return [];

  const queryStems = tokenizeStems(norm);

  const scored = RVM_KNOWLEDGE_BASE.map((entry) => {
    let score = 0;
    const titleNorm = normalizeQuery(entry.title);
    const summaryNorm = normalizeQuery(entry.summary);

    for (const kw of entry.keywords) {
      const kwNorm = normalizeQuery(kw);
      if (norm === kwNorm) {
        score += 10;
      } else if (norm.includes(kwNorm)) {
        score += kwNorm.includes(' ') ? 6 : 3;
      }
    }

    if (norm.includes(titleNorm)) {
      score += 5;
    }

    // Casamento por radical (stem) para variações morfológicas (ex: permitido -> permit, funcionalidades -> funcion)
    if (queryStems.length > 0) {
      const searchableCorpus = `${titleNorm} ${entry.keywords.map(normalizeQuery).join(' ')} ${summaryNorm}`;
      const matchedStems = new Set<string>();
      for (const stem of queryStems) {
        if (searchableCorpus.includes(stem)) {
          matchedStems.add(stem);
        }
      }
      score += matchedStems.size * 2;
    }

    return { entry, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.entry);
}

export function findKnowledge(query: string): KnowledgeEntry | undefined {
  const norm = normalizeQuery(query);
  if (!norm) return undefined;

  // Atalhos prioritários para manter 100% de previsibilidade semântica
  if (norm.includes('tacit') || norm.includes('silencio') || norm.includes('aceite')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'aquiescencia-tacita');
  }
  if (norm.includes('genero') || norm.includes('parentesco') || norm.includes('mesmo sexo')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'regras-genero-estudantes');
  }
  if (norm.includes('rodizio') || norm.includes('desempate') || norm.includes('lexicograf')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'rodizio-e-motor');
  }

  const matches = searchKnowledgeEntries(query, 1);
  return matches[0];
}
