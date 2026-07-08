---
description: "Aplicar nova migration no Supabase com rollback plan"
authorization: confirm-once
invariants:
  - "NUNCA aplicar migration sem anchor de rollback documentado"
  - "Migrations são append-only (nunca alterar migration já aplicada)"
  - "NUNCA DROP de tabela/schema/função sem autorização per-step explícita"
  - "Nome do arquivo: YYYYMMDDHHMMSS_descricao_snake.sql"
  - "tsc verde antes e depois da migration"
rollback: "Ver ROLLBACK_SQL na migration + DROP FUNCTION/SCHEMA se necessário"
---

## WHY
Evoluir o schema do banco de forma auditável, reversível e sem
downtime. Cada migration tem SQL de rollback documentado no próprio arquivo.

## WHAT
- Criar arquivo em supabase/migrations/
- Testar em dry-run antes de aplicar
- Aplicar via MCP supabase_apply_migration
- Atualizar tipos TypeScript se necessário

## PHASES
1. Criar migration file com SQL principal + comentário ROLLBACK_SQL
2. Revisar SQL (invariantes: sem DROP destrutivo sem per-step auth)
3. Aplicar via: mcp_supabase_apply_migration
4. Verificar via: mcp_supabase_execute_sql (query de validação)
5. Se precisar expor schema novo: PATCH /postgrest via Management API
6. tsc --noEmit
7. Commit + deploy (via deploy-and-validate.intent.md)

## ADAPTERS
- supabase-management-api: apply_migration, execute_sql
- filesystem: supabase/migrations/

## NOTES
- Para schema rm.*: supabase.schema('rm') já está configurado
- Exposed schemas atuais: public, graphql_public, rm
- PATCH /postgrest usa Management API com SUPABASE_MCP_TOKEN
