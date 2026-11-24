---
trigger: always_on
description: Diretrizes FinOps Multi-Agente — Graphify primeiro ($0), Gate Determinístico Fase 0 ($0) e economia de tokens.
---

## FinOps Multi-Agente & Economia de Tokens (Fase 0 / Opção Z)

1. **Graphify antes de leitura bruta (Custo `$0`)**:
   - Antes de varrer ou abrir múltiplos arquivos em `src/` ou `supabase/`, consulte o grafo AST em `graphify-out/`:
     - `graphify query "<pergunta>"` / `graphify explain "<conceito>"` / `graphify path "<A>" "<B>"`
   - Após qualquer edição de código/SQL na sessão, atualize o grafo sem custo de LLM:
     - `GRAPHIFY_BACKEND=none graphify update .` (ou `npm run graphify:update`).

2. **Gate Determinístico antes do commit (Custo `$0`, local + CI server-side)**:
   - O hook `.git/hooks/pre-commit` (instalável via `npm run hooks:install`) executa `scripts/deterministic-gate.mjs --staged`:
     - `2a`: Segredos + PII (telefone BR, CPF, e-mail pessoal) em **todos** os arquivos, inclusive `.md`.
     - `2b`: Catraca de linhas novas TypeScript (`any`, `@ts-ignore`, `@ts-nocheck`) em `src/` e `api/`.
     - `2c`: Co-evolução obrigatória de teste correspondente ao alterar serviços do motor (`eligibilityService`, `unifiedRotationService`, `rankedEligibleService`, `generationService`).
     - `2d`: SQL destrutiva em `supabase/migrations/*.sql` exige `-- Rollback:` (comentários ignorados).
     - `2e`: Paridade SHA-256 obrigatória entre `_ESTADO-ATUAL.md` e `memories/repo/_ESTADO-ATUAL.md`.
   - O mesmo gate roda automaticamente no servidor via `.github/workflows/verify.yml` (garantia que `--no-verify` não oculta).

3. **Delegação Econômica de Subagentes**:
   - Para levantamentos amplos de código ou documentação, delegar para subagente de pesquisa ou modelo leve (`flash` / `flash_lite`) em vez de carregar dezenas de arquivos brutos na janela principal.
   - Evitar chamadas pagas do verificador semântico Jev (Etapa 4) em commits rotineiros até homologação estatística em *shadow mode*.
