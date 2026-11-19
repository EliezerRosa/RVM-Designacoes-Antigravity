# Material de Submissão & Rubrica de Parecer Técnico — Claude Fable 5.2

> **Finalidade**: Este documento é o **pacote de entrada (briefing + prompt estruturado + rubrica adversarial)** para submeter o dossiê [`memories/repo/plano-completo-arquitetura-finops-idd-graphify-jev-v3.md`](plano-completo-arquitetura-finops-idd-graphify-jev-v3.md) (v3.2) à revisão final do **Claude Fable 5.2**.  
> **Data**: `2026-11-19`  
> **Origem**: Auditoria Profunda Neon Extra (XHigh) sobre a base `f0e1ade` de `rvm-designacoes-unified` + inspeção direta de `C:\IDE IDD Claude-VS Code\idd-ide`.

---

## 0. Pacote de Anexos Obrigatórios (Submissão Autocontida)

Se o Claude Fable 5.2 for consultado **fora do workspace** (chat sem acesso ao disco), anexe **todos** os arquivos abaixo. Sem eles, as Questões 3, 5 e 7 não são verificáveis:

| # | Arquivo | Por quê |
| :-: | :--- | :--- |
| 1 | `memories/repo/plano-completo-arquitetura-finops-idd-graphify-jev-v3.md` | Documento principal (Spec v3.2) |
| 2 | `memories/repo/parecer-claude-opus-pre-fable-5-2.md` | Contraponto independente (5ª rodada): 8 achados de premissa/segurança **não** incorporados à v3.2 |
| 3 | `memories/regras-intencao.md` | Base da contradição Regra × Diff Filtrado (Q3) |
| 4 | `scripts/jev-check.mjs` (v2, ~4 KB) | Ponto de partida real da implementação |
| 5 | `idd-ide/cli/src/commands/verify.ts` (L153–320) e `init.ts` (L130–155, L275–284) | Convergência `iddVerdict` / composição de hook (Q7) |
| 6 | `supabase/migrations/20261009200000_agent_action_server_gate.sql` | Caso real do falso positivo SQL em `2d` |
| 7 | `eslint.config.js`, `tsconfig.app.json`, `package.json` (`scripts`) | Dívida TS (`155`) e ESLint (`491`), Q5 |

---

## 1. Prompt Pronto (Copiar e Colar para o Claude Fable 5.2)

