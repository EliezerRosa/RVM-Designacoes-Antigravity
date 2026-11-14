/**
 * Banco de Dicionários de Vocábulos Teocráticos e do RVM Designações
 * Fontes oficiais:
 *  - Instruções para a Reunião Nossa Vida e Ministério Cristão (S-38-T)
 *  - Livro Organizados para Fazer a Vontade de Jeová (od)
 *  - Biblioteca On-line da Torre de Vigia (wol.jw.org) e Apostila da Reunião (mwb)
 *  - Regras e Fluxos do Sistema RVM Designações
 *
 * Isolado de src/services/agent*. Inclui tradução humanizada para leigos e idosos.
 */

export type VocabularyCategory = 'rvm' | 's38' | 'organizados' | 'wol';

export interface VocabularyEntry {
  id: string;
  term: string;
  category: VocabularyCategory;
  synonyms: string[];
  simpleTranslation: string;
  detailedExplanation: string;
  officialSource: string;
  mappedForm?: 's140' | 's89' | 's4' | 's1';
  mappedPartType?: string;
  mappedRuleId?: string;
}

export const RVM_VOCABULARY_DICTIONARY: VocabularyEntry[] = [
  // ================= RVM & FORMULÁRIOS =================
  {
    id: 'voc-s89',
    term: 'Cartão S-89 (Designação para a Reunião)',
    category: 'rvm',
    synonyms: [
      's-89', 's89', 's 89', 'cartao', 'papelzinho', 'folhinha', 'convite da parte',
      'cartao de designacao', 'designacao da reuniao', 'folha da parte',
    ],
    simpleTranslation: 'É o "convite" oficial da sua parte na reunião. Nele vêm o seu nome, o dia, a sala e o número da parte.',
    detailedExplanation: 'O formulário S-89 (Designação para a Reunião Nossa Vida e Ministério Cristão) comunica ao estudante a data, o local (Salão Principal, Sala B ou C) e o tema/lição da parte. No RVM, você pode vê-lo no carrossel e clicar em "Confirmar" ou "Não Poderei".',
    officialSource: 'Formulário oficial S-89-T (11/23) / RVM Designações',
    mappedForm: 's89',
  },
  {
    id: 'voc-s140',
    term: 'Programação S-140 (Quadro da Reunião)',
    category: 'rvm',
    synonyms: [
      's-140', 's140', 's 140', 'quadro', 'mural', 'quadro de anuncios', 'pauta',
      'folha da reuniao', 'programacao da semana', 'escala semanal',
    ],
    simpleTranslation: 'É a folha completa com todas as partes, cânticos e nomes de quem vai participar na reunião daquela semana — igual à que fica no quadro de anúncios.',
    detailedExplanation: 'O documento S-140 reúne toda a pauta semanal (Tesouros, Ministério e Nossa Vida Cristã) com horários, temas da apostila, titulares e ajudantes.',
    officialSource: 'Documento oficial S-140-T / Apostila da Reunião (wol.jw.org)',
    mappedForm: 's140',
  },
  {
    id: 'voc-s4',
    term: 'Relatório S-4 (Relatório de Pregação Mensal)',
    category: 'rvm',
    synonyms: [
      's-4', 's4', 's 4', 'papel de horas', 'relatorio de campo', 'entregar o campo',
      'relatorio mensal', 'horas de pregacao', 'estudos biblicos',
    ],
    simpleTranslation: 'É o papelzinho (ou envio no celular) onde o publicador informa no fim do mês se pregou e quantos estudos ou horas fez (no caso de pioneiros).',
    detailedExplanation: 'Conforme instruções atuais, publicadores marcam que participaram no ministério e relatam o número de estudos bíblicos dirigidos; pioneiros auxiliares, regulares e especiais informam também as horas e estudos.',
    officialSource: 'Formulário S-4-T / Livro Organizados (od) cap. 8',
    mappedForm: 's4',
  },
  {
    id: 'voc-s1',
    term: 'Relatório S-1 (Relatório Congregacional)',
    category: 'rvm',
    synonyms: ['s-1', 's1', 's 1', 'fechamento do mes', 'relatorio da congregacao', 'relatorio para betel'],
    simpleTranslation: 'É o resumo geral que o Secretário junta de todos os irmãos no fim do mês para enviar à Filial (Betel).',
    detailedExplanation: 'O formulário S-1 consolida os totais da congregação (publicadores ativos, pioneiros, estudos bíblicos e assistência média às reuniões). Apenas anciãos (como o Secretário) tratam desse envio.',
    officialSource: 'Formulário S-1-T / Livro Organizados (od) cap. 8',
    mappedForm: 's1',
  },
  {
    id: 'voc-status-proposta',
    term: 'Status: Proposta (Pré-escalado)',
    category: 'rvm',
    synonyms: ['proposta', 'rascunho', 'em proposta', 'aguardando envio'],
    simpleTranslation: 'Quer dizer que seu nome foi sugerido na escala, mas a programação ainda está sendo revisada pelos anciãos antes de virar convite final.',
    detailedExplanation: 'Quando uma parte está em PROPOSTA, o Superintendente da Reunião ainda está conferindo ou preparando o envio dos cartões S-89. Depois que aprova e envia, o status muda para DESIGNADA.',
    officialSource: 'Fluxo de Trabalho RVM Designações',
  },
  {
    id: 'voc-status-designada',
    term: 'Status: Designada (Convite Enviado)',
    category: 'rvm',
    synonyms: ['designada', 'escalado', 'convidado', 'aguardando confirmacao'],
    simpleTranslation: 'Quer dizer que a parte já foi entregue para você e está esperando você confirmar com "Sim, confirmo" (ou avisar se não puder).',
    detailedExplanation: 'No status DESIGNADA, o cartão S-89 já está liberado. Se você confirmar, vira CONFIRMADA; se recusar, o sistema ajuda os anciãos a achar um substituto.',
    officialSource: 'Fluxo de Trabalho RVM / Webhook Z-API WhatsApp',
  },
  {
    id: 'voc-status-confirmada',
    term: 'Status: Confirmada',
    category: 'rvm',
    synonyms: ['confirmada', 'confirmado', 'aprovada', 'ja confirmei'],
    simpleTranslation: 'Quer dizer que tudo certo: você já avisou que vai fazer a parte (ou o prazo automático confirmou).',
    detailedExplanation: 'A parte está garantida na programação da semana. Agora é só se preparar com a matéria da Apostila Vida e Ministério.',
    officialSource: 'Fluxo de Trabalho RVM Designações',
  },
  {
    id: 'voc-status-pendente',
    term: 'Status: Pendente (Vaga em Aberto)',
    category: 'rvm',
    synonyms: ['pendente', 'em aberto', 'vaga', 'sem irmao', 'sem designacao'],
    simpleTranslation: 'Quer dizer que essa parte da reunião ainda não tem nenhum irmão ou irmã escolhido para fazê-la.',
    detailedExplanation: 'Partes PENDENTES precisam que um ancião ou responsável faça a designação pelo motor justo de rodízio ou manualmente.',
    officialSource: 'Fluxo de Trabalho RVM Designações',
  },
  {
    id: 'voc-status-concluida',
    term: 'Status: Concluída (Já Realizada)',
    category: 'rvm',
    synonyms: ['concluida', 'realizada', 'feita', 'ja passou'],
    simpleTranslation: 'Quer dizer que a reunião já aconteceu e aquela parte já foi apresentada no Salão.',
    detailedExplanation: 'Partes concluídas entram no seu histórico para que o rodízio saiba há quanto tempo você participou e evite repetir você cedo demais.',
    officialSource: 'Fluxo de Trabalho RVM Designações',
  },
  {
    id: 'voc-status-recusada',
    term: 'Status: Recusada / Não Poderei',
    category: 'rvm',
    synonyms: ['recusada', 'rejeitada', 'nao poderei', 'pediu troca', 'substituicao'],
    simpleTranslation: 'Quer dizer que o irmão avisou com carinho que não poderá estar disponível naquele dia e pediu outro irmão para o lugar dele.',
    detailedExplanation: 'Ao clicar em "Não Poderei" no WhatsApp ou no cartão S-89 do carrossel, a parte volta a ficar livre e os anciãos podem escalar um substituto.',
    officialSource: 'Fluxo de Trabalho RVM / Botão Não Poderei',
  },
  {
    id: 'voc-rodizio-cooldown',
    term: 'Rodízio Justo e Descanso (Cooldown)',
    category: 'rvm',
    synonyms: ['cooldown', 'rodizio', 'descanso', 'intervalo', 'frequencia', 'muito seguido'],
    simpleTranslation: 'É a regra de justiça para dar um tempo de descanso entre uma parte e outra, evitando que sempre os mesmos subam na tribuna.',
    detailedExplanation: 'O motor do RVM calcula quantos dias se passaram desde a última participação de cada irmão ou irmã e prioriza quem está há mais tempo sem parte.',
    officialSource: 'Regra de Rodízio Justo RVM',
    mappedRuleId: 'engine-ranking',
  },
  {
    id: 'voc-aquiescencia-tacita',
    term: 'Confirmação Automática na Semana da Reunião (Aquiescência Tácita)',
    category: 'rvm',
    synonyms: ['aquiescencia', 'tacita', 'confirmacao automatica', 'prazo automatico'],
    simpleTranslation: 'Quando a reunião já está perto (menos de 48 horas) e ninguém avisou nenhum imprevisto, o sistema entende que está tudo mantido.',
    detailedExplanation: 'Mesmo se o irmão esqueceu de clicar no botão, se faltarem menos de 48h para a reunião o sistema considera confirmada tacitamente. Ainda assim, confirmar antes ajuda muito os anciãos.',
    officialSource: 'Regra RVM de Confirmação e Prazos',
    mappedRuleId: 'tacit-acquiescence',
  },
  {
    id: 'voc-titular-ajudante',
    term: 'Titular e Ajudante (Morador)',
    category: 'rvm',
    synonyms: ['titular', 'ajudante', 'morador', 'fazer par', 'companheiro', 'companheira', 'sentar junto'],
    simpleTranslation: 'Titular é quem conduz a conversa ou faz o discurso; Ajudante é quem senta junto para fazer o papel de morador ou colega na demonstração.',
    detailedExplanation: 'Conforme S-38, o ajudante deve ser do mesmo sexo ou da mesma família do estudante titular (cônjuge ou parente próximo), e ajuda sem dominar a conversa.',
    officialSource: 'Instruções S-38-T, cap. 2',
    mappedRuleId: 'pairing',
  },
  {
    id: 'voc-indisponibilidade',
    term: 'Indisponibilidade (Ausência / Viagem / Saúde)',
    category: 'rvm',
    synonyms: ['indisponibilidade', 'ferias', 'viagem', 'bloqueio', 'nao vou estar', 'ausencia', 'medico', 'consulta'],
    simpleTranslation: 'É quando você avisa antecipadamente os dias em que estará viajando, doente ou ocupado para o sistema não escalar você nessas datas.',
    detailedExplanation: 'Qualquer publicador pode registrar suas datas de indisponibilidade pelo próprio perfil ou pedindo aqui no chat.',
    officialSource: 'Regra RVM de Bloqueio por Datas',
    mappedRuleId: 'unavailability',
  },

  // ================= S-38-T (INSTRUÇÕES DA REUNIÃO) =================
  {
    id: 'voc-tesouros',
    term: 'Tesouros da Palavra de Deus (Seção 1)',
    category: 's38',
    synonyms: ['tesouros', 'secao 1', 'primeira secao', 'discurso dos tesouros'],
    simpleTranslation: 'É a primeira parte da reunião de meio de semana, focada na leitura semanal da Bíblia (tem o discurso inicial de 10 min, as Joias Espirituais e a Leitura da Bíblia).',
    detailedExplanation: 'O discurso inicial de 10 minutos e as Joias Espirituais (10 min) são conduzidos por um ancião ou servo ministerial qualificado. A Leitura da Bíblia (4 min) é feita por um irmão estudante.',
    officialSource: 'S-38-T (Instruções para a Reunião Nossa Vida e Ministério Cristão)',
    mappedPartType: 'tesouros',
    mappedRuleId: 'section-tesouros',
  },
  {
    id: 'voc-joias',
    term: 'Joias Espirituais',
    category: 's38',
    synonyms: ['joias', 'joias espirituais', 'tesouros encontrados', 'perguntas e respostas da leitura'],
    simpleTranslation: 'É uma conversa de 10 minutos com perguntas para toda a assistência comentar o que aprendeu na leitura bíblica da semana.',
    detailedExplanation: 'Não há introdução nem conclusão longas; o irmão faz a pergunta da apostila sobre os versículos indicados e pergunta também o que a leitura ensinou sobre Jeová ou sobre o ministério.',
    officialSource: 'S-38-T, seção Tesouros da Palavra de Deus',
    mappedPartType: 'joias',
  },
  {
    id: 'voc-leitura-biblia',
    term: 'Leitura da Bíblia',
    category: 's38',
    synonyms: ['leitura da biblia', 'leitura biblica', 'ler a biblia', 'leitura de estudante'],
    simpleTranslation: 'Um irmão lê em voz alta um trecho da Bíblia por 4 minutos, com boa entonação e sem precisar fazer discurso antes nem depois.',
    detailedExplanation: 'Conforme S-38, apenas irmãos (estudantes homens) fazem esta parte. Começa direto na leitura bíblica e o presidente dá breves conselhos positivos em seguida.',
    officialSource: 'S-38-T, seção Tesouros da Palavra de Deus',
    mappedPartType: 'leitura',
    mappedRuleId: 'section-tesouros',
  },
  {
    id: 'voc-ministerio',
    term: 'Faça Seu Melhor no Ministério (Seção 2)',
    category: 's38',
    synonyms: ['faca seu melhor', 'ministerio', 'secao 2', 'demonstracoes', 'treino de pregacao'],
    simpleTranslation: 'É a parte prática do meio da reunião, com encenações curtas mostrando como conversar sobre a Bíblia no dia a dia.',
    detailedExplanation: 'Inclui Iniciando Conversas, Cultivando o Interesse, Fazendo Discípulos, Explicando Suas Crenças e Discurso de Estudante. Irmãs fazem demonstrações sentadas ou de pé; irmãos podem fazer demonstrações ou discursos.',
    officialSource: 'S-38-T, seção Faça Seu Melhor no Ministério',
    mappedPartType: 'ministerio',
    mappedRuleId: 'section-ministerio',
  },
  {
    id: 'voc-iniciando-conversas',
    term: 'Iniciando Conversas',
    category: 's38',
    synonyms: ['iniciando conversas', 'primeira conversa', 'primeiro contato', 'abordagem'],
    simpleTranslation: 'É uma encenação mostrando como puxar uma conversa amigável com alguém na rua, no trabalho ou de casa em casa.',
    detailedExplanation: 'Foco em mostrar interesse sincero pela pessoa e deixá-la à vontade, usando uma verdade simples da Bíblia ou deixando um convite para conversar mais.',
    officialSource: 'S-38-T / Brochura Ame as Pessoas',
    mappedPartType: 'iniciando',
  },
  {
    id: 'voc-cultivando-interesse',
    term: 'Cultivando o Interesse',
    category: 's38',
    synonyms: ['cultivando o interesse', 'revisita', 'voltar para conversar', 'continuar conversa'],
    simpleTranslation: 'É uma encenação mostrando como voltar para conversar com alguém que gostou da primeira conversa.',
    detailedExplanation: 'Responde a uma dúvida deixada antes ou mostra outro ponto bíblico prático para despertar o desejo de estudar a Bíblia.',
    officialSource: 'S-38-T / Brochura Ame as Pessoas',
    mappedPartType: 'cultivando',
  },
  {
    id: 'voc-fazendo-discipulos',
    term: 'Fazendo Discípulos',
    category: 's38',
    synonyms: ['fazendo discipulos', 'estudo biblico', 'dirigir estudo', 'seja feliz'],
    simpleTranslation: 'É uma encenação rápida de como dirigir um estudo bíblico usando o livro "Seja Feliz para Sempre!".',
    detailedExplanation: 'O foco é fazer boas perguntas e ajudar o estudante a entender e aplicar o ponto principal do parágrafo no coração.',
    officialSource: 'S-38-T / Brochura Ame as Pessoas',
    mappedPartType: 'discipulos',
  },
  {
    id: 'voc-explicando-crencas',
    term: 'Explicando Suas Crenças',
    category: 's38',
    synonyms: ['explicando suas crencas', 'explicar crencas', 'defender a fe'],
    simpleTranslation: 'Mostra como responder com educação e clareza quando alguém pergunta por que cremos ou fazemos algo segundo a Bíblia.',
    detailedExplanation: 'Pode ser em formato de conversa (para irmão ou irmã) ou pequeno discurso (apenas para irmão), sempre com respeito e base bíblica.',
    officialSource: 'S-38-T, seção Faça Seu Melhor no Ministério',
    mappedPartType: 'crencas',
  },
  {
    id: 'voc-discurso-estudante',
    term: 'Discurso de Estudante',
    category: 's38',
    synonyms: ['discurso de estudante', 'discurso de 5 minutos', 'discurso na tribuna'],
    simpleTranslation: 'É um discurso curto de 5 minutos feito por um irmão diretamente para toda a congregação na segunda seção da reunião.',
    detailedExplanation: 'Não tem ajudante. Segundo o S-38, é sempre designado para um irmão habilitado a ensinar na tribuna.',
    officialSource: 'S-38-T, seção Faça Seu Melhor no Ministério',
    mappedPartType: 'discurso',
  },
  {
    id: 'voc-nossa-vida-crista',
    term: 'Nossa Vida Cristã (Seção 3)',
    category: 's38',
    synonyms: ['nossa vida crista', 'vida crista', 'secao 3', 'ultima secao'],
    simpleTranslation: 'É a última parte da reunião, com vídeos, entrevistas, orientações práticas para a congregação e o Estudo Bíblico de Congregação.',
    detailedExplanation: 'As partes de Nossa Vida Cristã são conduzidas por anciãos ou, quando permitido, servos ministeriais qualificados.',
    officialSource: 'S-38-T, seção Nossa Vida Cristã',
    mappedPartType: 'vida crista',
    mappedRuleId: 'section-vida-crista',
  },
  {
    id: 'voc-necessidades-locais',
    term: 'Necessidades Locais',
    category: 's38',
    synonyms: ['necessidades locais', 'necessidades da congregacao'],
    simpleTranslation: 'É uma parte em que um ancião dá conselhos bíblicos específicos para ajudar a própria congregação no momento atual.',
    detailedExplanation: 'Sempre conduzida por um ancião escolhido pelo corpo de anciãos (ou fila de necessidades locais no RVM).',
    officialSource: 'S-38-T, seção Nossa Vida Cristã',
    mappedRuleId: 'necessidades-locais',
  },
  {
    id: 'voc-ebc',
    term: 'Estudo Bíblico de Congregação (EBC)',
    category: 's38',
    synonyms: ['ebc', 'estudo biblico de congregacao', 'estudo de livro', 'dirigente do ebc', 'leitor do ebc'],
    simpleTranslation: 'É o estudo de 30 minutos com perguntas e respostas no final da reunião de meio de semana, com um ancião dirigindo e um irmão lendo os parágrafos.',
    detailedExplanation: 'O dirigente deve ser um ancião qualificado e o leitor é um irmão exemplar com boa leitura fluente (anciãos, servos ministeriais ou irmãos batizados aprovados).',
    officialSource: 'S-38-T / Livro Organizados (od) cap. 7',
    mappedPartType: 'ebc',
    mappedRuleId: 'section-vida-crista',
  },
  {
    id: 'voc-presidente',
    term: 'Presidente da Reunião',
    category: 's38',
    synonyms: ['presidente', 'presidencia', 'quem preside', 'dirigir a reuniao'],
    simpleTranslation: 'É o ancião que dá as boas-vindas, apresenta cada parte, faz comentários animadores aos estudantes e garante que a reunião comece e termine no horário.',
    detailedExplanation: 'Deve ser um ancião qualificado (ou em raras exceções de necessidade, um servo ministerial muito qualificado designado pelo corpo de anciãos).',
    officialSource: 'S-38-T, Introdução',
    mappedPartType: 'presidente',
    mappedRuleId: 'president-role',
  },
  {
    id: 'voc-sala-auxiliar',
    term: 'Sala Auxiliar (Sala B / Sala C)',
    category: 's38',
    synonyms: ['sala b', 'sala c', 'sala auxiliar', 'segunda sala', 'conselheiro da sala'],
    simpleTranslation: 'É uma sala separada do Salão Principal onde alguns estudantes fazem a Leitura ou demonstrações ao mesmo tempo, para que mais irmãos possam participar.',
    detailedExplanation: 'Um ancião ou servo ministerial experiente atua como conselheiro da Sala B para elogiar e orientar os estudantes.',
    officialSource: 'S-38-T, Salas Auxiliares',
  },
  {
    id: 'voc-srvm',
    term: 'Superintendente da Reunião Vida e Ministério (SRVM)',
    category: 's38',
    synonyms: ['srvm', 'superintendente da reuniao', 'organizador da reuniao', 'irmao da escala'],
    simpleTranslation: 'É o ancião responsável por organizar a programação da semana, escolher quem faz cada parte e aprovar as escalas no sistema.',
    detailedExplanation: 'Trabalha sob a orientação do corpo de anciãos para manter a ordem, o rodízio justo e o cuidado pastoral nas designações.',
    officialSource: 'S-38-T, Introdução / Livro Organizados (od)',
    mappedRuleId: 'roles-rbac',
  },

  // ================= LIVRO ORGANIZADOS (od) & WOL.JW.ORG =================
  {
    id: 'voc-anciao',
    term: 'Ancião (Superintendente Congregacional)',
    category: 'organizados',
    synonyms: ['anciao', 'anciaos', 'corpo de anciaos', 'pastor', 'dianteira'],
    simpleTranslation: 'São irmãos maduros na fé que servem como pastores espirituais da congregação, cuidam das ovelhas e conduzem as partes de ensino principal.',
    detailedExplanation: 'Conforme o livro Organizados cap. 5, anciãos presidem reuniões, proferem discursos dos Tesouros, Necessidades Locais, dirigem o EBC e compõem a comissão que apoia a congregação.',
    officialSource: 'Livro Organizados (od) cap. 5',
    mappedRuleId: 'eligibility',
  },
  {
    id: 'voc-servo-ministerial',
    term: 'Servo Ministerial (SM)',
    category: 'organizados',
    synonyms: ['servo ministerial', 'servos ministeriais', 'sm', 'ajudante dos anciaos'],
    simpleTranslation: 'São irmãos batizados exemplares que ajudam os anciãos no cuidado prático da congregação, no som, indicadores, leitura e partes qualificadas.',
    detailedExplanation: 'Podem fazer Joias Espirituais, partes de Nossa Vida Cristã (quando designados), leitura do EBC, orações e funções mecânicas.',
    officialSource: 'Livro Organizados (od) cap. 6',
    mappedRuleId: 'eligibility',
  },
  {
    id: 'voc-cca',
    term: 'Coordenador do Corpo de Anciãos (CCA)',
    category: 'organizados',
    synonyms: ['cca', 'coordenador do corpo', 'coordenador dos anciaos'],
    simpleTranslation: 'É o ancião escolhido para coordenar as reuniões do corpo de anciãos e o andamento geral da congregação.',
    detailedExplanation: 'Faz parte da Comissão de Serviço da Congregação junto com o Secretário e o Superintendente de Serviço.',
    officialSource: 'Livro Organizados (od) cap. 5',
  },
  {
    id: 'voc-secretario',
    term: 'Secretário da Congregação',
    category: 'organizados',
    synonyms: ['secretario', 'secretaria', 'cartoes de publicador'],
    simpleTranslation: 'É o ancião que cuida dos registros da congregação, recebe os relatórios mensais S-4 e envia o fechamento mensal S-1.',
    detailedExplanation: 'Compõe a Comissão de Serviço da Congregação e acompanha novos publicadores, cartões de registro e relatórios de atividade.',
    officialSource: 'Livro Organizados (od) cap. 5 e cap. 8',
  },
  {
    id: 'voc-superintendente-servico',
    term: 'Superintendente de Serviço',
    category: 'organizados',
    synonyms: ['superintendente de servico', 'dirigente de campo', 'servico de campo'],
    simpleTranslation: 'É o ancião encarregado de incentivar e organizar a pregação, os grupos de campo e os territórios da congregação.',
    detailedExplanation: 'Compõe a Comissão de Serviço e visita periodicamente os diferentes grupos de serviço de campo.',
    officialSource: 'Livro Organizados (od) cap. 5 e cap. 9',
  },
  {
    id: 'voc-comissao-servico',
    term: 'Comissão de Serviço da Congregação (CS)',
    category: 'organizados',
    synonyms: ['comissao de servico', 'cs', 'comissao da congregacao'],
    simpleTranslation: 'É a equipe de 3 anciãos (Coordenador, Secretário e Superintendente de Serviço) que aprova petições, cartas e assuntos práticos do serviço.',
    detailedExplanation: 'No RVM, alguns fluxos de aprovação final ou relatórios congregacionais envolvem membros da Comissão de Serviço.',
    officialSource: 'Livro Organizados (od) cap. 5',
  },
  {
    id: 'voc-pioneiro',
    term: 'Pioneiro (Regular / Auxiliar / Especial)',
    category: 'organizados',
    synonyms: ['pioneiro', 'pioneira', 'pioneiro regular', 'pioneiro auxiliar', 'pioneiro especial'],
    simpleTranslation: 'É o irmão ou irmã batizado que se organiza para dedicar mais tempo mensal à pregação das boas novas.',
    detailedExplanation: 'Pioneiros regulares têm meta anual de 600 horas (50h/mês); pioneiros auxiliares podem escolher 15h (em meses especiais) ou 30h no mês.',
    officialSource: 'Livro Organizados (od) cap. 9 / Ministério do Reino',
  },
  {
    id: 'voc-publicador',
    term: 'Publicador (Batizado / Não Batizado)',
    category: 'organizados',
    synonyms: ['publicador', 'publicadora', 'irmao', 'irma', 'nao batizado', 'estudante'],
    simpleTranslation: 'É qualquer irmão ou irmã que já prega as boas novas junto com a congregação e participa na Escola/Reunião Vida e Ministério.',
    detailedExplanation: 'Publicadores batizados e não batizados aprovados podem receber partes de estudante no Ministério e na Leitura da Bíblia (conforme idade, sexo e habilitação no S-38).',
    officialSource: 'Livro Organizados (od) cap. 8',
  },
  {
    id: 'voc-eventos-especiais',
    term: 'Semana Especial (Visita do Superintendente / Assembleia / Congresso)',
    category: 'organizados',
    synonyms: ['visita', 'superintendente de circuito', 'assembleia', 'congresso', 'semana especial', 'celebracao', 'memorial'],
    simpleTranslation: 'São semanas diferentes no ano em que a programação normal muda por causa de uma visita especial ou grande evento cristão.',
    detailedExplanation: 'Na visita do Superintendente de Circuito não há Estudo Bíblico de Congregação (substituído pelo discurso de 30 min do viajante). Em semanas de Assembleia ou Congresso não há reunião de meio de semana no Salão.',
    officialSource: 'Livro Organizados (od) cap. 7 / S-38-T / wol.jw.org',
    mappedRuleId: 'special-events',
  },
  {
    id: 'voc-wol',
    term: 'Biblioteca On-line (wol.jw.org) e Apostila (mwb)',
    category: 'wol',
    synonyms: ['wol', 'wol.jw.org', 'biblioteca on-line', 'apostila', 'mwb', 'vida e ministerio', 'referencia da semana'],
    simpleTranslation: 'É o site oficial da organização onde ficam todas as matérias da semana, textos bíblicos e artigos usados nas partes.',
    detailedExplanation: 'O RVM importa diretamente da apostila (mwb / wol.jw.org) os títulos, tempos e fontes de cada semana para montar a folha S-140 e os cartões S-89.',
    officialSource: 'Biblioteca On-line da Torre de Vigia (wol.jw.org)',
    mappedRuleId: 'import-apostila',
  },
  {
    id: 'voc-organizados',
    term: 'Livro "Organizados para Fazer a Vontade de Jeová" (od)',
    category: 'organizados',
    synonyms: ['organizados', 'livro organizados', 'manual od', 'od'],
    simpleTranslation: 'É o livro oficial que explica de forma simples como a congregação funciona, os privilégios, as reuniões e a pregação.',
    detailedExplanation: 'Serve de base teocrática para permissões, papéis dos anciãos e servos ministeriais, relatórios S-4/S-1 e arranjos das reuniões semanais.',
    officialSource: 'Livro Organizados para Fazer a Vontade de Jeová (od)',
  },
];

