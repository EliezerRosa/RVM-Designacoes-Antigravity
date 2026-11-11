/**
 * Base de Conhecimento Curada e Versionada — RVM Designações
 *
 * Cada explicação é fundamentada em fontes oficiais:
 * - S-38-T (Instruções para a Reunião Nossa Vida e Ministério Cristão)
 * - Livro Organizados para Fazer a Vontade de Jeová (od)
 * - Regras Algorítmicas do Motor Lexicográfico (M-0 a M-12)
 *
 * Proibido alucinar regras: se a pergunta não estiver catalogada com fonte,
 * o sistema responde honestamente que não possui a informação registrada.
 */

export interface KnowledgeEntry {
  topicId: string;
  title: string;
  category: 'motor' | 's38' | 'organizacao' | 'mensageria';
  summary: string;
  details: string[];
  officialSource: string;
}

export const RVM_KNOWLEDGE_BASE: readonly KnowledgeEntry[] = [
  {
    topicId: 'rodizio-e-motor',
    title: 'Critérios de Rodízio e Motor Lexicográfico (M-0 a M-12)',
    category: 'motor',
    summary: 'O motor de designações opera por faixas lexicográficas determinísticas (M-0 a M-12), sem pontuação aditiva cumulativa.',
    details: [
      'M-0 (Intervalo Mínimo): Respeita a regra de 2 a 3 semanas entre participações para evitar sobrecarga.',
      'M-1 (Elegibilidade Teocrática): Filtra irmãos batizados, servos ministeriais e anciãos conforme as exigências da parte.',
      'M-2 (Gênero e Parentesco): Assegura blindagem bidirecional em duplas de estudantes.',
      'M-3 (Rotação Justa): Prioriza irmãos com maior intervalo desde a última designação do mesmo tipo.',
    ],
    officialSource: 'Regras Canônicas RVM 2026-10-15.01 / .agents/workflows/motor-invariants.intent.md',
  },
  {
    topicId: 'regras-genero-estudantes',
    title: 'Gênero e Parentesco em Partes de Estudante',
    category: 's38',
    summary: 'As demonstrações de estudantes devem ser realizadas por pessoas do mesmo sexo, exceto no caso de parentes diretos.',
    details: [
      'Irmão deve ter como ajudante outro irmão; irmã deve ter como ajudante outra irmã.',
      'Exceção familiar permitida: membros da mesma família imediata (marido e esposa, pai e filha, mãe e filho).',
      'Leitura da Bíblia e Discurso de Estudante são designados exclusivamente a homens.',
    ],
    officialSource: 'S-38-T 8/26 §§ 5, 7, 8, 11 e 12 / Livro Organizados cap. 8',
  },
  {
    topicId: 'aquiescencia-tacita',
    title: 'Filosofia de Aquiescência Tácita em Designações',
    category: 'mensageria',
    summary: 'Para irmãos com múltiplos privilégios ou anciãos ocupados, o silêncio após o recebimento da designação é tratado como aceite tácito.',
    details: [
      'O irmão é notificado via WhatsApp (D-21/D-14) com imagem do S-89 e botões de confirmação.',
      'Se não houver recusa explícita, a parte permanece ativa na programação.',
      'Lembretes corteses são enviados em D-7 e D-2 para garantir prontidão sem sobrecarregar o designado com pedidos repetitivos de login.',
    ],
    officialSource: 'Diretrizes de Mensageria RVM / docs/MESSAGING_PHILOSOPHY.md',
  },
  {
    topicId: 'leitura-e-ebc',
    title: 'Leitura da Bíblia e Estudo Bíblico de Congregação (EBC)',
    category: 's38',
    summary: 'A leitura da Bíblia dura 4 minutos e é feita por um estudante homem. O EBC dura 30 minutos e é dirigido por um ancião ou servo qualificado.',
    details: [
      'O dirigente do EBC deve variar semanalmente entre os anciãos aprovados pelo Corpo.',
      'O leitor do EBC deve ser um irmão batizado com boa capacidade de leitura pública.',
      'Durante a visita do Superintendente de Circuito, o EBC é substituído pelo discurso de serviço de 30 minutos.',
    ],
    officialSource: 'S-38-T 8/26 §§ 5, 17 e 21',
  },
  {
    topicId: 'necessidades-locais',
    title: 'Parte de Necessidades Locais',
    category: 's38',
    summary: 'A parte de Necessidades Locais na Reunião Nossa Vida e Ministério Cristão é designada exclusivamente a anciãos.',
    details: [
      'Duração prevista conforme a apostila da semana (geralmente 15 minutos).',
      'Servos Ministeriais não podem ser designados para a parte de Necessidades Locais.',
    ],
    officialSource: 'S-38-T 8/26 § 16',
  },
];

export function findKnowledge(query: string): KnowledgeEntry | undefined {
  const norm = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('rodizio') || norm.includes('motor') || norm.includes('ranking') || norm.includes('criterio')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'rodizio-e-motor');
  }
  if (norm.includes('genero') || norm.includes('ajudante') || norm.includes('parentesco') || norm.includes('demonstracao')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'regras-genero-estudantes');
  }
  if (norm.includes('tacit') || norm.includes('silencio') || norm.includes('aceite')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'aquiescencia-tacita');
  }
  if (norm.includes('leitura') || norm.includes('ebc') || norm.includes('estudo biblico')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'leitura-e-ebc');
  }
  if (norm.includes('necessidades locais') || norm.includes('anciao')) {
    return RVM_KNOWLEDGE_BASE.find((k) => k.topicId === 'necessidades-locais');
  }
  return undefined;
}