```markdown
Claude Fable 5.2 — Parecer Técnico Adversarial Final

Leia integralmente:
1. `plano-completo-arquitetura-finops-idd-graphify-jev-v3.md` (Spec v3.2 — documento principal)
2. `parecer-claude-opus-pre-fable-5-2.md` (contraponto independente da 5ª rodada — NÃO incorporado à v3.2)
3. Anexos de fonte: `regras-intencao.md`, `jev-check.mjs` (v2), `verify.ts`/`init.ts` do idd-ide, migração SQL de exemplo, `eslint.config.js`, `tsconfig.app.json`, `package.json`.

Contexto do projeto: 1 desenvolvedor humano (Responsável Epistêmico) + múltiplos agentes de IA que commitam direto em `main` de um repositório PÚBLICO (sem PRs), cujo histórico já foi reescrito 3× por vazamentos (sessão de navegador, dumps com dados pessoais, telefones em arquivo de estado .md).

Medições do repositório (trate as CONCLUSÕES tiradas delas pelas rodadas anteriores como HIPÓTESES, não como fatos):
- Graphify local (`graphify-out/graph.json`, 0 tokens API): 4.628 nós, 9.766 arestas (19 relações), 310 comunidades.
- `npm test`: 158/158 passando; `npm run build` (`vite build`): limpo.
- `npm run type-check` (`tsc -b`): FALHA hoje (`Exit 1`) com 155 erros TS pré-existentes, 17,7s–24,4s.
- `eslint src`: 491 erros pré-existentes (345 `no-explicit-any`), 29s.
- Últimos 4 commits de código couberam abaixo de 24 KB após resumir testes (maior: 32.978 → 22.998 chars).
- Motor (4 serviços críticos), últimos 60 dias: 17 commits; 15/17 com teste; só 7/17 com bump de `ELIGIBILITY_RULES_VERSION`.
- `idd-ide/cli/src/commands/verify.ts` usa `claude-sonnet-5` + `code.slice(0, 16000)` retornando `{ status, score, violations }`; `init.ts` faz append em `.git/hooks/pre-commit`.

Sua missão (seja implacável — NÃO faça parecer de concordância automática; 4 rodadas anteriores podem ter compartilhado o mesmo ponto cego):
1. Compare o desenho v3.2 contra a ALTERNATIVA MÍNIMA (Opção Z) abaixo e diga qual entrega mais garantia por unidade de complexidade:
   Opção Z = GitHub Secret Scanning + Push Protection (servidor) + workflow CI em push rodando `npm test`, `npm run build` e uma catraca de linhas novas (segredos/PII/`any`/`@ts-ignore`) + conversão das invariantes M-0…M-12 testáveis em testes unitários/property tests + pre-commit local apenas como feedback rápido. Sem Etapa semântica remota.
2. Julgue os 8 achados do parecer Opus (A1–A8): ACEITAR / REJEITAR / AJUSTAR, com justificativa.
3. Responda objetivamente às 7 questões da Parte VII do dossiê (APROVAR / ALTERAR / CORTAR para cada uma).
4. Aponte de 1 a 5 riscos, falhas de segurança ou pontos de super-engenharia (YAGNI) que NENHUMA das 5 rodadas viu.
5. Emita um veredito final claro entre:
   - `GO (Autorizar Fase 0 como especificada na v3.2)`
   - `GO COM AJUSTES (listar exatamente quais mudanças entram antes da Fase 0)`
   - `GO OPÇÃO Z / ESCOPO REDUZIDO (justificar)`
   - `NO-GO / REDESENHO (justificar qual pilar deve ser cortado ou redesenhado)`

Formato de resposta esperado:
- Veredito Geral (1 linha + justificativa curta)
- v3.2 vs. Opção Z (tabela: garantia, custo, complexidade, contornabilidade pelo agente)
- Julgamento dos achados Opus A1–A8 (tabela)
- Auditoria da Taxonomia de 4 Camadas
- Resposta Direta às 7 Questões da Parte VII (tabela + justificativa técnica)
- Achados Novos / Pontos Cegos / Riscos de Super-Engenharia
- Condições Exatas para Liberação da Fase 0
```

---

## 2. Mapa de Evidências Empíricas Já Verificadas (Para Consulta Rápida do Revisor)

| Fato Empírico | Artefato / Comando Verificado | Resultado Observado | Onde Foi Incorporado na Spec v3.2 |
| :--- | :--- | :--- | :--- |
| **`tsc -b` falha hoje (`Exit 1`)** | `.\node_modules\.bin\tsc.cmd -b --verbose` | `155` erros pré-existentes (`17,66s–24,42s`; `buildinfo indicates program needs to report errors`) | §4.1, §4.2.C, §5.1, §5.2 #2, §6.3 #4 (`verify:all` sem `type-check`) |
| **Falso positivo SQL em `2d`** | `supabase/migrations/20261009200000_agent_action_server_gate.sql` L25–27 | `-- Rollback:` contém `-- DROP FUNCTION IF EXISTS ...`; `0/15` migrações recentes usam `ROLLBACK_SQL` literal | §5.1, §6.2 #2 (`2d` remove comentários `--`/`/* */` antes do match e aceita `-- Rollback:`) |
| **Contradição Regra × Diff Filtrado** | `memories/regras-intencao.md` L11, L31, L33, L38 vs. `:(exclude)*.md` e Degrau 1 | Enviar o arquivo inteiro faz `jev-1.14` cobrar `.md`/versão/testes que o filtro ou bypass de `2c` removeu | §5.1, §6.2 #5 (`regras_semanticas_jev` + nota `pre_verificacoes_locais`) |
| **Validação real de `14 KB / 24 KB`** | `git show` nos 4 últimos commits de código (`a53eb44`, `04f2f3c`, `6a80ea8`, `e5896b6`) | `4/4` couberam em `<= 24 KB` após Degrau 1 (`a53eb44`: `32.978 → 22.998` chars) | §5.1, §5.2 #3, §6.2 #4 |
| **Hubs globais & Entrypoints HTTP no grafo** | Simulação JS em `graphify-out/graph.json` para 7 arquivos reais | `src/types.ts` tem `117` consumidores *inbound*; `api/conversa-nlu.ts` e `zapi-smart-webhook/index.ts` têm `0` imports estáticos | §5.1, §6.2 #3 (`total N arquivos, top 10` + anotação *entrypoint HTTP*) |
| **Ponto cego `--worktree` + *partial staging*** | Semântica de `git diff HEAD` vs. `git ls-files --others` e `git show :path` | Arquivos novos *untracked* escapavam de `verify:jev:worktree`; `2d` lia disco em vez do índice | §5.1, §6.2 #1 e #2 (`2d`) |
| **Race condition Cache × `graphify update .`** | `.agents/rules/graphify.md` L14 vs. `SHA256(..., contexto_dependentes_ast)` | Rodar `graphify update .` entre `verify:jev` e `git commit` invalidava o cache | §5.1, §6.2 #5, §6.3 #5 (ordem canônica fixa) |
| **Taxonomia HTTP incompleta na Etapa 4** | Spec v3.1 listava só `402/429/5xx` | `401/403/404/410` (endpoint alpha movido/chave revogada) e `400/413` não tinham fallback definido | §5.1, §6.2 #6 (`[JEV-ERROR-CONFIG]` + `.tmp/jev-health.log` + fail-open) |
| **Sinergia real com `idd-ide/verify.ts`** | `C:\IDE IDD Claude-VS Code\idd-ide\cli\src\commands\verify.ts` L153–320 | `verify.ts` hoje usa Claude Sonnet + `code.slice(0, 16000)` e contrato `{ status, score, violations }` | §4.2.D #5, §6.2 #7 (`iddVerdict` *drop-in*) |

