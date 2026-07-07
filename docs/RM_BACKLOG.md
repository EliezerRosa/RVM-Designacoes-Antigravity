# RM — Backlog de Intenções Pendentes

> Documento vivo. Última atualização: 2026-07-07 (fim de sessão).
> **HEAD:** `bcc1c5c`. Schema `rm` exposto + carga completa (192 pubs) + auto-match com fuzzy name matching. Todos pushed + deployed.

## Bugs corrigidos hoje (07/07)
- `rvm_publisher_id uuid → text` (`ef7de9d`): public.publishers.id é TEXT — migration `20260707000000`.
- Fuzzy name match (`bcc1c5c`): 1º token igual + ≥1 token adicional, stop-words ignoradas.

## 1. ✅ Carga de dados — CONCLUÍDA (2026-07-07)
- Carga realizada via MCP Supabase (`mcp_supabase_execute_sql`).
- Fonte: `docs/RM Desacoplado/9fe36d.Relatório Mensal v03 (New).ods` (workspace).
- Script de re-carga headless: `python scripts/import_rm_from_glide.py` (sem args — defaults configurados).
  - `--ods` default: workspace ODS acima.
  - `--reports` default: `C:\Users\Eliez\OneDrive\...\Sup Serviço\Relatórios Glide.xlsx`.
- Gerador SQL idempotente: `scripts/_gen_rm_sql.py`.
- **monthly_reports**: NÃO importados ainda (requer `RM_DATABASE_URL` e decisão sobre janela de datas).

## 2. Validar resultado do auto-match e iniciar UX gráficos (próximo)
- Eliezer rodará **Rodar auto-match** com o novo fuzzy matching → verificar contagem de `auto` vs `conflict` vs `unmatched`.
- Confirmar matches corretos manualmente via dropdown "escolher RVM".
- A UI do Glide para o RM é **analítica**: séries mensais por categoria — **Publicadores (roxo), Auxiliares (verde), Regulares (vermelho), Estudos (azul)** — mais uma seção "AUGES (Anterior)".
- Replicar no `RmDashboard`: gráficos de tendência mensal a partir de `rm.v_s1_consolidation` (a lib de charts já está no bundle).
- Respeitar os formulários oficiais **S‑1 / S‑4 / S‑21** como contrato visual (PDFs em `docs/RM Desacoplado/`).

## 3. Catalogar as UIs do Glide
- Capturas estáticas no workspace: `Screenshot_...glide.page.jpeg` (Visão Geral), `apresentacao_rm_v2.html` (mockups), `painel_migracao_glide.html`, PDFs `S‑1/S‑4/S‑21`.
- Navegação ao vivo (Playwright) possível, mas o app é **autenticado** (`relatorio-mensal-v03-new.glide.page`) — requer sessão logada fornecida pelo Eliezer.
- Produto: catálogo de telas → backlog de views a replicar.

## 4. Fase 2 — RLS multi‑role
- Hoje: apenas Admin acessa `rm.*` (não‑admin negado).
- Liberar `secretary` / `group_leader` / `assistant_group_leader` via `rm.congregation_members`.

## 5. Alinhar o bootstrap Python ao `glide_id`
- `import_rm_from_glide.py` deve passar a fazer upsert de congregações/grupos por `glide_id`
  (colunas `glide_id` UNIQUE já existem — migration `20260705235247_rm_glide_ids`), para
  idempotência igual à do importador in‑app.

## 6. Enriquecer mestres (via import multi‑aba)
- Metadados de congregação (número, e‑mail SEC) e de grupo, que a aba única `Relatórios` não traz.
- A aba `Grupos` do Glide traz `id_SuperDeGrupo`/`id_SuperAJDeGrupo` → líderes resolvidos automaticamente.

## 7. AEON — adapter `supabase-management-api` (transversal)
- Converter o passo manual de expor schema na API num `confirm-once`.
- Op: `PATCH /v1/projects/{ref}/postgrest { db_schema += 'rm' }` com PAT.
- **Invariante:** read‑modify‑write (nunca sobrescrever a lista de exposed schemas às cegas).

---
### Referências
- Migrations: `supabase/migrations/20260705194054_rm_schema.sql` … `20260705235247_rm_glide_ids.sql`.
- Serviços: `src/services/rm/rmService.ts`, `src/services/rm/rmSyncService.ts` (`importGlideWorkbook`).
- UI: `src/components/rm/` (MonthlyReportTab + sub‑abas).
- Mapeamento Glide→rm: `docs/RM Desacoplado/decisoes_migracao_glide_2026-06-30.json` (workspace root).
