# Parecer Técnico Independente — Claude Opus (5ª rodada, pré-Fable 5.2)

> **Objeto**: [`plano-completo-arquitetura-finops-idd-graphify-jev-v3.md`](plano-completo-arquitetura-finops-idd-graphify-jev-v3.md) (v3.2) + [`briefing-parecer-claude-fable-5-2.md`](briefing-parecer-claude-fable-5-2.md)  
> **Data**: `2026-11-19`  
> **Base Git**: `bb86b24` (`main`)  
> **Método**: leitura integral do dossiê (762 linhas) e do briefing + 4 medições novas no repositório (abaixo). Nenhum código, hook ou configuração foi alterado.

---

## 0. Veredito

**GO COM AJUSTES — mas com escopo reduzido.** O diagnóstico do dossiê é bom, e a auditoria v3.2 corrigiu erros reais. Mesmo assim, o desenho continua otimizado para **robustez interna do gate** (cache, anti-loop, taxonomia HTTP, ordem canônica) e não para **a pergunta que decide o projeto**: *quem é contido por um hook local que o próprio agente pode contornar?* Quatro rodadas refinaram a máquina sem questionar se ela está no lugar certo.

Recomendo **liberar a Fase 0 somente para a camada determinística (Etapa 2) + uma réplica dela em CI no servidor**. A Etapa 4 (Jev) fica em **shadow puro, sem cache nem anti-loop**, até haver dados.

---

## 1. Medições Novas (feitas nesta rodada)

| # | Medição | Resultado | Implicação |
| :-: | :--- | :--- | :--- |
| M1 | `eslint src --format json` | **`491` erros** (`345` `no-explicit-any`, `73` `no-unused-vars`, `35` `exhaustive-deps`…), `29s` | `npm run lint` **também falha hoje** — dívida não citada no dossiê. `tseslint.configs.recommended` já proíbe `any`/`@ts-ignore`; a Etapa `2b` reimplementa por regex uma regra que já existe e não é aplicada. A justificativa válida para `2b` é ser uma **catraca de linhas novas** (*new-line ratchet*); o dossiê deveria dizer isso explicitamente. |
| M2 | `any`/`@ts-ignore` existentes em `src/` (fora de testes) | `277` ocorrências de `: any`/`as any`; `14` de `@ts-ignore`/`@ts-expect-error`/`eslint-disable` | Confirma que a catraca só funciona escopada a linhas `+`. Qualquer migração futura para ESLint tem de ser filtrada por intervalo de linhas alteradas. |
| M3 | Commits que tocaram os 4 serviços do motor (60 dias) | **`17`** commits; **`15/17`** trouxeram teste junto; só **`7/17`** alteraram `ELIGIBILITY_RULES_VERSION` | Com a regra `2c` atual, **2 commits seriam bloqueados sem bypass** e **~10/17 (59%) precisariam de `JEV_BYPASS_REASON`**. Quando o bypass vira regra, a válvula deixa de ser exceção auditável e vira ruído (*normalização do desvio*). |
| M4 | `scripts/jev-check.mjs` v2 | Já carrega `OPENROUTER_API_KEY` de `.env.local` (L14–17) | Bom. A Spec v3.2 não diz que isso continua, e na v3.2 "sem chave" vira *fail-open* silencioso. Se o carregamento se perder, a Etapa 4 morre sem ninguém perceber. |

---

## 2. Achados que as 4 Rodadas Anteriores Não Viram

### A1 — Hook local não contém agente (**crítico, de premissa**)
O agente que faz o commit também controla `JEV_BYPASS_REASON`, `--no-verify` e pode apagar `.git/hooks/pre-commit`. O dossiê chama `2a/2b` de *"Zero Bypass"*, mas a §6.6 ensina `git commit --no-verify`. **As duas coisas não podem ser verdade ao mesmo tempo.** Na prática, o hook pega erro honesto; não segura agente preguiçoso ou adversarial.
- **Correção**: tratar o pre-commit como **feedback rápido** e pôr a **garantia** no servidor:
  1. **GitHub Secret Scanning + Push Protection** (grátis em repositório público, roda no servidor, o agente não contorna). Esse é o controle certo para o histórico deste repositório, reescrito 3× por vazamentos.
  2. Workflow `verify.yml` em `push` para `main` (já existem 8 workflows em `.github/workflows/`) rodando `npm test`, `npm run build` e a Etapa 2 em modo `--range origin/main~1..HEAD`. A falha não impede o push, mas gera alerta **visível e permanente**.
- Corrigir o vocabulário: "Zero bypass" → "sem bypass *por variável de ambiente*; contornável só por `--no-verify`, que é pego no CI".