function normVocab(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca verbetes no dicionário RVM / S-38 / Livro Organizados / WOL para uma pergunta ou palavra-chave.
 */
export function findVocabularyEntries(query: string): VocabularyEntry[] {
  const q = normVocab(query);
  if (!q) return [];
  const words = q.split(' ').filter((w) => w.length >= 2);

  const scored: Array<{ entry: VocabularyEntry; score: number }> = [];
  for (const entry of RVM_VOCABULARY_DICTIONARY) {
    let score = 0;
    const normTerm = normVocab(entry.term);
    if (q.includes(normTerm)) score += 10;

    for (const syn of entry.synonyms) {
      const normSyn = normVocab(syn);
      if (normSyn.length <= 3) {
        if (new RegExp(`\\b${normSyn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q)) {
          score += 7;
        }
      } else if (q.includes(normSyn)) {
        score += 8;
      } else {
        for (const w of words) {
          if (w.length >= 4 && normSyn.includes(w)) {
            score += 2;
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.entry);
}

/**
 * Traduz status técnicos do banco para linguagem simples, clara e acolhedora (ideal para leigos e idosos).
 */
export function humanizeStatusForLayperson(status?: string): string {
  const s = normVocab(status || '');
  if (!s) return 'Em aberto';
  if (s.includes('propost')) return 'Aguardando envio do convite (Proposta)';
  if (s.includes('designad')) return 'Escalado — aguardando você confirmar';
  if (s.includes('confirmad') || s === 'confirmed') return 'Confirmada (tudo certo)';
  if (s.includes('aprovad')) return 'Aprovada';
  if (s.includes('pendent')) return 'Vaga em aberto (sem irmão ainda)';
  if (s.includes('concluid')) return 'Já realizada na reunião';
  if (s.includes('recusad') || s.includes('rejeitad')) return 'Pediu substituição (Não Poderei)';
  if (s.includes('cancelad')) return 'Cancelada';
  return status || 'Em aberto';
}

/**
 * Traduz papéis técnicos ('titular', 'ajudante') para explicação clara.
 */
export function humanizeRoleForLayperson(role?: string): string {
  const r = normVocab(role || '');
  if (r.includes('ajudante')) return 'Ajudante (acompanha na cena)';
  if (r.includes('titular')) return 'Titular (responsável pela parte)';
  return role || 'Participante';
}

/**
 * Traduz siglas ou nomes curtos de partes para explicação amigável.
 */
export function humanizePartTypeForLayperson(partType?: string): string {
  const p = normVocab(partType || '');
  if (!p) return 'parte na reunião';
  if (p === 'ebc' || p.includes('estudo biblico')) return 'Estudo Bíblico de Congregação (EBC — estudo de 30 min no final)';
  if (p.includes('presidente')) return 'Presidente da Reunião (quem apresenta as partes)';
  if (p.includes('leitura')) return 'Leitura da Bíblia (leitura de 4 minutos na tribuna)';
  if (p.includes('joias')) return 'Joias Espirituais (perguntas sobre a leitura bíblica)';
  if (p.includes('tesouros')) return 'Tesouros da Palavra de Deus (discurso inicial da reunião)';
  if (p.includes('iniciando')) return 'Iniciando Conversas (demonstração de primeira conversa)';
  if (p.includes('cultivando')) return 'Cultivando o Interesse (demonstração de revisita)';
  if (p.includes('discipulos')) return 'Fazendo Discípulos (demonstração de estudo bíblico)';
  if (p.includes('crencas')) return 'Explicando Suas Crenças (explicar um ensino bíblico)';
  if (p.includes('oracao')) return 'Oração (inicial ou final da reunião)';
  return partType || 'parte na reunião';
}

/**
 * Simplifica jargões técnicos caso apareçam em textos retornados pela engine.
 */
export function translateTechnicalTermsForLayperson(text: string): string {
  if (!text) return text;
  const replacements: Array<[RegExp, string]> = [
    [/\bRBAC\b/g, 'permissão por perfil (ancião, servo ou publicador)'],
    [/\bCooldown\b/gi, 'tempo de descanso entre partes'],
    [/\bAQUIESCÊNCIA TÁCITA\b/gi, 'confirmação automática quando falta menos de 48h'],
    [/\bAquiescência Tácita\b/g, 'Confirmação Automática (falta menos de 48h)'],
    [/\bSRVM\b/g, 'Superintendente da Reunião (ancião organizador)'],
    [/\bCCA\b/g, 'Coordenador do Corpo de Anciãos'],
    [/\bEBC\b/g, 'Estudo Bíblico de Congregação'],
    [/\bS-89\b/g, 'Cartão da Parte (S-89)'],
    [/\bS-140\b/g, 'Folha da Programação Semanal (S-140)'],
    [/\bS-4\b/g, 'Relatório Mensal de Pregação (S-4)'],
    [/\bS-1\b/g, 'Relatório Geral da Congregação (S-1)'],
  ];
  let out = text;
  for (const [pattern, repl] of replacements) {
    out = out.replace(pattern, repl);
  }
  return out;
}
