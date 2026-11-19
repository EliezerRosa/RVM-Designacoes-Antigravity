# Dossiê Arquitetural Completo — Governança Epistêmica, FinOps Multi-IDE e Pipeline Graphify + Gate Jev v3.1

> **Documento Único Exaustivo para Parecer Técnico Final — Claude Fable 5.2**  
> **Data de Consolidação**: `2026-11-18`  
> **Responsável Epistêmico**: `Eliezer Rosa`  
> **Repositório Primário**: `rvm-designacoes-unified` (branch `main`, base `e5896b6`, suíte `158/158` testes passando)  
> **Projeto Irmão Convergente**: `C:\IDE IDD Claude-VS Code\idd-ide`  
> **Genealogia Consolidada neste Dossiê**:  
> 1. Síntese Opção A + Opção B ([`memories/repo/arquitetura-finops-graphify-jev-v3.md`](arquitetura-finops-graphify-jev-v3.md));  
> 2. Parecer Empírico Argon High (Seção 8 do documento v3: 4 ajustes empíricos);  
> 3. Parecer Técnico Final Neon (5 refinamentos críticos verificados por medição real no workspace e inspeção direta do repositório `idd-ide`).  
> **Status Executável Atual**:  
> - **Graphify (`graphifyy 0.9.112` + `tree-sitter-sql==0.3.13` via `uv 0.13.9`)**: 🟢 **Ativo e Higienizado localmente** em `graphify-out/` (ignorado via `.gitignore`, `4.628` nós, `9.766` arestas, `310` comunidades — redução de `-57,6%` de ruído frente aos `10.903` nós iniciais).  
> - **Gate Jev (`scripts/jev-check.mjs`)**: ⏸️ **Em estado v2 suspenso** conforme [`.roo/rules/10-jev-verificacao.md`](../../.roo/rules/10-jev-verificacao.md) e [`memories/regras-intencao.md`](../regras-intencao.md). **Nenhuma linha de código ou hook do Git foi modificada**, aguardando o parecer do **Claude Fable 5.2** e autorização final do Responsável Epistêmico.

---

## Sumário Executivo