### A2 — O curto-circuito de docs pula a superfície do vazamento histórico real (**crítico**)
O nó `C` do fluxograma aprova em `0ms` todo commit só de `.md`/`memories/`, e a `scanDiff` exclui `*.md`. Só que **a 3ª reescrita de histórico (2026-11-07) foi justamente por telefones em `_ESTADO-ATUAL.md`**, e 6 de cada 10 commits recentes são docs escritos por agentes. A Etapa `2a` deixa de fora exatamente o tipo de arquivo onde o incidente aconteceu.
- **Correção**: `2a` roda **antes** do curto-circuito, sobre **todas** as linhas `+` de **todos** os arquivos de texto (incluindo `.md`, `.json`, `.yml` e a raiz). O curto-circuito passa a pular só as Etapas 3–4.
- **Faltam padrões de PII (LGPD/`P-9`)**: o `P-9` cita PII, mas a `2a` não tem nenhum padrão para ela. Acrescentar, no mínimo, telefone BR (`\(?\b\d{2}\)?\s?9\d{4}-?\d{4}\b`) e CPF (`\b\d{3}\.\d{3}\.\d{3}-\d{2}\b`), com allowlist por marcador. Hoje as memórias têm `0` ocorrências; a trava protege o futuro.

### A3 — Enviar diffs a um endpoint *alpha* de terceiros conflita com `P-9`
O estado canônico registra (em `_ESTADO-ATUAL.md`, Pendências Ativas, item 8.d) que **há nomes e telefones de publicadores escritos direto em `src/services/*`**. A Etapa 4 manda esses diffs para OpenRouter/TypeSafe em `/api/alpha/`, cuja política de retenção não foi verificada. Nenhuma das 4 rodadas tratou disso.
- **Correção**: a Etapa 4 só roda se o scan de PII da `2a` passar sobre o `diffForApi`. Registrar a política de retenção do provedor como **pré-requisito da Fase 1**.

### A4 — O cache e a ordem canônica existem só para resolver um problema que o próprio desenho criou
O cache SHA-256, o `CACHE_SCHEMA_VERSION`, a poda de 30 dias/500 chaves, a corrida com `graphify update .` e a "ordem canônica" de 5 passos existem porque o gate roda **duas vezes** (`verify:jev` e depois `pre-commit`). Rodando **uma vez só, no hook**, tudo isso some (cerca de 25% da spec e 3 dos 18 testes).
- **Correção**: remover `verify:jev` como passo obrigatório; ele fica como diagnóstico opcional que não grava cache. Se o cache continuar, a chave precisa incluir `MODEL_ID` e os limiares (`0.90`/`1.0`). Hoje, trocar `jev-1.14` por `jev-1.15` ou apertar o limiar não invalida as aprovações guardadas.

### A5 — A calibração proposta não tem poder estatístico
Fase 1 = 4 commits limpos + 2–3 mutações. Com `3/3` detecções, o IC95% inferior da sensibilidade é **~29%**. Com `0/4` falsos positivos, o IC95% superior da taxa de FP é **~53%** (regra de três). Isso **não homologa** limiar nenhum. A Fase 2 ("10 commits") rende ~4 avaliações de código.
- **Correção (barata e muito mais forte)**:
  1. **Replay histórico offline**: rodar a Etapa 4 sobre os **últimos ~100 commits de código** (custo estimado `< US$ 0,20`) para medir a taxa de FP em diffs reais.
  2. **Mutações guiadas por invariante**: **uma mutação sutil por invariante** `M-0…M-12` (≥ 13 casos, sem comentários reveladores).
  3. Antes disso, perguntar para cada invariante: **dá para virar teste unitário/property test determinístico?** (ex.: `M-0` "não existe score numérico" pode ser verificado nas saídas do ranqueador). É o movimento coerente com o próprio `P-1`: a Etapa 4 deve cobrir só o **resíduo** que não dá para testar, e esse resíduo precisa ser listado.

### A6 — `2c` vai normalizar o bypass (ver M3)
Com `59%` dos commits do motor sem bump de versão, a válvula viraria rotina. Além disso, "ao menos um `*.test.ts` no lote" se satisfaz com qualquer teste não relacionado.
- **Correção**: (a) `2c-test` exige teste **correspondente** (`<serviço>.test.ts` ou teste que importe o serviço, o que é verificável pelo próprio grafo *inbound*); (b) `2c-version` vira **aviso** (não bloqueio) e só bloqueia quando o diff mexer em constantes/funções de regra marcadas (`// @rule-bearing`), ou quando `motor-invariants.intent.md` mudar no mesmo lote.

