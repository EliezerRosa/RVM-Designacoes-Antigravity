# Regras de Intenção do Projeto RVM

> Enviado integralmente ao verificador Jev em cada checagem. Regras curtas, verificáveis por leitura de diff.
> Fontes canônicas (prevalecem sobre o código): `.agents/workflows/motor-invariants.intent.md` (M-0…M-12),
> `rm-invariants.intent.md` (I-0…I-7), `supabase-migration.intent.md`, `deploy-and-validate.intent.md`,
> `rotate-secrets.intent.md`, `AGENTS.md`, `_ESTADO-ATUAL.md`.

## Regras de negócio
- Motor: não introduzir score numérico/aditivo; a decisão é por faixa (bucket) e ordem lexicográfica estrita (M-0).
- Motor: gates absolutos não relaxáveis — elegibilidade estrutural, disponibilidade, uma parte por semana (exceto Oração Final) (M-0).
- Diff em `eligibilityService`, `rankedEligibleService`, `unifiedRotationService` ou `generationService` deve também
  bumpar `ELIGIBILITY_RULES_VERSION` e `RULES_TEXT_VERSION` (`contextBuilder`) e tocar um `*.test.ts` (motor-invariants, frontmatter).
- Demonstração: titular e ajudante de sexos opostos só se cônjuges ou pai/mãe↔filho(a); a checagem é bidirecional
  (Titular↔Ajudante) e não pode ser removida (sessão 2026-10-15, regras `2026-10-15.01`).
- Irmãs têm faixa absoluta em demonstrações fora da seca de anciãos/SM; não converter em desempate (M-4).
- CANCELADA e REJEITADA não são participação; fonte única `historyAdapter` / `DEAD_PARTICIPATION_STATUSES` (M-6).
- Quem recusou ou foi substituído na semana fica inelegível para qualquer parte daquela semana (M-12).
- Propostas manuais (`is_manual_override`) e partes DESIGNADA/APROVADA não são regeneradas sem pedido explícito (M-11).
- Sanity-check sem substituto gera `PENDENTE`, nunca `CONCLUIDA` vazia (M-10).
- Cron não gera designações nem envia S-89; S-89 só pelo botão "Publicar" (`weekPublishService`);
  lembretes D-7/D-2 só com `PUBLICACAO_S89` = SUCCESS em `zapi_dispatch_log` (_ESTADO-ATUAL §3).
- CCA não tem nem recebe status de Admin de sistema; irmãos são descritos pela função cadastrada (_ESTADO-ATUAL §2).
- RM: `is_congregated` (membresia) e `field_service_status` (campo) são eixos ortogonais; nunca usar um pelo outro (I-0).
- RM: `service_year = mês >= 9 ? ano+1 : ano`; mês pendente = mês anterior ao atual (I-1, I-2).
- RM: no máximo um relatório por publicador por mês civil; `hours` só para pioneiros (I-4, I-6).
- Datas ao usuário em DD/MM/AAAA; textos de WhatsApp em tom teocrático e cordial (_ESTADO-ATUAL, cabeçalho).

## Convenções de código
- TypeScript com `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (tsconfig.app/node);
  não adicionar `any`, `@ts-ignore`, `@ts-expect-error` ou `eslint-disable` em `src/`.
- Gates antes de commit/deploy: `npm test` (node --test via tsx em `src/**/*.test.ts(x)`), `npm run type-check` (`tsc -b`),
  `npm run lint` (eslint) e `npm run build` (package.json; deploy-and-validate).
- Mudança de regra de negócio em `src/services/**` vem acompanhada de teste em `src/**/*.test.ts` no mesmo diff.
- Migrations só em `supabase/migrations/`, append-only, nome `YYYYMMDDHHMMSS_descricao_snake.sql`, com comentário
  `ROLLBACK_SQL`; nenhum `DROP` de tabela/schema/função sem autorização per-step (supabase-migration).
- Não editar `.agents/workflows/*.intent.md` nem alterar dados retroativos de produção sem decisão explícita do Eliezer.
- Commits `tipo: descricao` em snake_case, sem `--no-verify`; push sem `--force` (deploy-and-validate).
- Memórias (`memories/**`, `_ESTADO-ATUAL.md`) atualizadas in-place ao fechar bloco lógico (AGENTS.md).

## Segurança
- O diff não pode tocar `.env`, `.env.local`, `.env.*.local`, `supabase/.env`, nem conter valores de chave, token,
  JWT ou senha em código, teste, log, fixture, commit ou documento.
- Segredos só por nome: `process.env.X` (scripts Node), `Deno.env.get('X')` (Edge Functions em `supabase/functions/**`),
  `import.meta.env.VITE_*` apenas para valores públicos do frontend.
- Prefixo `VITE_*` nunca para chave server-side (OpenRouter, service_role, Z-API, Gemini) (rotate-secrets §5).
- Supabase `service_role` só em Edge Functions e scripts server-side; o frontend usa a chave publishable/anon.
- Dados pessoais de publicadores (telefones, e-mails, S-89/S-140, planilhas) não entram em código, fixtures ou docs
  versionados; `docs-local/`, `dados_sensiveis/`, `*.xlsx`, `*.pdf`, `*.csv` permanecem ignorados pelo Git.
- Todo novo arquivo que contenha segredo exige entrada em `.gitignore` e `.rooignore` no mesmo diff.
- Nenhum `git commit`, `git push` ou `git reset --hard` em scripts/automações sem autorização explícita do usuário.