1. [Parte I — Taxonomia Ontológica de 4 Camadas (Separação Rigorosa)](#parte-i--taxonomia-ontológica-de-4-camadas-separação-rigorosa)
2. [Parte II — Camadas 0 e 1: Paradigma, Conceitos e Princípios Fundamentais](#parte-ii--camadas-0-e-1-paradigma-conceitos-e-princípios-fundamentais)
3. [Parte III — Camada 2: Metodologias, Disciplinas e Processos Operacionais](#parte-iii--camada-2-metodologias-disciplinas-e-processos-operacionais)
4. [Parte IV — Camada 3: Ferramentas, Modelos e Tecnologias (Especificação Concreta e Intercambiabilidade)](#parte-iv--camada-3-ferramentas-modelos-e-tecnologias-especificação-concreta-e-intercambiabilidade)
5. [Parte V — Consolidação das Auditorias e Resolução Definitiva dos 5 Pontos Críticos](#parte-v--consolidação-das-auditorias-e-resolução-definitiva-dos-5-pontos-críticos)
6. [Parte VI — Proposta Completa de Implementação (Spec Executável v3.1 + Justificativas)](#parte-vi--proposta-completa-de-implementação-spec-executável-v31--justificativas)
7. [Parte VII — Questionário Arquitetural para Parecer Final do Claude Fable 5.2](#parte-vii--questionário-arquitetural-para-parecer-final-do-claude-fable-52)

---

# Parte I — Taxonomia Ontológica de 4 Camadas (Separação Rigorosa)

## 1.1 Por que Separar Rigorosamente Paradigma, Conceitos/Princípios, Metodologias e Ferramentas

Em arquiteturas assistidas por agentes de IA, o erro estrutural mais frequente é o **colapso ontológico**: tratar uma tecnologia transitória como se fosse um princípio arquitetural, ou confundir uma disciplina operacional com um script específico. Quando esse colapso ocorre:

1. **Vendor Lock-in Disfarçado de Arquitetura**: Se o time assume que *"Governança = `scripts/jev-check.mjs` chamando `typesafe/jev-1.14` na OpenRouter"*, qualquer mudança na API alpha da OpenRouter (`HTTP 402`, depreciação de endpoint, alteração de formato) paralisa ou invalida a disciplina inteira. Quando se separa que **o Princípio** é *"Avaliação Semântica de Baixo Custo Antes da Escalação para Modelo Frontier"*, que **a Metodologia** é *"Funil em Camadas Determinístico → Topológico → Semântico em Fronteira de Lote"*, e que **a Tecnologia** atual é *"`typesafe/jev-1.14` via `openrouter.ai/api/alpha/decisions`"*, a ferramenta torna-se um adaptador substituível sem alterar a doutrina.
2. **Mimetismo de Sintoma (Confundir Artefato com Garantia)**: Instalar o binário `graphify` sem a disciplina de higienização de bundles minificados e sem distinguir direcionalidade de arestas gera ruído (`57,6%` dos nós do grafo inicial eram `pdf.worker.min.mjs` e `vercel_fetch.js`). Não basta adotar uma ferramenta: ela precisa servir a um **conceito formal** (*Raio de Impacto Direcionado Inbound*) governado por uma **metodologia** (*Curadoria e Poda de Grafo + Validação Empírica*).
3. **Alinhamento entre Repositórios Irmãos (`rvm-designacoes-unified` e `idd-ide`)**: O projeto `C:\Antigravity - RVM Designações\rvm-designacoes-unified` e o projeto `C:\IDE IDD Claude-VS Code\idd-ide` compartilham os mesmos **Camada 0 (Paradigma IDD)** e **Camada 1 (Conceitos e Princípios)**, convergem na **Camada 2 (Metodologias)**, mas operam hoje com ferramentas parciais distintas na **Camada 3** (`scripts/jev-check.mjs` + `graphifyy` de um lado; `@idd/core` + `cli/src/lib/mutationFence.ts` + `astGraph.ts` do outro). Sem essa separação de camadas, os dois projetos duplicam mecanismos ou conflitam em hooks (como o conflito descoberto entre `core.hooksPath` e o método `writeHook` de `idd-ide/cli/src/commands/init.ts`).

---

## 1.2 Arquitetura em Camadas e Lei de Inversão de Estabilidade

As quatro camadas obedecem a uma **Lei de Inversão de Estabilidade**: camadas superiores têm horizonte de permanência medido em **décadas ou anos** e raramente mudam; camadas inferiores têm horizonte medido em **trimestres, meses ou semanas** e devem ser projetadas para substituição com atrito zero. As dependências fluem **de baixo para cima** (a tecnologia materializa a metodologia, que operacionaliza princípios, que realizam o paradigma — nunca o contrário).

```mermaid
flowchart TD
    L0["CAMADA 0 — PARADIGMA & MODELO EPISTEMICO (Horizonte: Decadas)
    Intent-Driven Development (IDD): Intencao canonica prevalece sobre codigo;
    Humano = Autoridade Epistemica; Agentes = Capacidade de Execucao Restrita"]

    L1["CAMADA 1 — CONCEITOS & PRINCIPIOS FUNDAMENTAIS (Horizonte: Anos)
    12 Conceitos Formais + 10 Principios Inviolaveis (P-1 a P-10):
    Determinismo antes de Probabilidade, Fail-Closed vs Fail-Open Seletivo,
    Direcionalidade Inbound, Integridade Sintatica, Auditabilidade sem Auto-Bypass"]

    L2["CAMADA 2 — METODOLOGIAS & DISCIPLINAS OPERACIONAIS (Horizonte: Trimestres/Anos)
    FinOps em Duas Pontas, Roteamento Assimetrico Planejador-Executor,
    Funil de Verificacao em 6 Estagios, Calibracao Bi-Camada Realista,
    Rollout Shadow->Blocking, Continuidade Epistemica Multi-IDE, Storage Hibrido"]

    L3["CAMADA 3 — FERRAMENTAS, MODELOS & TECNOLOGIAS (Horizonte: Semanas/Meses)
    graphifyy 0.9.112 + tree-sitter-sql 0.3.13 | uv 0.13.9 | Node.js 22 ESM |
    typesafe/jev-1.14 (/api/alpha/decisions) | Git Pathspecs & Hooks LF |
    TypeScript 5.9 / node --test / ESLint 9 / Vite 7 | idd-ide (@idd/core, mutationFence)"]

    L0 -->|"Define autoridade e ontologia para"| L1
    L1 -->|"Restringe e parametriza"| L2
    L2 -->|"Seleciona, orquestra e substitui"| L3
```

---

## 1.3 Tabela Ontológica Comparativa Completa

| Camada | Natureza Epistêmica | Pergunta que Responde | Horizonte de Estabilidade | Critério de Substituição | O que É | O que NÃO É | Manifestação Concreta em RVM / `idd-ide` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Camada 0: Paradigma** | Filosofia de engenharia e distribuição de autoridade | *Quem detém a verdade e o que governa o software?* | **Décadas** | Ruptura de modelo computacional de desenvolvimento de software | **IDD (Intent-Driven Development)** — primazia normativa da intenção declarada sobre código e sobre IA | Não é um framework NPM, não é prompt engineering, não é metodologia ágil | `.agents/workflows/motor-invariants.intent.md`, `memories/regras-intencao.md`, `idd-ide/project.intent.yaml` |
| **Camada 1: Conceitos & Princípios** | Invariantes formais, vocabulário ontológico e leis de conservação | *Quais propriedades formais devem valer sempre, independentemente do processo?* | **Anos** | Falsificação matemática/empírica da invariante ou mudança de paradigma | Definições precisas (*Drift Semântico*, *Inbound Blast Radius*, *Mutation Fence*) e leis `P-1…P-10` | Não são passos procedimentais de checklist nem flags de CLI | Separação `Fail-Closed` (segredos/`any`/testes) vs `Fail-Open` (HTTP 402/5xx); `SHA256` quádruplo; `Inbound != Outbound` |
| **Camada 2: Metodologias & Disciplinas** | Processos repetíveis, rituais de calibração, economia e fluxo de trabalho | *Como humanos e agentes operam no dia a dia para cumprir os princípios?* | **Trimestres a Anos** | Descoberta de fluxo mais econômico, mais seguro ou com menor fricção cognitiva | FinOps em Duas Pontas, Plan-Execute Assimétrico, Funil de 6 Estágios, Calibração em 2 Camadas, Shadow $\rightarrow$ Blocking, Axioma Multi-IDE | Não está presa a um editor específico (VS Code, Cursor, Claude Code, Antigravity) nem a um provedor de LLM | Redução pré-sessão via subgrafo, gatilho estrito no fechamento de lote, atualização canônica `_ESTADO-ATUAL.md`, Storage `C:\` vs OneDrive `+U -P` |
| **Camada 3: Ferramentas & Tecnologias** | Artefatos executáveis, bibliotecas, protocolos, modelos e formatos concretos | *Qual implementação concreta executa hoje cada etapa da metodologia?* | **Semanas a Meses** | Aparecimento de alternativa mais rápida, mais barata, mais confiável ou mudança de API | `graphifyy 0.9.112`, `tree-sitter-sql`, `typesafe/jev-1.14`, OpenRouter Decisions API, `Node 22 ESM`, `tsc 5.9`, `vitest`/`node --test`, `.git/hooks/pre-commit` | Não é a fonte da regra de negócio e não pode impor limitações conceituais permanentes (ex.: `tsc -b` lento dita exclusão do hook, não abandono de tipagem) | `graphify-out/graph.json`, `scripts/jev-check.mjs`, `.claude/settings.json`, `.agents/rules/graphify.md`, `cli/src/lib/mutationFence.ts` |

---

# Parte II — Camadas 0 e 1: Paradigma, Conceitos e Princípios Fundamentais

## 2.1 Camada 0 — O Paradigma Central: IDD (Intent-Driven Development)

### Tese Central do IDD
Na engenharia pré-IA, escrever código era caro e lento; por isso, metodologias clássicas centravam-se em gerenciar a escassez de digitação e a coordenação humana em torno do código-fonte como artefato primário. Com agentes de codificação (Claude Code, Gemini/Argon/Neon no Antigravity Orchestrator, Cursor, Roo Code), o custo marginal de gerar centenas de linhas de TypeScript caiu próximo de zero.

Essa abundância inverteu o gargalo: **o novo risco dominante é a geração ultrarrápida de código sintaticamente válido, tipado e localmente plausível que viola silenciosamente regras sutis de negócio (*drift semântico*), explode custos de contexto (*token bloat*) ou rompe invariantes arquiteturais entre arquivos distantes**.

O **Intent-Driven Development (IDD)** estabelece quatro postulados paradigmáticos:

1. **Hierarquia Normativa Explícita**: Documentos de intenção canônica (`.intent.md`, `project.intent.yaml`, `memories/regras-intencao.md`) são a **fonte primária de verdade**; código-fonte e testes são **projeções executáveis derivadas**. Em caso de conflito entre o código e a intenção declarada, **o código está errado**, nunca a intenção.
2. **Separação entre Autoridade Epistêmica e Capacidade de Execução**:
   - **Autoridade Epistêmica** pertence exclusivamente ao humano (**Responsável Epistêmico**, Eliezer Rosa): somente o humano cria/altera invariantes (`M-0…M-12`, `I-0…I-7`), muda o ciclo de vida (`exploratory` $\rightarrow$ `consolidation` $\rightarrow$ `production` em `idd-ide`) ou autoriza exceções formais (*waivers*).
   - **Capacidade de Execução** pertence a múltiplos agentes e modelos heterogêneos: planejadores pesados, executores rápidos e auditores automáticos. Agentes não têm legitimidade para relaxar regras silenciosamente (ex.: converter um gate booleano em score aditivo ou remover validação bidirecional).
3. **Verificação Antecipada como Fronteira de Custo e Segurança**: Toda mutação proposta por agente deve passar por cerca de conformidade antes de contaminar o histórico do repositório ou exigir inspeção cara linha a linha por modelos frontier.
4. **Independência de Agente / Memória Epistêmica Persistente**: A inteligência operacional não reside na janela efêmera de contexto de um chat ou de uma IDE específica, mas no estado canônico versionado do projeto.

### Comparação Formal de Paradigmas

| Dimensão | **IDD (Intent-Driven Development)** | **TDD (Test-Driven Development)** | **BDD (Behavior-Driven Development)** | **DDD (Domain-Driven Design)** | **SDD (Spec-Driven Development)** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Artefato Fonte de Verdade** | Especificação de Intenção & Invariantes (`.intent.yaml`, `.intent.md`, `regras-intencao.md`) | Suíte de testes unitários (*Red-Green-Refactor*) | Cenários comportamentais (*Given-When-Then* / Gherkin) | Modelo Ubíquo + Bounded Contexts + Agregados | Especificação funcional/técnica formal (*RFC/Spec*) |
| **Autoridade em Conflito Código × Regra** | **Intenção vence sempre** (explicitado no cabeçalho canônico e travas de alteração) | Teste vence código local, mas testes podem ser reescritos com bugs por agentes | Cenário vence implementação se coberto por steps | Modelo conceitual orienta refatoração humana | Spec orienta revisão humana de PR |
| **O que Detecta Mal em Agentes Autônomos** | N/A — desenhado especificamente para agentes (impede reescrever regra, silenciar erro ou vazar segredo) | Agente altera código **e** relaxa asserções do teste simultaneamente para "ficar verde" | Não cobre invariantes internas de arquitetura (`any`, bounded contexts, locks, custos) | Não impõe gates determinísticos nem semânticos por commit em tempo real | Specs longas inflam prompt inicial sem poda topológica (custo quadrático em agentes) |
| **Mecanismo de Verificação** | Híbrido: **Determinístico** (AST, Tipos, Regex, Grafos `WRITES`) + **Semântico** (Decision API / Review) | Execução determinística de asserções | Execução de steps de aceitação | Revisão humana de design / linters modulares | Leitura comparativa humana ou LLM longo |
| **Convergência com Outros Paradigmas** | **Envolve TDD, DDD e SDD**: exige `*.test.ts` (TDD), respeita Bounded Contexts (DDD) e usa specs enxutas (~600 tokens) + grafo AST | Subconjunto de evidência executável dentro do IDD | Camada de aceitação de usuário | Linguagem ubíqua (`ubiquitous-dictionary.json` no `idd-ide`) | Evolução operacional de specs curtas e versionadas |

---

## 2.2 Camada 1 — Glossário Ontológico: Os 12 Conceitos Fundamentais

Cada termo utilizado nesta arquitetura possui significado técnico preciso:

### 1. Intenção Canônica (*Canonical Intent*)
- **Definição**: Enunciado normativo explícito, versionado e legível por humanos e máquinas que define *o que o sistema deve garantir e o que é proibido fazer*, com precedência formal sobre o código-fonte.
- **No ecossistema**: `.agents/workflows/motor-invariants.intent.md` (versão de regras `2026-11-17.01`), `memories/regras-intencao.md` (50 linhas, ~600 tokens) e `C:\IDE IDD Claude-VS Code\idd-ide\project.intent.yaml` (`global_constraints`: `G-ARCH-01`, `G-ARCH-02`, `G-SEC-01`).

### 2. Invariante Estrutural/Física vs. Invariante Semântica/de Domínio
- **Invariante Estrutural/Física**: Propriedade decidível em tempo polinomial sobre sintaxe, AST, caminhos de arquivo, tipos ou padrões lexicais sem necessidade de interpretar a intenção semântica de negócio. *Exemplos*: ausência de arquivos `.env` no stage; ausência de credenciais; ausência de `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` em `src/`; exigência de que toques em 4 serviços críticos do motor sejam acompanhados de teste unitário e bump de versão.
- **Invariante Semântica/de Domínio**: Propriedade cujo descumprimento pode estar sintaticamente perfeito e 100% bem-tipado em TypeScript, exigindo leitura contextual de significado entre regras e diff. *Exemplos*: trocar faixas lexicográficas estritas (`M-0`) por pontuação somada ponderada; quebrar ortogonalidade entre `is_congregated` e `field_service_status` (`I-0`); remover verificação bidirecional de parentesco/gênero (`2026-10-15.01`); disparar S-89 via cron automático em vez do botão "Publicar".

### 3. Drift Semântico (*Semantic Drift*)
- **Definição**: Desvio gradual ou pontual pelo qual o código passa a implementar um modelo mental diferente da Intenção Canônica enquanto continua compilando e eventualmente passando testes desatualizados ou ajustados pelo próprio agente.
- **Exemplo clássico prevenido**: Um agente corrige um erro de ordenação adicionando `+ bonus` numérico para desempatar candidatos em `rankedEligibleService.ts` — código limpo, zero erros de `tsc`, testes locais ajustados — mas violando frontalmente `M-0` (*"Não existe score numérico"*).

### 4. Cerca de Mutação (*Mutation Fence*)
- **Definição Formal (`idd-ide`)**: Mecanismo estático baseado em AST que extrai todas as mutações de estado (arestas tipadas `WRITES` em `this.campo` ou propriedades alvo) de um método/classe e as confronta com o conjunto autorizado (`allowedFields`) e proibido (`readOnlyFields`) declarados no contrato `.intent.yaml`.
- **Implementação de referência**: [`verificarCercaMutacao`](file:///C:/IDE%20IDD%20Claude-VS%20Code/idd-ide/cli/src/lib/mutationFence.ts) detectando 3 classes de violação formal: `INV-ENCAP-01` (mutação de campo read-only), `INV-UI-04` (mutação fora de `allowed_fields`) e `INV-UI-05` (mutação dinâmica não verificável estaticamente).

### 5. Grafo de Conhecimento Estrutural (*AST + SQL Knowledge Graph*)
- **Definição**: Representação formal em grafo $G = (V, E)$ onde vértices $V$ são módulos, arquivos, classes, funções, tabelas SQL e contratos, e arestas $E$ são relações tipadas (`imports_from`, `imports`, `calls`, `reads_from`, `writes_to`, `inherits`, `implements`, `triggers`, etc.) extraídas de forma **100% determinística via AST**, com **0 tokens de LLM**.

### 6. Raio de Impacto Direcionado (*Inbound Blast Radius* vs. *Outbound Dependencies*)
- **Definição Matemática**: Dado um subconjunto de arquivos alterados $F \subseteq \text{Files}(G)$ e seus nós associados $V_F = \{ v \in V \mid \text{file}(v) \in F \}$:
  $$\text{Inbound}(F) = \{ (\text{file}(u), \text{count}) \mid (u \to v) \in E,\; v \in V_F,\; \text{file}(u) \notin F \}$$
  $$\text{Outbound}(F) = \{ (\text{file}(v), \text{count}) \mid (u \to v) \in E,\; u \in V_F,\; \text{file}(v) \notin F \}$$
- **Diferença vital**: $\text{Inbound}(F)$ lista **quem chama/importa os arquivos editados** (quem sofre o impacto colateral se assinaturas ou invariantes de $F$ mudarem — verdadeiro *blast radius*). $\text{Outbound}(F)$ lista apenas **o que $F$ importa** (ex.: `src/types.ts`). Uma travessia não-direcionada confunde os dois e polui o contexto semântico enviado ao verificador.

### 7. Economia de Tokens em Duas Pontas (*Two-Ended Agentic Token Economics*)
- **Definição**: Princípio econômico segundo o qual o custo total de uma sessão agêntica é determinado multiplicativamente pela **Ponta de Entrada** (volume do contexto inicial acumulado a cada turno) e pela **Ponta de Saída** (taxa de defeito tardio que força re-ciclos de correção em modelos caros). Otimizar apenas uma ponta preserva o gargalo da outra.

### 8. Avaliação de Decisão em Passo Único (*Single Forward-Pass Decision Scoring*)
- **Definição**: Uso de um classificador discriminativo / *Decisions API* que recebe `{ regras, contexto_topologico, diff }` e avalia perguntas estruturadas (`noul` booleano contínuo, `choice` categórico com distribuição de probabilidade, `score` esperado contínuo) em um único *forward pass*, emitindo **0 tokens de texto livre explicativo** e permitindo calibração quantitativa rigorosa de limiares ($P(\text{nenhuma}), \mathbb{E}[\text{risco}]$).

### 9. *Fail-Closed* vs. *Fail-Open* Seletivo
- **Fail-Closed**: Em falha ou incerteza, **bloqueia a operação**. Obrigatório em segurança (segredos), tipagem/integridade (`any`/`@ts-ignore`), cobertura mínima (`*.test.ts` ao alterar motor) e proteções destrutivas (`DROP TABLE`).
- **Fail-Open Seletivo**: Em falha de serviço externo remoto não controlável (ex.: HTTP `402` sem créditos na OpenRouter, timeout de rede, HTTP `429`/`5xx`), **depois** que toda a camada determinística local já aprovou integralmente o diff, emite alerta explícito e **não paralisa o fluxo de trabalho local** (`Exit 0`), evitando que oscilação de API externa prenda agentes em loops de tentativa e desperdice muito mais cota no orquestrador do que a verificação economizaria.

### 10. Idempotência Criptográfica (*Content-Addressed Verification*)
- **Definição**: Propriedade pela qual um resultado de verificação aprovado é indexado pelo hash criptográfico completo de todos os determinantes de validade:
  $$H = \text{SHA-256}(\text{CacheSchemaVersion} \parallel \text{RegrasIntenção} \parallel \text{DiffCompactado} \parallel \text{ContextoDependentesAST})$$
  Garante tempo de verificação `0ms` e custo `0` tokens entre `npm run verify:jev` e `git commit`, com **invalidação automática garantida** se qualquer um dos quatro fatores mudar.

### 11. Válvula de Escape Auditável (*Auditable Waiver & Safe Anti-Loop*)
- **Definição**: Mecanismo controlado para impedir dois extremos destrutivos: rigidez cega que trava refatorações legítimas (falsos positivos) vs. permissividade silenciosa que anula o gate. Exige distinção formal entre **Waiver Explícito Declarado** (com motivo auditável gravado em log) e **Anti-Loop Probabilístico** (somente para tentativas com mutação efetiva de diff dentro de janela temporal curta — nunca para re-submissão preguiçosa do mesmo diff).

### 12. Continuidade Epistêmica Multi-IDE (*Cross-IDE Epistemic Continuity*)
- **Definição**: Capacidade de qualquer modelo ou IDE (Claude Code CLI, Antigravity Orchestrator, VS Code, Cursor, Roo Code) assumir o trabalho instantaneamente sem perda de invariantes ou contexto, sustentada pela persistência canônica versionada + estado de árvore Git limpa ao final de cada bloco lógico.

---

## 2.3 Camada 1 — Os 10 Princípios Arquiteturais Invioláveis (`P-1` a `P-10`)

| ID | Princípio Arquitetural | Justificativa Técnica e Econômica | Evidência Empírica no Ecossistema | Critério Objetivo de Conformidade |
| :-: | :--- | :--- | :--- | :--- |
| **`P-1`** | **Determinismo Antes de Probabilidade** | Toda regra verificável por Regex, AST ou conjunto não deve nunca consumir tokens, rede ou inferência probabilística. Checks determinísticos têm custo marginal `0`, latência de milissegundos, precisão `100%` e apontam linha exata do erro. | No benchmark sintético v2, `bad-1` (`: any`) e `bad-2` (`console.log` com `SECRET`) eram enviados à OpenRouter. No Gate v3.1, 100% desses casos param na Etapa 2 a `0 tokens`. | Camada 2 executa **antes** do cálculo de cache (Etapa 3) e de qualquer chamada HTTP (Etapa 4). |
| **`P-2`** | **Otimização Ortogonal das Duas Pontas de Custo** | Reduzir contexto de entrada via grafo sem barrar drift no commit deixa modelos caros corrigirem retrabalho; barrar diffs na saída sem grafo na entrada mantém sessões de dezenas de milhares de tokens por turno. | Economia combinada projetada no RVM: `40%–65%` na entrada (Graphify, `593,4×` na busca) + `10%–20%` na saída (Gate Jev) = `~50%–75%` total. | Ambas as pontas devem permanecer operacionais e desacopladas por contrato. |
| **`P-3`** | **Fronteira Rígida entre *Fail-Closed* e *Fail-Open* Seletivo** | Segurança (`2a`), tipagem (`2b`) e testes obrigatórios do motor (`2c`) não podem jamais passar em caso de falha (*fail-closed*). Já indisponibilidade externa (HTTP 402/5xx/timeout) em check probabilístico **não** pode bloquear commits locais cujo Gate Determinístico já passou, sob pena de induzir loops agênticos mais caros que o risco residual. | Incidente real de `2026-10-16`: esgotamento de créditos OpenRouter (`HTTP 402`, `limit_source: "openrouter_credits"`) + Exit 2 bloqueante em `jev-check.mjs` v2 parava toda esteira. | `2a/2b` retornam `Exit 1` sem bypass; `2c` sem teste retorna `Exit 1`; Etapa 4 sob `402/429/5xx/timeout` retorna `Exit 0` com `[JEV-WARN]`. |
| **`P-4`** | **Verificação Exclusivamente em Fronteira de Lote** | Agentes em trabalho intermediário deixam temporariamente o código incompleto (edita serviço $\rightarrow$ cria teste $\rightarrow$ roda checks). Disparar verificação probabilística por edição de arquivo (`PostToolUse`) ou em pausa conversacional (`Stop` genérico) gera explosão de falsos positivos e faturamento multiplicado. | Decisão consolidada nos 7 pilares (Pilar 4): hooks por arquivo/pausa multiplicam chamadas descartáveis. | Nenhum hook `PostToolUse` ou `Stop` genérico pode invocar API externa; apenas `verify:jev` explícito e `.git/hooks/pre-commit`. |
| **`P-5`** | **Invalidação Criptográfica Quádrupla** | Deduplicação de verificação só é segura se **qualquer** alteração no esquema do avaliador, nas regras de negócio, no diff ou no subgrafo de dependentes invalidar o cache imediatamente. | Chave `SHA-256(schemaVersion + regras + diffCompactado + contextoDependentesAst)` em `.tmp/jev-cache.json`. | Editar `regras-intencao.md`, o diff ou `graphify-out/graph.json` gera hash distinto e evita falso *Cache Hit*. |
| **`P-6`** | **Direcionalidade Estrita de Impacto (`Inbound` de Produção)** | Para avaliar risco de regressão de uma mudança no arquivo $F$, importa **quem consome $F$** (`Inbound`), e não o que $F$ importa (`Outbound`), nem scripts ad-hoc/testes que inflacionariam ruído. | Auditoria direta em `graphify-out/graph.json`: para `eligibilityService.ts`, busca não-direcionada misturava `src/types.ts` (7 arestas *outbound*) e scripts `scripts/agent-check-score.ts` / `audit-score-aliases.ts` com os verdadeiros consumidores (`rankedEligibleService.ts`, `PublisherSelect.tsx`, `generationService.ts`). | O extrator aceita exclusivamente arestas `(source -> target)` onde `target` pertence a $F$ e `source.file` pertence a `^(src\|api\|supabase)/` (excluindo `*.test.*`). |
| **`P-7`** | **Preservação de Integridade Sintática no Payload** | Cortar strings de diff no meio de funções ou hunks (`slice(0, 16000)`) cria sintaxe quebrada/incompleta que engana modelos avaliadores, provocando falsos positivos artificiais. | Definido no Parecer Argon High (§8.2 #3) e refinado no Parecer Neon (Parte V #3). | Compactação opera exclusivamente por fronteiras completas de arquivo/hunk em 2 degraus (`14 KB` / `24 KB`), ordenados por criticidade; se mesmo 1 arquivo crítico exceder `24 KB`, faz *fail-open* auditado em vez de mutilar código. |
| **`P-8`** | **Auditabilidade Estrita sem Brecha de Auto-Bypass** | Toda exceção operacional precisa deixar rastro estruturado, e proteção anti-loop nunca deve permitir que repetir o mesmo comando sem tentativa real de correção drible o verificador sem justificativa. | Auditoria Neon sobre `streak >= 2`: sem exigir `diffHash !== prevDiffHash` e TTL, dois `git commit` seguidos sem editar nada burlavam o gate em silêncio. | Mesmo diff repetido exige `JEV_BYPASS_REASON`; destravamento automático por `streak >= 2` só vale se `diffHash` mudou entre as tentativas dentro de **15 min**, sempre gravando `.tmp/jev-bypass.log`. |
| **`P-9`** | **Isolamento de Privacidade, Segredos e Armazenamento Híbrido** | Dados pessoais (LGPD), integrações privadas locais, tokens e caches efêmeros nunca podem entrar em grafo compartilhado, memória de agentes ou repositório público; artefatos binários pesados nunca podem ficar em código versionado nem forçar download indevido do OneDrive. | 3 reescritas históricas de 2026-11-07; `.rooignore` protegendo `.env*`; `.graphifyignore` podando `6.276` nós espúrios; junções OneDrive `+U -P`. | Segredos bloqueados em Etapa 2a (zero bypass); dados sensíveis isolados por `.gitignore` + `.rooignore` + `.graphifyignore`. |
| **`P-10`** | **Componibilidade Agnóstica de IDE e Convergência com `idd-ide`** | Nenhuma regra de verificação pode depender de extensão proprietária ou sequestrar mecanismos do Git de modo incompatível com ferramentas futuras do ecossistema. | Inspeção direta de `idd-ide/cli/src/commands/init.ts` (`writeHook` L275–284): `idd init` grava e faz *append* apenas em `.git/hooks/pre-commit`. | Usar `.git/hooks/pre-commit` padrão (sem `core.hooksPath`, sem `exit 0`/`exec` terminal) em `LF`, e exportar `runJevGate()` como módulo reutilizável para `idd verify`. |

---

# Parte III — Camada 2: Metodologias, Disciplinas e Processos Operacionais

Todas as metodologias descritas nesta Parte III são **agnósticas às tecnologias da Parte IV**. Caso amanhã o Graphify seja substituído por outro parser AST ou a Decisions API da OpenRouter seja substituída por um classificador local ONNX/Qwen, os processos abaixo continuam integralmente válidos.

## 3.1 Metodologia de FinOps Agêntico Multi-IDE

### Modelo Econômico de Custo de Sessão Agêntica
Uma sessão típica de engenharia com agente autônomo executa $T$ turnos sequenciais (em média $T \in [8, 25]$ por tarefa média). Em arquiteturas de chat com histórico acumulado, o custo total $C_{\text{sessão}}$ comporta-se como:

$$C_{\text{sessão}} = \sum_{t=1}^{T} \Big( (I_0 + \Delta I_t) \cdot p_{\text{in}}(m_t) + O_t \cdot p_{\text{out}}(m_t) \Big) + R_{\text{retrabalho}}$$

onde:
- $I_0$: contexto base carregado no início (system prompt + docs canônicos + código lido na exploração);
- $\Delta I_t$: crescimento acumulado por leituras extras e saídas de `grep`/testes até o turno $t$;
- $p_{\text{in}}(m_t), p_{\text{out}}(m_t)$: preço por token do modelo ativo no turno $t$;
- $R_{\text{retrabalho}}$: custo multiplicador quando um erro semântico ou de tipagem só é descoberto ao final e obriga reabrir uma nova sequência de turnos em modelo caro.

**Conclusão matemática direta**:
1. Cada `50 KB` (~12.500 tokens) economizados na exploração inicial ($I_0$) via consulta estrutural ao grafo em vez de leitura integral de arquivos grandes multiplica a economia por todos os $T$ turnos subsequentes (mesmo considerando *prompt caching*, leituras dispersas e reinjeções invalidam prefixos frequentemente).
2. Cada violação de domínio interceptada antes de chegar à revisão humana ou ao planejador evita um ciclo inteiro de $R_{\text{retrabalho}}$.

### Evidência Financeira Histórica do Projeto
Conforme registrado em [`memories/session/governanca-jev-v2-regras-intencao-e-finops-ia.md`](../session/governanca-jev-v2-regras-intencao-e-finops-ia.md):
- Em **2026-10-16**, ciclos de contexto pesado no Roo Code com `Claude 3.5 Sonnet` combinados com rodadas de calibração produziram um gasto de **`US$ 23,06` em um único dia**, culminando no esgotamento de créditos pré-pagos da conta (`HTTP 402`, `limit_source: "openrouter_credits"`).
- O incidente provou empiricamente que ter teto em uma API key não impede queima de saldo quando: (a) agentes operam sem corte de exploração de contexto na entrada e (b) falhas de infraestrutura no hook/ferramenta criam loops de retentativa em modelos frontier.

### Disciplina de Roteamento Assimétrico & Tiering de Modelos (4 Níveis)

| Nível | Executor / Classe de Tarefa | Custo Marginal Típico | Quando Usar | Exemplo no Fluxo |
| :-: | :--- | :---: | :--- | :--- |
| **Nível 0 — Determinístico Local** | Parser AST, SQL Tree-Sitter, Regex, `tsc`, `node --test`, `eslint`, SHA-256 | **`$0.000`** (`0` tokens) | Toda tarefa decidível formalmente | Graphify (`--code-only`), Gate Etapa 2 (`2a–2d`), Cache SHA-256 |
| **Nível 1 — Discriminativo Passo Único** | Classificador / Decisions API (`p` + `score`, 0 tokens de output) | **Frações de centavo** (`< $0.002/chamada`) | Julgamento de conformidade `{ regras, dependentes, diff }` no fechamento de lote | Gate Jev Etapa 4 (`typesafe/jev-1.14`) |
| **Nível 2 — Modelo Rápido / Executor Econômico** | Modelos Flash / V3 / Execução guiada por plano fechado | **`$0.14–$0.30 / 1M` input** (~95% abaixo de frontier) | Execução de edições bem especificadas, triagens, automações e webhook | Modo Execution após Plan Mode; Gemini 2.0 Flash / DeepSeek V3 |
| **Nível 3 — Modelo Frontier / Planejador** | Opus / Argon High / Neon Orchestrator / Fable | Alto (reservado) | Decisões arquiteturais, planejamento ambíguo, revisão crítica, impasses após 2 falhas | Modo Plan, RFCs, pareceres técnicos, redesign de invariantes |

### Projeção de Economia Líquida em Sessões Completas (Premissas Explícitas)
*(Premissa: uma sessão real continua pagando custos fixos inevitáveis de system prompt, leitura obrigatória de `_ESTADO-ATUAL.md`, execução de testes e build; por isso a economia líquida de sessão fica abaixo do `593,4×` observado em consultas isoladas ao grafo).*

| Perfil de Uso / IDE | Economia Real com **Ponta de Entrada (Grafo)** | Ganho Adicional com **Ponta de Saída (Gate Lote)** | Economia Líquida Combinada Esperada |
| :--- | :---: | :---: | :---: |
| **Claude Code (`PreToolUse` redirecionando `Grep`/`Read`)** | **45% a 65%** | **+10% a +20%** | **~55% a 75%** |
| **Antigravity IDE (Orchestrator Plan-Execute: Planejador + Executor)** | **40% a 55%** | **+10% a +20%** | **~50% a 70%** |
| **IDE em Modelo Único (VS Code / Cursor / Roo)** | **35% a 50%** | **+5% a +15%** | **~45% a 65%** |
| **Auditorias, RCA de Bugs e Análise de Impacto** | **70% a 85%** | *(foco em leitura)* | **~70% a 85%** |
| **Alteração pontual em 1 arquivo já conhecido** | **5% a 15%** | **+0% a +5%** *(trava local gratuita)* | **~5% a 20%** |

---

## 3.2 Metodologia do Funil de Verificação em 6 Estágios (Funil FinOps)

A metodologia organiza as verificações em ordem estrita de **custo crescente e generalidade decrescente**: cada estágio filtra tudo o que consegue pelo menor custo possível antes de acionar o estágio seguinte.

1. **Estágio 0 — Exploração Orientada por Grafo (Pré-Edição)**: Antes de modificar código em área não trivial, o agente consulta o subgrafo local (0 tokens de API) para identificar consumidores *inbound*, contratos e god-nodes envolvidos.
2. **Estágio 1 — Coleta Seletiva & Curto-Circuito de Não-Código (Fechamento de Lote)**: Ao rodar verificação em stage/worktree, exclui ruídos (`*.lock`, `*.snap`, arquivos gerados, tipos auto-gerados, `.md` fora de governança). Se o conjunto resultante de mutações de código estiver vazio, aprova em `0ms` / `0 tokens`.
3. **Estágio 2 — Portão Determinístico Local (0 Tokens, Pré-Cache)**: Executa todas as travas físicas de segurança (`2a`), higiene de linguagem (`2b`), co-evolução estrutural de motor+teste+versão (`2c`) e integridade de contratos/migrações SQL (`2d`), interrompendo violações óbvias antes mesmo de gastar disco/hash/rede.
4. **Estágio 3 — Enriquecimento Topológico *Inbound*, Compactação Íntegra e Cache Criptográfico**: Extrai do grafo local os arquivos de produção que efetivamente dependem dos arquivos editados (tom neutro, `< 100 tokens`), compacta diffs muito grandes sem jamais cortar hunks no meio e consulta o cache local endereçado por conteúdo (`SHA-256` quádruplo).
5. **Estágio 4 — Julgamento Semântico Probabilístico Resiliente**: Submete `{ regras_enxutas, contexto_dependentes_ast, diff_integro }` para avaliação em passo único com timeout estrito (`12s`). Falhas externas (`402/429/5xx/timeout/sem-chave`) degradam graciosamente para alerta não bloqueante (*fail-open*).
6. **Estágio 5 — Decisão Calibrada, Auditoria e Destravamento Seguro**: Avalia probabilidades contra limiares calibrados; registra sucesso em cache; em falha, registra tentativa e aplica regras rígidas de waiver (`JEV_BYPASS_REASON`) ou anti-loop condicional (`diffHash !== prevDiffHash` + TTL 15 min) com trilha de auditoria persistente.

---

## 3.3 Metodologia de Calibração Empírica de Gates Probabilísticos

Um gate probabilístico nunca deve operar com limiares arbitrados por intuição. No histórico do projeto, a transição do Gate v1 para o v2 demonstrou por que a calibração é decisiva:
- No **v1**, exigir `noul >= 0.8` reprovava falsamente diffs válidos médios mesmo com `violacao = 'nenhuma'`, enquanto aceitar `risco < 2` permitia que `bad-2.patch` (vazamento explícito de `SUPABASE_SERVICE_ROLE_KEY` e `SECRET` em `console.log`, com `risco = 1.57..1.67`) passasse aprovado!
- No **v2**, calibrado com [`results-v2.json`](../../.tmp/jev/results-v2.json) em 6 fixtures × 5 execuções (`30/30`):
  - **OK patches** (`ok-1..3`): `pNenhuma ∈ [0.94, 0.99]`, `risco ∈ [0.00, 0.02]`, `pRiscoBaixo ∈ [0.99, 1.00]`.
  - **BAD patches** (`bad-1..3`): `pNenhuma ∈ [0.00, 0.02]`, `risco ∈ [1.57, 1.94]`, `pRiscoBaixo ∈ [0.00, 0.06]`.

### Crítica Metodológica — O Viés de Fixture Sintética Trivial
Entretanto, a inspeção direta das fixtures originais em `.tmp/jev/*.patch` na revisão final (Neon) expôs uma limitação metodológica grave que impede considerar os `30/30` suficientes para v3.1:
1. Todas as 6 fixtures operam em `src/lib/fake/*.ts` (~500 bytes cada), arquivos inexistentes em `graphify-out/graph.json`. Portanto, testar essas fixtures em v3 deixa `contexto_dependentes_ast` vazio.
2. `bad-1.patch` (`parse.ts`, `: any`) e `bad-2.patch` (`supabaseClient.ts`, `console.log(..., key, secret)`) serão agora interceptados na **Etapa 2 determinística**, antes sequer de chegar à API.
3. `bad-3.patch` (`designar.ts`) continha um comentário explicito entregando a resposta ao avaliador (`// Simplificação: qualquer um serve, inclusive inativos e sem privilégio.`), o que não representa um erro sutil real produzido por um agente moderno tentando preservar aparência legítima.

### Protocolo Obrigatório de Calibração em 2 Camadas (v3.1)
1. **Camada A (Regressão Determinística Local)**: Cobertura `100%` dos casos físicos (`2a`, `2b`, `2c`, `2d`, `bad-1`, `bad-2`) em testes unitários locais determinísticos sem rede.
2. **Camada B (Micro-Calibração Semântica Realista)**: Executar `typesafe/jev-1.14` com `contexto_dependentes_ast` **real preenchido do grafo local** sobre:
   - **5 diffs reais** extraídos de commits históricos recentes do `git log` (ex.: `e5896b6`, `6a80ea8`, `27aaafc`, + 2 commits de serviço/componente);
   - **2 a 3 mutações sutis realistas** introduzidas sem comentários óbvios em serviços reais (`eligibilityService.ts` somando score numérico em vez de bucket lexicográfico, ou `rm` misturando `is_congregated` com `field_service_status`, ou cron disparando S-89 direto).
   - **Critério de aprovação**: `0` falsos positivos nos commits reais limpos (ou identificação exata de margem mínima $\ge 0.15$ abaixo de `0.90` nos defeitos sutis e $\ge 0.92$ nos limpos), confirmando que `contexto_dependentes_ast` não distorce `pNenhuma`/`risco`. Custo total dessa bateria única: `< $0.01`.

### Política de Assimetria de Erro
Em produtividade agêntica, **um falso negativo** em regra sutil de domínio costuma ser capturado posteriormente em revisão/testes de integração, enquanto **falsos positivos recorrentes** em commits válidos ensinam agentes/usuários a contornar o hook (`--no-verify`) ou entrar em ciclos caros de reescrita. Por isso os limiares (`pNenhuma >= 0.90 && risco < 1.0`) combinados com *fail-open* em indisponibilidade de rede e anti-loop seguro priorizam alta precisão semântica em cima de uma camada determinística implacável (`100%` *fail-closed* para segurança/tipagem/testes).

---

## 3.4 Metodologia de Rollout Seguro (4 Fases Graduais)

Nenhuma política bloqueante em Git hooks é ligada diretamente em produção sem validação observacional:
1. **Fase 0 — Construção Offline & Suíte Unitária com Mocks**: Código + `14` testes unitários passando a custo `$0` sem hook ativo.
2. **Fase 1 — Micro-Calibração Semântica Realista**: Execução controlada da Camada B gerando `.tmp/jev/results-v3.json`.
3. **Fase 2 — Shadow Mode (`--warn-only`)**: Hook/script ativo emitindo relatórios completos sem retornar `Exit 1` para a camada probabilística (apenas Etapa 2 bloqueia segredos/`any`), durante `~10` commits reais ou `1` semana, coletando métricas objetivas: taxa de curto-circuito `.md`, taxa de *Cache Hit*, tempo médio de hook, falsos positivos da Etapa 4 e comportamento de `contexto_dependentes_ast`.
4. **Fase 3 — Blocking Mode & Convergência `idd-ide`**: Ativação plena de `Exit 1` na Etapa 4 (preservando sempre *fail-open* em `402/5xx/timeout` após Etapa 2 aprovada) e integração programática no fluxo `idd verify`.

---

## 3.5 Metodologia de Continuidade Epistêmica Multi-IDE e Armazenamento Híbrido

### Protocolo Obrigatório de Transição de Sessão / IDE (Axioma Irreversível)
1. **Início de Sessão (Read-First)**: Qualquer agente/IDE lê primeiramente `_ESTADO-ATUAL.md` e `memories/repo/_ESTADO-ATUAL.md` (e consulta `graphify` para mapa de código) antes de editar qualquer arquivo.
2. **Fechamento de Bloco Lógico**: Antes de encerrar o turno ou trocar de IDE/agente:
   - Executar os verificadores nativos (`npm test`, `npm run build` / `npm run verify:jev` quando ativo);
   - Atualizar estado canônico em `_ESTADO-ATUAL.md` e `memories/repo/_ESTADO-ATUAL.md` (+ notas locais quando aplicável, fora do remoto público);
   - Atualizar o grafo AST incremental (`graphify update .`) após edições de código para manter `graph.json` sincronizado;
   - Commitar e enviar (`git push origin main`), deixando `git status` 100% limpo.

### Governança de Armazenamento SSD vs. OneDrive (1 TB)
O ecossistema separa código-fonte ativo (em `C:\`, 3 projetos ativos apenas) de artefatos binários pesados via **Junções NTFS (`mklink /J`)** apontando para OneDrive (`attrib +U -P` automático a cada 15 min via tarefa agendada), mantendo invariantes operacionais obrigatórias:
- **Proibido** criar `node_modules`, `.venv` ou `.git` ativo dentro de pastas sincronizadas em nuvem;
- **Proibido** executar `grep` ou varredura binária recursiva sobre pastas desidratadas (evita hidratação forçada do SSD local);
- A governança de grafo (`.graphifyignore`) reflete essa regra excluindo `.pdf`, `.xlsx`, imagens, backups e pastas locais pesadas.

---

## 3.6 Metodologia de Convergência Evolutiva (`RVM Designações` → `idd-ide`)

Em vez de aguardar a conclusão integral da extensão VS Code do `idd-ide` para obter governança real, o projeto adota uma **estratégia de validação pragmática ascendente**:
1. Os padrões empíricos validados em `rvm-designacoes-unified` (separação determinístico vs. semântico, extração *inbound* AST, hooks componíveis em `LF` no Windows, cache criptográfico e fronteira *fail-closed/fail-open*) tornam-se requisitos concretos de campo.
2. Os pontos de atrito descobertos no `idd-ide` (ex.: `writeHook` fazendo append diretamente em `.git/hooks/pre-commit`) moldam antecipadamente o contrato do RVM para que o futuro comando `idd verify --fail-on=critical` incorpore `runJevGate()` nativamente sem quebra nem duplicação de hooks.

---

# Parte IV — Camada 3: Ferramentas, Modelos e Tecnologias (Especificação Concreta e Intercambiabilidade)

## 4.1 Matriz Mestra de Ferramentas × Camadas × Substitutos

| Componente / Tecnologia | Versão / Contrato Atual | Papel Metodológico que Executa | Evidência Empírica / Métrica Real | Riscos e Limites Conhecidos | Substitutos Diretos (Sem Alterar Camadas 0–2) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Graphify + Tree-Sitter SQL** | `graphifyy 0.9.112`, `tree-sitter-sql 0.3.13`, `uv 0.13.9` | Construção determinística de Grafo AST+SQL (`0` tokens API) & Subgrafo de Entrada | `4.628` nós, `9.766` arestas, `310` comunidades (`744`–`747` arq.); `~593,4×` redução em busca isolada; extrator JSON em JS `~20–45ms` | Requer `graphify update .` após edições; defasado para arquivos novos ainda não indexados | Parser TS Compiler API puro (`@idd/core` / `astGraph.ts`), `ts-morph`, Zoekt + SCIP (`scip-typescript`) |
| **TypeSafe Jev via OpenRouter** | `typesafe/jev-1.14` em `POST /api/alpha/decisions` | Julgamento semântico de domínio em *single forward-pass* | `30/30` em fixtures v2 (`ok 0.94–0.99`, `bad 0.00–0.02`, gap `0.88`, `< 2s`) | Endpoint `/api/alpha/decisions` alpha; sujeito a `HTTP 402/429/5xx` ou mudança de schema | Classificador OpenAI/Anthropic *structured outputs* (`logprobs`), Qwen/Llama local via Ollama, DeBERTa fine-tuned |
| **Node.js 22+ ESM Nativo** | Node `>= 22`, zero deps externas (`node:fs`, `node:crypto`, `fetch`) | Motor de execução do Gate (`scripts/jev-check.mjs`), hashing e CLI/API programática | Boot `< 50ms`, zero impacto em `node_modules` nem em `npm ci` | Sem compilador AST próprio embutido (usa Regex em diff + leitura do JSON do Graphify) | Deno, Bun, ou módulo TypeScript dentro do pacote `@idd/core` |
| **Git + `.gitattributes` + `.git/hooks/pre-commit`** | Git for Windows (`sh.exe`, `core.autocrlf=true`) | Interceptação universal Multi-IDE em fronteira de commit + pathspecs nativos | `-c core.quotepath=false` + `:(exclude)` preserva Unicode no Windows; hook `LF` evita `/bin/sh^M` | `core.hooksPath` quebraria `idd init`; `exec`/`exit 0` mataria blocos anexados após o hook | GitHub Actions PR gate obrigatório, Lefthook, Husky (em projetos Node puros) |
| **TypeScript `5.9.3` (`tsc -b`) + `node --test` + `ESLint 9` + `Vite 7`** | `typescript ~5.9.3`, `tsx 4.21`, `eslint 9.39`, `vite 7.2` | Validação sintática, contratual de tipos, regressão comportamental e bundle | `npm test`: `158/158`; **`tsc -b` medido em `20,89s–24,42s`** (sem cache incremental real por `noEmit: true` sem `incremental`) | Lento demais para `pre-commit` síncrono e avalia worktree em vez de stage (*partial staging*) | `tsgo` (TypeScript nativo Go), SWC/oxc type-check futuro, `tsc --incremental` habilitado + cache CI |
| **Multi-IDE Hooks & Rules** | `.claude/settings.json`, `.agents/rules/*`, `.rooignore` | Proteção de leitura/busca em sessão e isolamento de privacidade entre IDEs | `.claude/settings.json` intercepta `Bash\|Grep` e `Read\|Glob`; `.rooignore` protege `.env*` e `.tmp/` | `.gitignore` não impede leitura por extensão IDE; exige `.rooignore` e `.graphifyignore` espelhados | Hooks MCP/LSP nativos da extensão VS Code `idd-ide` (`@idd/core`) |

---

## 4.2 Análise Detalhada das Tecnologias Atuais (Baseada em Medições Diretas)

### A. Graphify (`graphifyy 0.9.112`) e Schema Empírico de `graphify-out/graph.json`

1. **Modo Operacional Sem Custo (`0` Tokens)**:
   Embora o Graphify possua modo semântico via LLM, no RVM ele opera **estritamente em modo determinístico local**:
   ```powershell
   $env:GRAPHIFY_BACKEND = "none"
   graphify . --code-only
   graphify cluster-only . --no-label
   ```
   A indexação AST cobre TypeScript/TSX/JS e SQL (via `tree-sitter-sql==0.3.13`), gerando `graphify-out/graph.json`, `GRAPH_REPORT.md` e `graph.html` localmente (pasta ignorada pelo Git via `.gitignore`).

2. **Higienização Comprovada (`.graphifyignore`)**:
   Na primeira geração, o grafo atingiu **`10.903` nós**, **`23.044` arestas** e **`435` comunidades** porque dois artefatos gigantes distorciam toda a topologia: `public/pdf.worker.min.mjs` (`3.378` nós) e `vercel_fetch.js` (`2.840` nós) — juntos **`6.218` nós (`57%` do grafo)** — colocando `vP()`, `XFAObject`, `ot` e `Ns` como god-nodes falsos do sistema.
   Após adicionar ao [`.graphifyignore`](../../.graphifyignore) as entradas `public/pdf.worker.min.mjs`, `*.min.js`, `*.min.mjs`, `vercel_fetch.js`, `*_aa0414e*` (além de `node_modules/`, `dist/`, pastas locais privadas/de isolamento, backups, territórios estáticos e ativos pesados como `.pdf`, `.xlsx` e imagens), o grafo limpo estabilizou em **`4.628` nós, `9.766` arestas e `310` comunidades** (`< 5.000` nós, destravando renderização individual de nós no `graph.html`), com Top 10 god-nodes 100% aderentes ao domínio: `@supabase/supabase-js`, `Publisher`, `WorkbookPart`, `react`, `dotenv`, `supabase`, `profiles`, `HistoryRecord`, `ZApiOrchestrator`, `useAuth()`.

3. **Schema Verificado e Distribuição Real de Arestas (Inspeção Direta de `graphify-out/graph.json`)**:
   O arquivo JSON segue o padrão NetworkX 3.7 `node_link_data`:
   - `nodes[]`: `{ id: string, label: string, source_file: string, source_location: string, community: number, _origin: string, _callable?: boolean, file_type?: string }`
   - `links[]`: `{ source: string, target: string, relation: string, source_file: string, source_location: string, confidence: string, weight: number }`
   - **Inventário exato das 19 relações presentes nos `9.766` links atuais**:
     `contains` (`3.353`), `imports_from` (`1.935`), `imports` (`1.718`), `calls` (`1.450`), `references` (`320`), `rationale_for` (`182`), `writes_to` (`170`), `reads_from` (`129`), `method` (`119`), `indexes` (`79`), `uses` (`66`), `dynamic_import` (`53`), `declares` (`49`), `inherits` (`41`), `indirect_call` (`35`), `triggers` (`24`), `executes` (`20`), `re_exports` (`18`), `implements` (`5`).

4. **Por que o Extrator JS Direcionado Supera Subprocesso CLI no Hook**:
   Chamar o binário Python `graphify query` a cada `git commit` adicionaria custo de startup de interpretador Python + carga de dependências. Ler `graphify-out/graph.json` diretamente no Node.js em memória leva `~20–45ms` e permite filtrar direcionalmente apenas arestas *inbound* originadas em código de produção.

### B. TypeSafe Jev (`typesafe/jev-1.14`) via OpenRouter Decisions API

1. **Contrato da API (`POST https://openrouter.ai/api/alpha/decisions`)**:
   Envia `{ model: 'typesafe/jev-1.14', state: { regras, contexto_dependentes_ast, diff }, questions }`, onde `questions` declara exatamente 3 avaliações estruturadas:
   - `conforme` (`type: 'noul'`): medida contínua informativa `[0..1]` (*não* decide aprovação sozinha);
   - `violacao` (`type: 'choice'`): `nenhuma | segredos | estilo | dominio` com probabilidades discretas (`probabilities.nenhuma`);
   - `risco` (`type: 'score'`): escala `['Baixo', 'Médio', 'Alto']` mapeada em `0..2` (`score` esperado contínuo).
2. **Baseline Calibrado (`results-v2.json`)**:
   - `ok-1.patch` (`datas.ts`): `pNenhuma ∈ [0.94, 0.97]`, `risco = 0.01`, `pRiscoBaixo = 0.99`.
   - `ok-2.patch` (`contagem.ts`): `pNenhuma = 0.99`, `risco ∈ [0.00, 0.01]`, `pRiscoBaixo = 1.00`.
   - `ok-3.patch` (`formatarNome.ts`): `pNenhuma ∈ [0.97, 0.99]`, `risco ∈ [0.01, 0.02]`, `pRiscoBaixo = 0.99`.
   - `bad-1.patch` (`: any`): `pNenhuma = 0.00`, `risco ∈ [1.91, 1.94]`, `violacao = 'estilo'`.
   - `bad-2.patch` (`console.log` com `SERVICE_ROLE_KEY` e `SECRET`): `pNenhuma = 0.02`, `risco ∈ [1.57, 1.67]`, `violacao = 'segredos'`.
   - `bad-3.patch` (remoção de filtro de elegibilidade): `pNenhuma ∈ [0.00, 0.01]`, `risco ∈ [1.79, 1.91]`, `violacao = 'dominio'`.

### C. Medição Empírica Real de `tsc -b` no Workspace (`tsconfig.app.json` e `tsconfig.node.json`)

A revisão inicial (Seção 8.2 #2) assumiu que rodar `npx tsc -b` dentro do `.git/hooks/pre-commit` custaria apenas `~1,5s–2s` com cache incremental. A medição direta executada neste repositório provou o oposto:
- `npx tsc -b` (execução fria, 0 arquivos editados): **`20,89s`**;
- `npx tsc -b` (execução quente imediata, 0 arquivos editados): **`24,42s`**;
- `.\node_modules\.bin\tsc.cmd -b` (invocação direta sem overhead do `npx`): **`22,75s`**.

**Causa Raiz Verificada nos Configs Reais**:
Tanto [`tsconfig.app.json`](../../tsconfig.app.json) quanto [`tsconfig.node.json`](../../tsconfig.node.json) definem `"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.*.tsbuildinfo"` combinado com **`"noEmit": true` sem `"incremental": true` e sem `"composite": true`**. Como consequência, os arquivos gravados em `node_modules/.tmp/` têm apenas `14.315 bytes` (`tsconfig.app.tsbuildinfo`) e `65 bytes` (`tsconfig.node.tsbuildinfo`), e o TypeScript `5.9.3` reexecuta verificação completa a cada chamada (`~22s`), além do problema estrutural de o `tsc -b` inspecionar o **working tree completo** enquanto um `pre-commit` deve aprovar ou reprovar apenas o **Git index (*staged*)**.

### D. Integração Real Observada no Projeto `idd-ide`

A inspeção direta de `C:\IDE IDD Claude-VS Code\idd-ide` confirmou os pontos exatos de interface entre os dois projetos:
1. [`project.intent.yaml`](file:///C:/IDE%20IDD%20Claude-VS%20Code/idd-ide/project.intent.yaml): organiza o sistema em 5 bounded contexts (`core` `@idd/core`, `cli`, `extension`, `ui-extension`, `pwa`), governa `lifecycle_status.phase` (`exploratory` / `consolidation` / `production`) com tetos de duração para waivers (`30 / 14 / 7` dias) e severidade progressiva (`warn` $\rightarrow$ `critical`).
2. [`cli/src/lib/mutationFence.ts`](file:///C:/IDE%20IDD%20Claude-VS%20Code/idd-ide/cli/src/lib/mutationFence.ts): exporta `verificarCercaMutacao` usando o grafo AST de `cli/src/lib/fase0/astGraph.ts`.
3. [`cli/src/lib/fase0/graphify.ts`](file:///C:/IDE%20IDD%20Claude-VS%20Code/idd-ide/cli/src/lib/fase0/graphify.ts): já foi renomeado e convertido em shim `@deprecated` apontando para `astGraph.ts` especificamente para **eliminar colisão de nomenclatura com a ferramenta externa `safishamsi-graphify`** (`graphifyy`).
4. [`cli/src/commands/init.ts`](file:///C:/IDE%20IDD%20Claude-VS%20Code/idd-ide/cli/src/commands/init.ts) (`writeHook` linhas `130–155` e `275–284`): grava explicitamente no caminho fixo `.git/hooks/pre-commit` e, se o arquivo já existir sem a string `'IDD IDE'`, **anexa (`existing + '\n' + lines.join('\n')`)** os comandos de `idd verify --fail-on=critical` ao final do hook existente. Isso impõe duas restrições inegociáveis para o RVM: **nunca** desviar `core.hooksPath` do diretório `.git/hooks/` e **nunca** terminar o script de `pre-commit` com `exit 0` ou `exec ...`, sob pena de tornar os futuros checks do `idd-ide` código morto silencioso.

---

# Parte V — Consolidação das Auditorias e Resolução Definitiva dos 5 Pontos Críticos

## 5.1 Evolução Completa das 3 Rodadas de Revisão (A+B → Argon High → Neon)

| Tópico Técnico | Proposta Inicial (Síntese A+B) | Revisão Empírica 1 (Argon High — Seção 8) | Revisão Empírica Final 2 (Neon — Spec v3.1) | Justificativa Final da Decisão |
| :--- | :--- | :--- | :--- | :--- |
| **Qualidade do Grafo Local** | `10.903` nós direto de `graphify .` | Poda de `pdf.worker.min.mjs`, `vercel_fetch.js`, `*.min.*`, `*_aa0414e*` $\rightarrow$ grafo `< 5.000` nós (**Já aplicado**) | Confirmado e mantido (`4.628` nós, `9.766` arestas, `310` comunidades) | Eliminou `57,6%` de ruído minificado sem custo de API |
| **Direcionalidade do Blast Radius** | Percorrer `links` pegando qualquer `source_file` diferente do editado | Renomear campo para `contexto_dependentes_ast` (tom neutro, `< 100` tokens) | **Refinamento 1**: Filtrar **estritamente arestas inbound** (`target ∈ editado`, `source.file ∈ {src/, api/, supabase/}`, sem `scripts/` nem `*.test.*`) | Evita misturar dependências *outbound* (`src/types.ts`) ou scripts auxiliares ad-hoc com consumidores de produção afetados |
| **`tsc -b` no Hook `pre-commit`** | Rodar `npm run type-check` no hook | Rodar `npx tsc -b` condicionalmente quando houver `.ts/.tsx` (~`1,5–2s` estimado) | **Refinamento 2 (Refutação empírica)**: **Remover `tsc -b` do `pre-commit`**; manter em `npm run verify:all` | Benchmark real deu **`20,89s–24,42s`** (sem `"incremental": true`), além de `tsc` checar worktree e quebrar *partial staging* |
| **Trava 2a (Segredos)** | Apenas `.env*`, `sk-or-v1-` e `VITE_*` | Remover opção de bypass em `2a` e `2b` | **Refinamento 3a**: Ampliar `2a` para cobrir `bad-2.patch` (`console.log` de `SERVICE_ROLE`/`SECRET`), `sk-proj-`, `ghp_`, `github_pat_`, `AIzaSy`, JWT literal, usando marcador linha-a-linha `// jev-pattern-literal` em `jev-check.mjs` | A especificação anterior deixava passar `bad-2.patch` na Etapa 2a e isentava o arquivo `jev-check.mjs` inteiro em vez de apenas suas linhas de padrão |
| **Trava 2c & 2d (Motor, Intenção, SQL)** | `2c` exigindo versão + teste com `JEV_BYPASS_REASON` | Ausência de `*.test.*` bloqueia duro (`Exit 1`); ausência só de versão exige bypass auditado | **Refinamento 3b**: Adicionar `2d` (editar `*.intent.md` exige `JEV_BYPASS_REASON`; `DROP TABLE\|DROP SCHEMA\|DROP FUNCTION\|TRUNCATE` em migrations exige `ROLLBACK_SQL` + `JEV_BYPASS_REASON`) | Cobre regras críticas de [`memories/regras-intencao.md`](../regras-intencao.md) L34 e L36 a custo `0` tokens |
| **Compactação de Diffs Grandes** | Cortar diff em `16.000` chars | 2 degraus: `> 14 KB` resume testes; `> 24 KB` seleciona arquivos inteiros sem cortar hunks | Mantido e **refinado**: ordenar seleção do 2º degrau por criticidade de domínio; se 1 único arquivo crítico exceder `24 KB`, *fail-open* auditado (`Exit 0` + `[JEV-WARN]`) | Nunca envia hunk cortado ao meio (zero erro sintático artificial) |
| **Válvula `streak >= 2` e Cache** | Destrava após 2 erros idênticos no mesmo arquivo+violação | Mantido com `.tmp/jev-bypass.log` | **Refinamento 4**: Exigir **`diffHash !== prevDiffHash`** + **TTL 15 min** para auto-destravamento de `streak >= 2`; adicionar `CACHE_SCHEMA_VERSION = 'v3'` e poda de 30 dias | Impede burla trivial por duplo `git commit` sem alterar o código |
| **Compatibilidade com `idd-ide`** | Hook `scripts/git-hooks/pre-commit` + `LF` | `.gitattributes` `text eol=lf` (`core.autocrlf=true` verificado) | **Refinamento 5**: Instalar em `.git/hooks/pre-commit` (sem `core.hooksPath`), terminar sem `exit 0` nem `exec`, e exportar `runJevGate(options)` | Preserva compatibilidade total com `writeHook` (append) e futura integração com `idd verify` |

---

## 5.2 Respostas Definitivas aos 5 Pontos Originais da Seção 7

1. **Ponto 1 — Impacto de `state.contexto_dependentes_ast` na calibração v2 (`0.90` / `1.0`)**:
   Manter inicialmente `LIMIAR_NENHUMA = 0.90`, `LIMIAR_RISCO = 1.0` e o rótulo neutro `contexto_dependentes_ast` (sem o termo bélico *"blast"* que pode enviesar o modelo de risco). Contudo, porque a calibração v2 usou apenas 6 arquivos fictícios (`src/lib/fake/*.ts`) ausentes do grafo real e com comentários óbvios em `bad-3.patch`, **é obrigatório executar a Micro-Calibração Semântica da Fase 1 (5 diffs reais do `git log` + 2 mutações sutis reais em serviços reais com `contexto_dependentes_ast` populado)** antes de habilitar o modo bloqueante.

2. **Ponto 2 — Estratégia de `tsc -b` no `pre-commit`**:
   **Não incluir `tsc -b` no hook `pre-commit` síncrono.** Com medição real de `20,89s–24,42s` por invocação somada ao conflito de *partial staging*, `tsc -b` no hook penaliza todo commit de forma desproporcional e falha em estágios parciais. Manter `npm run type-check` no fechamento de lote (`npm run verify:all` / `build:full`) e deixar o `pre-commit` executar apenas `node scripts/jev-check.mjs --staged` (`< 50ms` em curto-circuito/cache hit, `~1,5s` quando chama Decisions API). Se futuramente `tsconfig.app.json`/`node.json` migrarem para `"incremental": true` e a latência cair para `< 3s` verificados em disco, reavaliar.

3. **Ponto 3 — Truncamento inteligente vs. diffs `> 14–24 KB`**:
   Adotar a compactação íntegra em 2 degraus sem jamais cortar um hunk ao meio:
   - Degrau 1 (`> 14.000` chars): substitui o conteúdo completo de blocos `*.test.ts(x)` por `[Testes validados localmente no diff: <lista>]` (mantendo-os integralmente validados na Etapa 2);
   - Degrau 2 (`> 24.000` chars): ordena os hunks/arquivos restantes por prioridade arquitetural (`1º` motor e migrações SQL; `2º` demais `src/services/` e `supabase/functions/`; `3º` `src/components/` e `api/`) e inclui apenas **arquivos inteiros** que caibam em `24.000` chars; caso nem o primeiro arquivo crítico caiba, faz *fail-open* gracioso com `[JEV-WARN]` após aprovação da Etapa 2 determinística.

4. **Ponto 4 — `scripts/` no payload e auto-inspeção de `scripts/jev-check.mjs`**:
   - **Etapa 4 (API Semântica)**: restringir `codeDiff` a `src/`, `supabase/` e `api/`, excluindo `scripts/` para não causar falsos positivos por literais de padrão dentro de `scripts/jev-check.mjs` nem por scripts ad-hoc legados.
   - **Etapa 2a (Segredos)**: varrer inclusive `scripts/`, mas **sem isentar `scripts/jev-check.mjs` por inteiro**. Apenas linhas explícitas marcadas com `// jev-pattern-literal` (ou padrões compostos) ficam isentas, garantindo que nenhum token colado acidentalmente dentro do próprio script consiga passar.

5. **Ponto 5 — Reaproveitamento e compatibilidade entre `rvm-designacoes-unified` e `idd-ide`**:
   Garantida em dois planos:
   - **Plano de Hook Git**: `.gitattributes` impõe `eol=lf` nos hooks em `scripts/git-hooks/`, o instalador `scripts/install-git-hooks.mjs` copia/atualiza em `.git/hooks/pre-commit` preservando blocos externos e **sem `exit 0`/`exec` no fim**, e nunca define `core.hooksPath`. Assim, quando `idd init` rodar no repositório no futuro, anexará `idd verify --fail-on=critical` de forma 100% componível.
   - **Plano de API de Módulo**: `scripts/jev-check.mjs` expõe `export async function runJevGate(options)` desacoplado de `process.argv`/`process.exit`, permitindo ao `cli` ou `@idd/core` do `idd-ide` invocar o avaliador diretamente como extensão semântica da `mutationFence`.

---

# Parte VI — Proposta Completa de Implementação (Spec Executável v3.1 + Justificativas)

> **Nota de Status**: Esta especificação serve de contrato exato de implementação para o ciclo posterior ao parecer do **Claude Fable 5.2**. Nenhuma modificação foi gravada nos arquivos executáveis ainda.

## 6.1 Fluxograma Definitivo do Pipeline Gate Jev v3.1

```mermaid
flowchart TD
    A["Fechamento de Lote: npm run verify:jev ou .git/hooks/pre-commit"] --> B["1. Coleta Git (-c core.quotepath=false)
    - allChangedFiles (--name-only)
    - scanDiff (src/, supabase/, api/, scripts/ sem locks/snaps/generated/.md)
    - apiDiff (apenas src/, supabase/, api/)"]

    B --> C{"allChangedFiles sem .env* nem .intent.md/DROP e apiDiff+scanDiff vazios?"}
    C -- "Sim (apenas docs/*.md/memorias)" --> Z0["Exit 0 (Curto-circuito 0ms / 0 tokens)"]

    C -- "Nao" --> D2a["2a. Segredos em allChangedFiles + scanDiff (+)
    (ignora linha com // jev-pattern-literal)"]
    D2a -- "Violou segredo" --> X1["Exit 1 BLOQUEIO DURO (Zero bypass)"]

    D2a -- "Limpo" --> D2b["2b. Estilo TS em src/** exceto *.test.ts(x)
    (any, @ts-ignore, @ts-expect-error, eslint-disable fora comentarios)"]
    D2b -- "Violou estilo" --> X1

    D2b -- "Limpo" --> D2c{"2c. Tocou 4 servicos criticos do motor?"}
    D2c -- "Sim, sem *.test.ts(x)" --> X1
    D2c -- "Sim, c/ teste mas sem bump Versao" --> D2cB{"JEV_BYPASS_REASON?"}
    D2cB -- "Nao" --> X2["Exit 1 (Exige bump de versao ou motivo tecnico)"]
    D2cB -- "Sim" --> L2["Grava .tmp/jev-bypass.log"]
    D2c -- "Limpo ou Nao tocou" --> D2d{"2d. Editou *.intent.md ou DROP/TRUNCATE SQL?"}
    L2 --> D2d

    D2d -- "DROP sem ROLLBACK_SQL ou sem JEV_BYPASS_REASON" --> X2
    D2d -- "Ok" --> E0{"apiDiff vazio (so scripts/)?"}
    E0 -- "Sim" --> Z0
    E0 -- "Nao" --> E1["3a. extractInboundDependents(graphify-out/graph.json)
    Estritamente INBOUND em src/, api/, supabase/ (<100 tokens, ~30ms)"]

    E1 --> E2["3b. buildBoundedPayload(apiDiff):
    <=14KB integral | >14KB omite corpo de testes | >24KB arquivos inteiros por prioridade"]
    E2 --> E2ov{"Unico arquivo critico > 24KB?"}
    E2ov -- "Sim" --> W0["Imprime [JEV-WARN] + Exit 0 (Fail-Open pos Gate Local)"]
    E2ov -- "Nao" --> E3["3c. SHA256(CACHE_SCHEMA_VERSION + regras + diffCompactado + contexto_dependentes_ast)"]

    E3 --> E4{"HIT em .tmp/jev-cache.json?"}
    E4 -- "Sim (0ms / 0 tokens)" --> Z0
    E4 -- "Nao" --> F["4. POST /api/alpha/decisions (typesafe/jev-1.14, timeout 12s)"]

    F -- "Sem API Key / HTTP 402 / 429 / 5xx / Timeout" --> W1["Imprime [JEV-WARN: Fail-Open Infra] + Exit 0"]
    F -- "pNenhuma >= 0.90 e risco < 1.0" --> S["Salva Cache SHA-256 + limpa streak + Exit 0"]
    F -- "Reprovado Semantico" --> Y0{"JEV_BYPASS_REASON presente?"}

    Y0 -- "Sim" --> L5["Grava .tmp/jev-bypass.log + Exit 0"]
    Y0 -- "Nao" --> Y1{"streakKey bate, TTL <= 15min e diffHash != prevDiffHash (streak >= 2)?"}
    Y1 -- "Sim" --> L5
    Y1 -- "Nao" --> X3["Atualiza streak(diffHash, ts) + Exit 1 (ou Exit 0 se --warn-only)"]
```

---

## 6.2 Arquitetura Modular e Contratos de `scripts/jev-check.mjs` (v3.1)

O arquivo deve ser escrito em **Node.js 22+ ESM puro** (`node:fs`, `node:path`, `node:crypto`, `node:child_process`, `fetch` nativo) com separação nítida entre o núcleo testável (`export async function runJevGate(...)` + helpers puros exportados) e o wrapper CLI (`if (isMain) { ... process.exit(code); }`).

### Inventário de Funções e Especificação Técnica

#### 1. `collectFilteredDiff({ mode, diffPath, rulesPath, projectRoot })`
- **Responsabilidade**: Coletar exatamente o conjunto de arquivos e patches no escopo da execução.
- **Comportamento**:
  - Se `mode === 'file'`: lê `<diffPath>` como no v2, extraindo os nomes dos cabeçalhos `diff --git a/... b/...`.
  - Se `mode === 'staged'` ou `'worktree'`:
    - Usa `execFileSync('git', ['-c', 'core.quotepath=false', 'diff', ...], { maxBuffer: 25 * 1024 * 1024 })` para evitar truncamento de paths acentuados no Windows (ex.: `RVM Designações`, arquivos com cedilha/til) e proteger contra overflow de buffer.
    - Argumento base: `'--cached'` em `--staged` ou `'HEAD'` em `--worktree`.
    - Coleta `allChangedFiles`: `--name-only` sem filtro de pasta (necessário para detectar `.env*`, `*.intent.md` e migrações onde quer que estejam).
    - Coleta `scanDiff` (`--unified=3 -- src/ supabase/ api/ scripts/` com pathspecs de exclusão `:(exclude)*.lock`, `:(exclude)*lock.json`, `:(exclude)*.snap`, `:(exclude)*generated*`, `:(exclude)*supabase_types.ts`, `:(exclude)*.md`).
    - Coleta `apiDiff` (mesmos pathspecs, mas **sem `scripts/`**).
- **Justificativa**: Separa de forma limpa o escopo de auditoria física local (`allChangedFiles + scanDiff`) do escopo semântico de código de produto (`apiDiff`), resolvendo o Ponto 4.

#### 2. `runDeterministicGate({ allChangedFiles, scanDiff, projectRoot, bypassReason })`
Executa 4 verificações sequenciais a **0 tokens**:

- **Subetapa `2a` — Segredos (Hard Fail — Zero Bypass)**:
  1. Bloqueia qualquer arquivo em `allChangedFiles` cujo caminho case com `/(^|\/)\.env(\.|$)/i` e **não** case com `/\.env\.example$/i`.
  2. Analisa apenas linhas adicionadas (`+`, ignorando `+++`) em cada arquivo de `scanDiff`.
  3. Ignora uma linha **somente** se estiver dentro de `scripts/jev-check.mjs` **e** contiver explicitamente o comentário marcador `// jev-pattern-literal` (ou `scripts/jev-check.test.mjs`).
  4. Padrões bloqueados:
     - Prefixos reais de credenciais: `/\b(sk-or-v1-|sk-proj-|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIzaSy[A-Za-z0-9_-]{20,})/`
     - JWT literais: `/eyJhbGciOi[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/`
     - Exposição frontend indevida: `/\bVITE_[A-Z0-9_]*(SERVICE_ROLE|OPENROUTER|ZAPI|SECRET|PRIVATE|TOKEN)[A-Z0-9_]*\b/`
     - Vazamento de variáveis sensíveis em logs (cobre exatamente `.tmp/jev/bad-2.patch`): `/console\.(log|info|debug|warn|error)\s*\([^)]*(SERVICE_ROLE_KEY|OPENROUTER_API_KEY|API_KEY|PRIVATE_KEY|\bSECRET\b|\bPASSWORD\b)/i`
  5. **Saída em falha**: Lista arquivo, número/trecho mascarado e retorna `{ blocked: true, bypassable: false, stage: '2a', findings }`.

- **Subetapa `2b` — Higiene TypeScript em `src/**` (Hard Fail — Zero Bypass)**:
  1. Escopo restrito a arquivos `^src/.*\.(ts|tsx)$`, **excluindo** arquivos de teste (`\.test\.tsx?$`) e arquivos `.d.ts`.
  2. Para cada linha adicionada (`+`), descarta linhas puras de comentário (`^\s*(\/\/|\/\*|\*|\*\/)`).
  3. Detecta: `/@ts-ignore|@ts-expect-error|eslint-disable|:\s*any\b|\bas\s+any\b/`.
  4. **Justificativa**: Espelha literalmente a convenção de `memories/regras-intencao.md` L29–30 mantendo os mesmos arquivos e regras sem falsos positivos em comentários explicativos ou testes legados.

- **Subetapa `2c` — Co-evolução do Motor de Designações**:
  1. Dispara se `allChangedFiles` tocar qualquer um dos 4 arquivos críticos:
     - `src/services/eligibilityService.ts`
     - `src/services/rankedEligibleService.ts`
     - `src/services/unifiedRotationService.ts`
     - `src/services/generationService.ts`
  2. Verifica presença de ao menos um arquivo `^src/.*\.test\.tsx?$` em `allChangedFiles`. Se ausente $\rightarrow$ `{ blocked: true, bypassable: false, stage: '2c-test' }` (**bloqueio duro, sem bypass**).
  3. Verifica se há alteração nas constantes de versão (`ELIGIBILITY_RULES_VERSION` no diff do motor e `RULES_TEXT_VERSION` em `contextBuilder.ts` ou no diff). Se presente teste, porém ausente bump de versão $\rightarrow$ `{ blocked: true, bypassable: true, stage: '2c-version' }` (aceita `JEV_BYPASS_REASON` para fixes puramente técnicos/de tipo como ocorreu no commit `6a80ea8`, gravando auditoria em `.tmp/jev-bypass.log`).

- **Subetapa `2d` — Governança de Contratos `.intent.md` & Segurança SQL Destrutiva**:
  1. Se `allChangedFiles` contiver `.agents/workflows/.*\.intent\.md$`: exige `JEV_BYPASS_REASON` declarando autorização explícita do Responsável Epistêmico (`memories/regras-intencao.md` L36).
  2. Para todo arquivo `^supabase/migrations/.*\.sql$` adicionado/modificado: se suas linhas `+` contiverem `/\b(DROP\s+(TABLE|SCHEMA|FUNCTION|VIEW)|TRUNCATE)\b/i`, exige presença de comentário `--\s*ROLLBACK_SQL` no arquivo **e** `JEV_BYPASS_REASON`; ausência de `ROLLBACK_SQL` é bloqueio duro sem bypass (`memories/regras-intencao.md` L34–35).

#### 3. `extractInboundDependents(graphPath, changedFiles, { maxDeps = 10 })`
- **Responsabilidade**: Calcular deterministicamente em JavaScript puro os arquivos de produção impactados pelas mudanças.
- **Algoritmo Exato**:
  ```js
  // 1. Se graphPath não existir ou estiver ilegível -> retorna fallback gracioso sem quebrar o hook
  // 2. Carrega JSON uma única vez (~20-45ms para 4.628 nós / 9.766 links)
  // 3. Normaliza todos os source_file substituindo '\\' por '/'
  // 4. Constrói changedSet = new Set(changedFiles.map(norm))
  // 5. Constrói nodeFileById = Map<node.id, norm(node.source_file)> e targetIds = Set(nós cujo file ∈ changedSet)
  // 6. Itera links:
  //    SE targetIds.has(link.target) && link.source:
  //      srcFile = nodeFileById.get(link.source) || norm(link.source_file)
  //      SE srcFile && !changedSet.has(srcFile)
  //         && /^(src|api|supabase)\//.test(srcFile)
  //         && !/\.test\.tsx?$/.test(srcFile):
  //        incrementa contagem e registra tipo de relação (calls/imports_from/writes_to...)
  // 7. Ordena decrescente por nº de arestas, toma top maxDeps=10 e formata linhas neutras (< 100 tokens)
  ```
- **Formato exato da string `contexto_dependentes_ast`**:
  ```text
  Consumidores estaticos (inbound AST) dos arquivos alterados:
  - src/services/rankedEligibleService.ts (14 refs: calls, imports_from)
  - src/components/ActionControlPanel.tsx (9 refs: calls, imports_from)
  - src/components/PublisherSelect.tsx (9 refs: calls, imports_from)
  ...
  ```
- **Justificativa**: Tom neutro (sem palavras alarmistas), direção estritamente *inbound* (Ponto 1 e `P-6`), exclui ruído de `scripts/` e testes, e nunca quebra quando o arquivo alterado acabou de ser criado e ainda não consta no grafo.

#### 4. `buildBoundedPayload(apiDiff, { softCap = 14000, hardCap = 24000 })`
- **Algoritmo**:
  1. Divide `apiDiff` em blocos por arquivo no padrão `/^diff --git /m` (preservando cada bloco intacto).
  2. Se `apiDiff.length <= softCap`: retorna `{ diffForApi: apiDiff, overflowFailOpen: false, strategy: 'full' }`.
  3. **Degrau 1 (`> 14.000` chars)**: Separa blocos de teste (`\.test\.tsx?$`) dos demais; substitui o corpo dos testes por um cabeçalho enxuto `[Testes unitarios modificados validados localmente: <lista de arquivos>]`. Se o resultado couber em `hardCap`, retorna `{ diffForApi: stage1, overflowFailOpen: false, strategy: 'tests-summarized' }`.
  4. **Degrau 2 (`> 24.000` chars)**: Ordena os blocos não-teste remanescentes por **prioridade arquitetural**:
     - Prioridade 1: `supabase/migrations/`, os 4 serviços do motor e `historyAdapter.ts`/`contextBuilder.ts`;
     - Prioridade 2: demais `src/services/`, `supabase/functions/`, `api/`;
     - Prioridade 3: `src/components/`, `src/features/`, demais `src/`.
     Acumula **apenas arquivos inteiros** enquanto `accumulated.length + block.length <= hardCap`.
  5. **Salvaguarda de Integridade**: Se mesmo após resumir testes nenhum arquivo de código inteiro couber em `hardCap` (ex.: um arquivo crítico com diff > 24 KB), retorna `{ diffForApi: '', overflowFailOpen: true, strategy: 'overflow-fail-open' }`, acionando `[JEV-WARN]` + `Exit 0` em vez de enviar sintaxe mutilada.

#### 5. `computeCacheKey`, `readCache`, `writeCache` (`.tmp/jev-cache.json`)
- Constante explícita `const CACHE_SCHEMA_VERSION = 'v3.1';`.
- `cacheKey = sha256([CACHE_SCHEMA_VERSION, regrasRaw, diffForApi, contextoDependentesAst].join('\n---JEV_SEP---\n'))`.
- Estrutura JSON em `.tmp/jev-cache.json`:
  ```json
  {
    "schemaVersion": "v3.1",
    "entries": {
      "<sha256>": { "aprovado": true, "ts": 1795046400000, "pNenhuma": 0.96, "risco": 0.01 }
    },
    "streaks": {
      "<streakKey>": { "count": 1, "lastDiffHash": "<sha256_diff>", "lastTs": 1795046400000, "violacao": "dominio" }
    }
  }
  ```
- **Política de Higiene**: Antes de gravar, podar `entries` com idade `> 30` dias (ou mantendo as 500 mais recentes) e `streaks` com idade `> 15` minutos, evitando crescimento ilimitado do arquivo ao longo de meses.

#### 6. `callDecisionsApi` e `evaluateDecisionAndAntiLoop`
- Timeout estrito de `12.000ms` via `AbortController`.
- `failOpenInfra` aciona imediatamente se `!apiKey`, `res.status === 402 || res.status === 429 || res.status >= 500`, `AbortError`/rede ou payload malformado $\rightarrow$ imprime `[JEV-WARN: Bypass gracioso da Etapa 4 (...) — Etapa 2 determinística aprovada]` e retorna `Exit 0`.
- Quando a resposta da API reprova (`!(pNenhuma >= 0.90 && risco < 1.0)`):
  - `diffHash = sha256(diffForApi)`
  - `streakKey = sha256([...changedFiles].sort().join('|') + '::' + violacao)`
  - Se `bypassReason` estiver definido $\rightarrow$ grava `.tmp/jev-bypass.log` (JSONL) com `{ ts, stage: '4-semantic', reason: bypassReason, files, violacao, pNenhuma, risco, diffHash }` e retorna `Exit 0`.
  - Caso contrário, lê `prev = cache.streaks[streakKey]`:
    - Se `prev` existir, `(now - prev.lastTs) <= 15 * 60 * 1000` **e** `prev.lastDiffHash !== diffHash`: `nextCount = prev.count + 1`.
    - Se `prev` existir com **`prev.lastDiffHash === diffHash`**: **NÃO incrementa streak!** Informa explicitamente que o diff não foi alterado desde a última reprovação e exige correção real ou `JEV_BYPASS_REASON="..."` para prosseguir.
    - Se `nextCount >= 2` $\rightarrow$ grava `.tmp/jev-bypass.log` com `{ ts, stage: '4-anti-loop', files, violacao, prevDiffHash, diffHash }` e retorna `Exit 0`.
    - Caso contrário, salva `{ count: nextCount, lastDiffHash: diffHash, lastTs: now, violacao }` e retorna `Exit 1` (ou `Exit 0` se `warnOnly === true` no Shadow Mode).

#### 7. Contrato Programático Exportado (`export async function runJevGate(options)`)
```js
/**
 * Executa o pipeline Gate Jev v3.1 de forma programática.
 * Retorna objeto estruturado sem chamar process.exit(), permitindo reúso pelo idd-ide CLI/extensão.
 */
export async function runJevGate(options = {}) {
  // options: { mode: 'staged'|'worktree'|'file', diffPath?, rulesPath?, projectRoot?,
  //            warnOnly?: boolean, bypassReason?: string, fetchImpl?: typeof fetch, logger? }
  // returns: { exitCode: 0|1, approved: boolean, stage: string, cached?: boolean,
  //            failOpen?: boolean, bypassLogged?: boolean, metrics?: { pNenhuma, risco, violacao, durationMs },
  //            findings?: Array<{ stage, file, message }> }
}
```

---

## 6.3 Especificação Exata dos Artefatos Auxiliares

### 1. `.gitattributes` (Novo na raiz — garante `LF` em Windows `core.autocrlf=true`)
```gitattributes
scripts/git-hooks/* text eol=lf
*.sh text eol=lf
```

### 2. `scripts/git-hooks/pre-commit` (Versionado no repo com terminação estrita `\n`)
```sh
#!/bin/sh
set -e
node scripts/jev-check.mjs --staged
```
*(Sem `exit 0` nem `exec` ao final: quando `idd init` anexar `# IDD IDE ... idd verify --fail-on=critical`, ambos executarão em sequência sob `set -e`.)*

### 3. `scripts/install-git-hooks.mjs` (Instalador Seguro e Idempotente)
- Lê `scripts/git-hooks/pre-commit` normalizando `\r\n` $\rightarrow$ `\n`.
- Se `.git/hooks/pre-commit` já contiver um bloco `# IDD IDE` (gerado previamente por `idd init`), preserva o bloco `# IDD IDE` após o bloco do Gate Jev (usando delimitadores `# >>> RVM-JEV-GATE` / `# <<< RVM-JEV-GATE`).
- Grava com `{ mode: 0o755 }` e **nunca** altera `git config core.hooksPath`.

### 4. Scripts Adicionais em `package.json`
```json
"verify:jev": "node scripts/jev-check.mjs --staged",
"verify:jev:shadow": "node scripts/jev-check.mjs --staged --warn-only",
"verify:jev:worktree": "node scripts/jev-check.mjs --worktree",
"verify:all": "npm test && npm run type-check && npm run build && npm run verify:jev",
"hooks:install": "node scripts/install-git-hooks.mjs"
```

### 5. Regras Multi-IDE (Somente na Fase 2/3 do Rollout)
- Criar `.agents/rules/jev-gate.md` (`trigger: always_on`): instrui agentes Antigravity a encerrar lotes executando `npm run verify:jev` (aproveitando *Cache Hit* imediato no `git commit` subsequente) e explica o uso legítimo de `JEV_BYPASS_REASON`.
- Atualizar `.roo/rules/10-jev-verificacao.md` e o aviso no topo de `memories/regras-intencao.md` substituindo "SUSPENSO" pela política v3.1 oficial.

---

## 6.4 Especificação da Suíte de Testes Unitários (`scripts/jev-check.test.mjs`)

Todos os 14 testes devem rodar com `node --test scripts/jev-check.test.mjs` usando diretórios temporários isolados e `fetchImpl` mockado (**0 chamadas reais de rede**, tempo esperado `< 1s`):

1. **Curto-circuito Docs/Memórias**: diff contendo apenas `.md` e `memories/` retorna `exitCode: 0`, `stage: 'short-circuit'`, zero chamadas `fetchImpl`.
2. **Etapa 2a (.env staged)**: arquivo `.env.local` em `allChangedFiles` retorna `exitCode: 1` e **ignora** mesmo se `JEV_BYPASS_REASON` for passado (zero bypass); `.env.example` passa.
3. **Etapa 2a (`bad-2.patch` real)**: diff contendo `console.log('SUPABASE_SERVICE_ROLE_KEY =', key, 'SECRET =', secret)` retorna `exitCode: 1` localmente sem chamar `fetchImpl`.
4. **Etapa 2a (`// jev-pattern-literal` e proteção de `jev-check.mjs`)**: linha em `scripts/jev-check.mjs` com `// jev-pattern-literal` passa; um token literal sem o marcador no mesmo arquivo falha com `exitCode: 1`.
5. **Etapa 2b (Estilo TS)**: adição de `: any` / `@ts-ignore` em `src/services/foo.ts` retorna `exitCode: 1` (zero bypass); ocorrência dentro de comentário `//` ou em `src/services/foo.test.ts` passa.
6. **Etapa 2c (Motor sem teste vs. Motor com teste sem versão)**: editar `src/services/eligibilityService.ts` sem arquivo `*.test.ts` falha duro (`exitCode: 1`) mesmo com bypass; editar com teste mas sem bump de `ELIGIBILITY_RULES_VERSION` falha sem `JEV_BYPASS_REASON` e passa registrando `.tmp/jev-bypass.log` quando `JEV_BYPASS_REASON` está preenchido.
7. **Etapa 2d (`.intent.md` & `DROP` SQL)**: editar `.agents/workflows/motor-invariants.intent.md` exige `JEV_BYPASS_REASON`; adicionar `DROP TABLE` sem `-- ROLLBACK_SQL` falha duro.
8. **Extrator *Inbound* em `graphify-out/graph.json`**: dado grafo fixture com `types.ts` (*outbound*), `scripts/foo.ts` (*inbound script*), `foo.test.ts` (*inbound test*) e `rankedEligibleService.ts` (*inbound prod*), retorna **exclusivamente** `rankedEligibleService.ts`.
9. **Compactação Íntegra em 2 Degraus**: diff de `18 KB` com `10 KB` de testes resume os testes mantendo integral o código; diff de `30 KB` de múltiplos arquivos mantém apenas arquivos inteiros por ordem de prioridade dentro de `24 KB`, sem cortar nenhum hunk no meio; arquivo único crítico `> 24 KB` aciona `overflowFailOpen` (`exitCode: 0`).
10. **Invalidação Quádrupla de Cache SHA-256**: 2ª execução idêntica dá `cached: true` (`fetchCalls === 1`); alterar `regras`, `diff` ou `contexto_dependentes_ast` força nova chamada (`fetchCalls === 2`).
11. **Fail-Open Gracioso em Infra**: `fetchImpl` retornando HTTP `402`, `429`, `503` ou rejeitando por `AbortError` (timeout) retorna `exitCode: 0`, `failOpen: true`, após Etapa 2 aprovada.
12. **Bloqueio de Duplo Commit Idêntico na Etapa 5**: 2 chamadas consecutivas com o mesmo `diffHash` retornam ambas `exitCode: 1` (não destrava `streak`).
13. **Anti-Loop Legítimo na Etapa 5**: 2 chamadas consecutivas com `diffHash` distintos no mesmo arquivo + mesma violação dentro de `< 15 min` destravam na 2ª chamada (`exitCode: 0`, `bypassLogged: true`) e gravam `.tmp/jev-bypass.log`.
14. **Modo Shadow (`--warn-only`)**: reprovação semântica na Etapa 4 loga `[JEV-SHADOW-FAIL]` e retorna `exitCode: 0`, enquanto Etapa 2a/2b continua retornando `exitCode: 1`.

---

## 6.5 Plano de Rollout Executivo e Critérios de Saída

| Fase | Escopo | Duração / Marcos | Critério Objetivo de Avanço |
| :--- | :--- | :--- | :--- |
| **Fase 0 — Implementação + Testes Locais** | Escrever `scripts/jev-check.mjs` v3.1, `scripts/jev-check.test.mjs`, `scripts/install-git-hooks.mjs`, `scripts/git-hooks/pre-commit`, `.gitattributes` e scripts `package.json`. **Sem instalar hook ainda.** | 1 bloco de trabalho | `14/14` testes em `jev-check.test.mjs` + `158/158` em `npm test` + `npm run build` passando; `.git/hooks/pre-commit` ainda inativo. |
| **Fase 1 — Micro-Calibração Semântica Realista** | Rodar bateria Camada B (5 diffs reais do `git log` + 2 mutações sutis reais com `contexto_dependentes_ast` real do grafo), gravar `.tmp/jev/results-v3.json`. | 1 execução controlada (`< $0.01`) | `0%` de falso positivo nos 5 commits reais limpos; `100%` de detecção nas mutações sutis reais com `pNenhuma` distante de `0.90`. |
| **Fase 2 — Shadow Mode em Commits Reais** | Instalar hook rodando `--warn-only` (`verify:jev:shadow`) + `.agents/rules/jev-gate.md`. Monitorar métricas em `.tmp/jev-metrics.log`. | 10 commits ou 7 dias corridos | Tempo mediano de hook `< 2s`; `0` quebras de workflow; análise confirmada de todos os avisos em modo sombra. |
| **Fase 3 — Blocking Mode & Convergência `idd-ide`** | Alternar hook de `--warn-only` para padrão bloqueante, remover banner "SUSPENSO" de `.roo/rules/10-jev-verificacao.md` e conectar `runJevGate()` quando `idd-ide` estiver operacional. | Permanente | Taxa de escape de defeitos físicos `= 0%`; `idd init` compõe `.git/hooks/pre-commit` sem conflito. |

---

## 6.6 Matriz de Riscos, Mitigações e Rollback Imediato

| # | Risco Identificado | Probabilidade | Impacto | Mitigação Arquitetural Embutida na Spec v3.1 |
| :-: | :--- | :---: | :---: | :--- |
| 1 | Esgotamento de créditos OpenRouter (`HTTP 402`) ou queda da API alpha | Média | Crítico se bloqueasse commits | **Fail-Open seletivo (Etapa 4)**: após Etapa 2 passar, `402/429/5xx/timeout` emitem `[JEV-WARN]` e retornam `Exit 0`. |
| 2 | `graphify-out/graph.json` ausente ou desatualizado após edição | Média | Baixo | Extrator retorna lista vazia/fallback neutro sem erro; `.agents/rules/graphify.md` lembra de rodar `graphify update .` ao fechar bloco. |
| 3 | Falso positivo persistente travando agente em loop destrutivo | Média | Alto (gasto cota) | Válvula `JEV_BYPASS_REASON="..."` auditada + anti-loop seguro (`diffHash` alterado + TTL 15 min) em `.tmp/jev-bypass.log`. |
| 4 | Burla silenciosa repetindo `git commit` duas vezes sem alterar código | Evitada | Crítico (furo de governança) | Anti-loop automático bloqueia se `diffHash === prevDiffHash` e exige correção real ou `JEV_BYPASS_REASON`. |
| 5 | Quebra no Windows Git (`sh.exe` com `\r\n` por `core.autocrlf=true`) | Alta sem ajuste | Alto (commit trava) | `.gitattributes` força `eol=lf` em `scripts/git-hooks/*` e `install-git-hooks.mjs` escreve `\n` explícito. |
| 6 | Diff `> 24 KB` cortado no meio provocando erro sintático na API | Evitada | Médio | Compactação por blocos completos ordenados por criticidade; se único arquivo `> 24 KB`, *fail-open* sem cortar hunk. |
| 7 | Vazamento acidental de segredo dentro do próprio `scripts/jev-check.mjs` | Baixa | Crítico | Etapa 2a varre `scripts/` normalmente, isentando **apenas** linhas com `// jev-pattern-literal`. |
| 8 | Hook conflitar com instalação futura do `idd init` (`idd-ide`) | Alta sem ajuste | Médio/Alto | Shim em `.git/hooks/pre-commit` sem `core.hooksPath` e sem `exit 0`/`exec` final permite append limpo pelo `idd init`. |
| 9 | *Partial staging* quebrar hook com checagem do worktree (`tsc -b`) | Alta se tivesse `tsc` | Médio | `tsc -b` permanece fora do `pre-commit` síncrono (medido em `21–24s`) e roda em `npm run verify:all`. |
| 10 | Crescimento indefinido de `.tmp/jev-cache.json` | Baixa | Baixo | Poda automática (`TTL 30 dias`, máx. `500` entradas para `entries`; `TTL 15 min` para `streaks`) a cada escrita. |

### Procedimento de Rollback de Emergência (`< 5 segundos`)
Em qualquer emergência operacional, o sistema retorna ao estado pré-ativação imediatamente sem afetar código de produção:
1. **Desvio pontual de 1 commit**: `JEV_BYPASS_REASON="motivo operacional" git commit -m "..."` (ou `git commit --no-verify` em falha grave de script).
2. **Desativação imediata do hook mantendo scripts**: remover `.git/hooks/pre-commit` (ou voltar à flag `--warn-only` no hook).
3. **Rollback completo ao snapshot anterior**: `git checkout checkpoint-finops-graphify-jev-v3-2026-11-18` para restaurar referências documentais, mantendo intactas entregas funcionais posteriores via `git revert` seletivo dos commits da implementação v3.1.

---

# Parte VII — Questionário Arquitetural para Parecer Final do Claude Fable 5.2

Solicita-se ao **Claude Fable 5.2** revisão crítica e veredito objetivo sobre os **6 pontos abaixo**, além de apontar qualquer brecha lógica ou de segurança não percebida nas rodadas anteriores:

1. **Solidez da Separação em 4 Camadas**:
   A distinção entre *Paradigma* (IDD), *Conceitos & Princípios* (12 conceitos + `P-1…P-10`), *Metodologias* (FinOps em Duas Pontas, Funil em 6 Estágios, Calibração Bi-Camada, Shadow $\rightarrow$ Blocking) e *Ferramentas* (`graphifyy`, `typesafe/jev-1.14`, `Node 22`, hooks) está livre de vazamentos ontológicos? Algum elemento classificado como "Metodologia" pertence na verdade a "Princípio" ou vice-versa?

2. **Fronteira de Segurança no *Fail-Open* para Edições Críticas do Motor (`M-0…M-12`)**:
   Na Spec v3.1, se a OpenRouter retornar `HTTP 402` ou timeout na Etapa 4, o gate faz *fail-open* (`Exit 0`) desde que a Etapa 2 determinística (`2a–2d`, incluindo presença obrigatória de teste e bump de versão nos 4 serviços do motor) tenha passado. Essa política deve continuar *fail-open* mesmo quando o diff toca um dos 4 arquivos do motor, ou commits no núcleo `eligibilityService` / `rankedEligibleService` deveriam exigir *strict mode* sob `HTTP 402`? Qual é o melhor equilíbrio entre segurança de domínio e prevenção de loops agênticos?

3. **Suficiência da Micro-Calibração Semântica Realista (Fase 1)**:
   A combinação proposta de 5 commits reais históricos + 2 a 3 mutações sutis sem comentários óbvios em código real (com `contexto_dependentes_ast` preenchido a partir de `graphify-out/graph.json`) é estatisticamente suficiente para validar os limiares `pNenhuma >= 0.90` e `risco < 1.0`, ou recomenda adicionar casos específicos (ex.: falso positivo em refatorações multi-arquivo com alta contagem de dependentes *inbound*)?

4. **Política da Válvula Anti-Loop (`streak >= 2` com `diffHash !== prevDiffHash` e TTL 15 min)**:
   Exigir que o diff tenha mudado desde a tentativa anterior (`diffHash !== prevDiffHash`) dentro de 15 min fecha a brecha do duplo `git commit` idêntico mantendo proteção automática contra loops de agente. Em alternativa, seria ainda mais limpo **abolir qualquer destravamento automático por `streak`** e exigir exclusivamente `JEV_BYPASS_REASON` humano/explícito quando um agente enfrentar 2 falsos positivos seguidos?

5. **Decisão sobre `tsc -b` fora do `pre-commit` (`20,89s–24,42s` medidos)**:
   Diante da medição real de `21–24s` e do risco de *partial staging*, retirar `tsc -b` do `pre-commit` síncrono e mantê-lo em `npm run verify:all` é a melhor escolha, ou você recomenda habilitar `"incremental": true` em `tsconfig.app.json` / `tsconfig.node.json` (preservando `"noEmit": true`) para medir se um `tsc --noEmit --incremental` ou um workflow de fechamento pré-commit cobre melhor erros de tipo sem atrasar o commit?

6. **Aderência para Convergência Futura com `idd-ide`**:
   O desenho de `export async function runJevGate(options)` + instalador idempotente em `.git/hooks/pre-commit` com delimitadores e sem `exit 0`/`exec` resolve integralmente a composição com `idd-ide/cli/src/commands/init.ts`, ou há ajustes adicionais no contrato de retorno/erros para facilitar a integração futura no `@idd/core`?

---

*Fim do Dossiê Técnico Único — Preparado para Parecer Final do Claude Fable 5.2.*