### A7 — *Fail-open* de configuração sem prazo vira gate morto permanente
`401/404/410` → `Exit 0` para sempre. Se o endpoint alpha sair do ar, o gate fica desligado indefinidamente, e a única marca disso é um `.tmp/jev-health.log` que ninguém lê.
- **Correção**: contador de saúde (`Etapa 4 executada em X/Y commits nos últimos 7 dias`) impresso em todo commit, e banner persistente quando houver mais de 3 erros de configuração seguidos. Sobre a Q2 do dossiê: **manter *fail-open* uniforme também para o motor.** Um "strict mode" que se destrava com uma variável de ambiente que o próprio agente define é teatro; a proteção do motor tem de vir de testes de invariante (A5.3) e do CI (A1).

### A8 — `.intent.md` "autorizado" por variável de ambiente é trilha de auditoria, não autorização
O `2d` pede `JEV_BYPASS_REASON` "declarando autorização do Responsável Epistêmico", e o agente pode digitar isso. **Ajuste de vocabulário e de expectativa**: chamar de "registro de intenção de alteração". A autorização real exigiria commit assinado pelo humano ou alerta no CI quando `*.intent.md` mudar (A1.2).

---

## 3. Sobre a Taxonomia de 4 Camadas
Ela se sustenta e é útil. Três vazamentos pequenos:
1. **`P-4` (fronteira de lote), `P-5` (invalidação quádrupla) e `P-7` (2 degraus 14/24 KB)** são decisões de **metodologia/implementação** (Camada 2/3), não princípios com horizonte de anos. Os números `14 KB`, `24 KB` e `15 min` não cabem na Camada 1.
2. **"Funil de 6 Estágios"** é a projeção direta do pipeline do `jev-check.mjs`, ou seja, metodologia descrita a partir da ferramenta (justamente o colapso ontológico que a §1.1 condena).
3. Falta um princípio que tornaria A1 óbvio: **"Controles que o executor pode desligar são feedback, não garantia; garantias moram fora do alcance do executor."**

---

## 4. Problemas Editoriais no Dossiê (corrigidos nesta rodada)
- Sumário: o link da Parte VI apontava para "v3.1" (âncora quebrada).
- §3.4 Fase 0 dizia `14` testes; §6.4/§6.5 dizem `18`.
- `P-1` citava "Gate v3.1"; `P-3` e o Estágio 4 (§3.2) listavam só `402/429/5xx`.
- §5.1 usava `pre_checks_aprovados` e §6.2 usava `pre_verificacoes_locais`; unificado em `pre_verificacoes_locais`.
- §6.6 risco 6: "Probabilidade: Evitada" não é probabilidade → "Alta sem regra".

## 5. Problemas no Briefing (corrigidos nesta rodada)
- **Não era autocontido**: pedia ao Fable que "inspecionasse o workspace". Se a submissão for por chat, ele não tem acesso. Agora lista os anexos obrigatórios.
- **Viés de ancoragem**: "4 rodadas anteriores" com fatos "não assumir — já medido" empurra para concordância. Acrescentada instrução para tratar as conclusões anteriores como **hipóteses**.
- **Faltava uma alternativa de referência explícita** para comparar com o desenho: acrescentada a **Opção Z (mínima)**.
- Acrescentados os achados deste parecer como alvos de contestação.

---

## 6. Proposta de Escopo para a Fase 0 (Recomendação Opus)

| Entra na Fase 0 | Adiado (depende de dados) | Cortado |
| :--- | :--- | :--- |
| Etapa 2 (`2a` em **todos** os arquivos + PII; `2b` como catraca; `2c` com teste correspondente e versão como aviso; `2d` com remoção de comentários SQL) | Etapa 4 bloqueante | Cache SHA-256 + ordem canônica (se o gate rodar uma vez só) |
| Shim de hook LF componível com `idd init` | Anti-loop `streak >= 2` (desnecessário em shadow) | "Strict mode" do motor sob 402 |
| **CI `verify.yml`** com a Etapa 2 em `--range` + **GitHub Push Protection** | Limiares `0.90/1.0` até o replay de ~100 commits | — |
| Etapa 4 em **shadow puro** (loga, nunca bloqueia), com contador de saúde | Adaptador `iddVerdict` (só quando o `idd verify --semantic` precisar) | — |
| Trilha separada: catraca de dívida TS/ESLint por arquivo tocado (`155` + `491`) | — | — |

**Critério para ativar o bloqueio da Etapa 4**: replay histórico com FP ≤ 5% **e** detecção ≥ 10/13 nas mutações por invariante **e** invariantes testáveis já convertidas em testes.

---

*Fim do parecer Claude Opus — pronto para ser anexado à submissão ao Claude Fable 5.2.*
