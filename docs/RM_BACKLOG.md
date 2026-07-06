# RM — Backlog de Intenções Pendentes

> Documento vivo. Retomada prevista: semana de 2026‑07‑06.
> Estado da Fase 1 (schema `rm.*`, aba Relatório Mensal, importador MER‑aware): **concluído e em produção** (HEAD `1cb35a6`).

## 1. Completar a carga de dados (prioridade imediata)
- **Responsável:** Eliezer (export) + agente (validação).
- Exportar o app do Glide em **`.ods` multi‑aba** (formato recomendado — preserva tipos, um único arquivo).
- Fonte viva: `C:\Users\Eliez\OneDrive\...\Sup Serviço\Relatórios Glide.xlsx` (planilha ainda em uso pelo Glide) — para a carga completa dos mestres, usar o export multi‑aba `.ods`.
- Fazer **upload** na aba **Relatório Mensal → Sincronização → 📥 Importar planilha do Glide**.
- Import é **idempotente** (upsert por `glide_id` / `glide_row_id`): re‑enviar durante a transição só traz o que é novo.
- Alternativa headless em massa: `scripts/import_rm_from_glide.py` (psycopg2 direto; requer `RM_DATABASE_URL`).
- Validar contagens (agente confirma via consulta ao banco).

## 2. UX — "Visão Geral" com gráficos (Fase 2)
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