---

## 3. Foco Adversarial Sugerido ao Revisor (Onde Ainda Pode Haver Debate Real)

Mesmo após 5 rodadas (4 de endurecimento + 1 contraponto Opus), permanecem **6 decisões genuínas de trade-off arquitetural** onde o parecer do **Claude Fable 5.2** terá valor decisivo:

1. **Complexidade vs. Retorno da Etapa 4 (YAGNI Check)**: Depois de a Etapa 2 determinística (`2a–2d`, `0` tokens) ter absorvido segredos, `console.log`, `: any`, `@ts-ignore`, falta de teste no motor, bump de versão, `.intent.md` e `DROP` SQL, quanto valor residual líquido sobra para uma chamada remota a um endpoint `/api/alpha/decisions`? O Shadow Mode da Fase 2 consegue provar (ou refutar) esse ROI em 10 commits?
2. **Abolir vs. Manter `streak >= 2` Automático**: Mesmo com `diffHash !== prevDiffHash` + TTL `15 min`, permitir qualquer bypass automático sem `JEV_BYPASS_REASON` ainda pode ser abusado por um agente que faça 2 micro-edições cosméticas para destravar o commit. Vale manter o anti-loop automático ou exigir `JEV_BYPASS_REASON` 100% explícito?
3. **Fail-Open em Commits do Motor (`M-0…M-12`)**: Se a OpenRouter ficar fora (`HTTP 402`/`404`/`5xx`), commits comuns devem fazer *fail-open*, mas commits que tocam os 4 arquivos críticos do motor devem fazer *fail-open* igual ou exigir `JEV_BYPASS_REASON` explícito?
4. **Dívida de `155` Erros no `tsc -b`**: Vale atacar a limpeza dos `155` erros TS antes ou em paralelo à Fase 0 do Gate Jev — ou introduzir um check de não-regressão TS escopado apenas aos arquivos tocados no diff?
5. **(Adicionado pelo parecer Opus) Onde mora a garantia**: hook local (contornável pelo próprio agente via `--no-verify`/variável de ambiente) vs. CI/Push Protection no servidor. O desenho v3.2 deve ser reclassificado como *feedback* local + garantia remota?
6. **(Adicionado pelo parecer Opus) Superfície de docs e PII**: o curto-circuito `.md` deve continuar pulando a varredura de segredos/PII, dado que o vazamento histórico real (telefones) ocorreu em arquivo `.md` de estado? E é aceitável enviar diffs com possíveis dados pessoais a um endpoint *alpha* de terceiros?
