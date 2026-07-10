# RVM Designações — Handoff para Antigravity / Claude

> **Para o agente Claude no Antigravity:**
> Este documento é o ponto de retomada preciso da sessão 2026-07-09/10 no VS Code Copilot.
> Leia integralmente antes de agir. O usuário é **Eliezer Rosa** (dono epistêmico do projeto).
> Modelo IDD: Eliezer define O QUÊ e POR QUÊ; o agente executa O COMO.

---

## 1. Contexto do Projeto

- **Repositório**: `EliezerRosa/RVM-Designacoes-Antigravity` (GitHub)
- **Stack**: React + Vite + TypeScript + Supabase (PostgreSQL)
- **Deploy**: GitHub Pages (frontend) + Vercel (API serverless)
- **Supabase projeto**: `pevstuyzlewvjidjkmea`
- **URL produção**: `https://rvm-designacoes-antigravity.vercel.app`
- **Workflow de deploy**: `git add → git commit → git push origin main → npm run deploy`
  - cwd: `rvm-designacoes-unified/`
  - Commit sem `()`, `{}` ou `&&` na mensagem
  - `git push` escreve no stderr mas EXIT=0 = sucesso (procurar `x..y main → main`)

---

## 2. Módulo RM (Relatórios Mensais) — Estado Atual

### HEAD git
`e6f3a1e` — docs: comentário upsert monthly_reports corrigido.

### O que foi implementado (sessão 2026-07-09)

| Item | Status | Commit |
|---|---|---|
| Schema `rm.*` + views + triggers | ✅ deployed | migrações em `supabase/migrations/` |
| Importador Glide (sync portal) | ✅ deployed | `rmSyncService.importGlideWorkbook()` |
| Dashboard com KPIs calibrados vs Glide | ✅ deployed | `RmDashboard.tsx` |
| I-0: dois eixos ortogonais (`is_congregated` vs `field_service_status`) | ✅ deployed + DB | `rm_status_rules_v3` migration |
| I-7 v3: ATIVO=6/6, IRREGULAR=1-5/6, INATIVO=0/6, RECÉM-CONGREGADO | ✅ deployed + DB | `rm_status_rules_v3` |
| `is_active` → `is_congregated` (rename coluna DB + TS) | ✅ deployed | `rm_publisher_is_congregated` |
| Pioneer status como snapshot histórico no relatório | ✅ deployed | `rm_report_pioneer_snapshot` |
| Import `Desativado` → `is_congregated` + `publisher_date` | ✅ code deployed | aguarda re-import |
| `is_congregated` + `publisher_date` populados via SQL direto | ✅ DB | via MCP migration |
| Upsert monthly_reports por chave civil `(publisher_id, year, month)` | ✅ deployed | `8baf5f9` |

### Dados no banco (2026-07-09)
- 3 congregações · 7 grupos · **192 publicadores** (129 `is_congregated=true`, 63 `false`)
- **2.442+ relatórios** mensais (set/2023–jun/2026, 2 congregações)
- `publisher_date` populado para 15 congregados + 2 não-congregados
- `field_service_status`: 44 ATIVO · 63 IRREGULAR · 85 INATIVO (janela relativa a hoje)

---

## 3. KPIs do Painel — Junho 2026 (Calibrado vs Glide)

| KPI (nosso) | Valor | Glide | Status |
|---|---|---|---|
| Relatórios entregues | 77 | 76 | Δ+1 (ver §4) |
| **Congregados** | 129 | 127 (-2 PE's) | ✅ equivalente |
| Publicadores | 50 | 51 | Δ-1 (ver §4) |
| P. Auxiliares | 6 | 6 | ✅ |
| P. Regulares | 19 | 19 | ✅ |
| Estudos | 47 | 41 | Δ+6 (ver §4) |
| Horas pioneiros (reg+esp) | 692 | 657 (só reg) | Δ+35 (ver §4) |
| Atrasados | 0 | 0 | ✅ |

---

## 4. Decisão Pendente (PRINCIPAL — revisar amanhã com Eliezer)

### P. Especiais (PE) no S-1 congregacional

**Descoberta:** O Glide exclui P. Especiais do S-1 da congregação local.
- Glide: "Cartões de Congregados (-2 PE's) = 127" (exclui explicitamente)
- Relatórios de PE vão para o escritório do circuito, NÃO para a congregação
- Por isso: Glide mostra 76 relatórios (excluindo 2 PE's que temos no DB)

**Nosso sistema:** inclui os 2 PE's → 77 relatórios, +6 estudos, +35 horas

**Opções a decidir com Eliezer:**
- **A** — Excluir PE's do S-1 congregacional (view + KPIs): `is_special_pioneer = false`
- **B** — Manter tudo mas adicionar KPI "S-1 sem PE" separado
- **C** — Deixar como está (nossa visão inclui PE's, Glide não)

### Outras pendências descobertas
1. **1 relatório no Glide** que não está no nosso DB (jun/2026) → alguém entregou após nosso import → re-import do `Relatórios Glide.xlsx` resolverá
2. **1 publicador no CSV** (193 linhas) que não casou com nenhum dos 192 no DB por `glide_id` → investigar quem é
3. **`Relatórios Glide.xlsx`** (OneDrive + workspace) tem APENAS aba `Relatórios`, sem `PublicadorReal` → para importar dados de publicadores (Desativado, publisher_date) é preciso subir o arquivo `Publicador Real.csv` de outra forma (hoje foi feito via SQL direto)

---

## 5. Invariantes Canonicais (rm-invariants.intent.md)

Arquivo fonte: `rvm-designacoes-unified/.agents/workflows/rm-invariants.intent.md`

### I-0. Dois eixos ortogonais (NOVO 2026-07-09)
- **`is_congregated`** (Eixo A): membro da congregação (`false` = Não Congregado = excluído de tudo)
- **`field_service_status`** (Eixo B): atividade no ministério (ATIVO/IRREGULAR/INATIVO/RECÉM-CONGREGADO)
- São ORTOGONAIS: `INATIVO` ≠ `Não Congregado`

### I-7 v3 (atualizado 2026-07-09)
```
RECÉM-CONGREGADO → publisher_date < 1 mês (prioridade máxima)
INATIVO          → 0/6 meses pregados na janela
IRREGULAR        → 1-5/6 meses pregados
ATIVO            → 6/6 meses pregados
```
- Janela = últimos 6 meses completos relativos a HOJE (não ao último relatório)
- "Pregou" = `has_preached = true` em `monthly_reports`

### Modalidade de serviço (invariante, não criada formalmente ainda)
```
Publicador       → NOT is_auxiliary_pioneer AND NOT is_regular_pioneer AND NOT is_special_pioneer
Pioneiro Auxiliar → is_auxiliary_pioneer = true (flag por relatório mensal)
Pioneiro Regular  → is_regular_pioneer = true (snapshot histórico no relatório)
Pioneiro Especial → is_special_pioneer = true (relatórios vão ao circuito, não à congregação)
```
- `has_preached` NÃO é critério de modalidade (é critério de field_service_status)
- As flags pioneer são snapshots DO MOMENTO DO RELATÓRIO (dados históricos)

---

## 6. Arquitetura do Schema rm.*

```
rm.congregations     ← is_active (estado da congregação, NÃO renomeado)
rm.field_groups      ← is_active (estado do grupo, NÃO renomeado)
rm.publishers        ← is_congregated (renomeado de is_active em 09/07)
                        field_service_status (calculado por trigger)
                        publisher_date (Data Início Publicador)
rm.monthly_reports   ← is_auxiliary_pioneer, is_regular_pioneer, is_special_pioneer
                        (snapshots históricos da modalidade no momento do relatório)
rm.month_control     ← is_open por congregação/mês
rm.publisher_sync_map ← mapeamento rm.publishers ↔ public.publishers (RVM)
rm.settings          ← chave/valor por congregação (submission_window_end_day)
```

### View principal
```sql
rm.v_s1_consolidation → GROUP BY (reference_year, reference_month, congregation_id)
  total_reports, total_preached,
  publisher_count, auxiliary_pioneer_count, regular_pioneer_count, special_pioneer_count,
  total_studies, pioneer_hours, auxiliary_hours, late_count
```
- **Não usa JOIN a `rm.publishers`** — todo pioneer status vem de `monthly_reports`
- `publisher_count` = NOT aux AND NOT reg AND NOT esp (sem filtro `has_preached`)

---

## 7. Arquivos de Código Relevantes

```
src/services/rm/rmService.ts         ← tipos TS + CRUD
src/services/rm/rmSyncService.ts     ← importador Glide workbook
src/components/rm/RmDashboard.tsx    ← painel KPIs + gráficos
src/components/rm/RmPublisherCrud.tsx ← CRUD publicadores
src/components/rm/RmSyncPortal.tsx   ← upload + auto-match
supabase/migrations/                 ← todas as migrations RM
.agents/workflows/rm-invariants.intent.md ← FONTE CANÔNICA
```

### Tipos TS chave
```typescript
type FieldServiceStatus = 'ATIVO' | 'IRREGULAR' | 'INATIVO' | 'RECÉM-CONGREGADO';

interface RmPublisher {
  is_congregated: boolean;  // NÃO confundir com field_service_status = 'INATIVO'
  field_service_status: FieldServiceStatus | null;
  publisher_date: string | null;  // Data Início Publicador (RECÉM-CONGREGADO)
  is_regular_pioneer: boolean;
  is_special_pioneer: boolean;
}

interface RmMonthlyReport {
  is_auxiliary_pioneer: boolean;  // flag por mês
  is_regular_pioneer: boolean;    // snapshot histórico
  is_special_pioneer: boolean;    // snapshot histórico
}

interface S1ConsolidationRow {
  publisher_count: number;          // NOT aux/reg/esp (sem has_preached)
  auxiliary_pioneer_count: number;
  regular_pioneer_count: number;
  special_pioneer_count: number;    // PE — ver decisão §4
  total_studies: number;
  pioneer_hours: number;            // reg + esp
  auxiliary_hours: number;
}
```

---

## 8. Dados de Referência (Glide)

- `Relatórios Glide.xlsx`: apenas aba `Relatórios` (67 cols, 2600+ linhas)
  - Localização workspace: `Glide Apps/Relatórios Glide.xlsx`
  - Localização OneDrive: `...\PIONEIROS ESPECIAIS\Estância\Sup Serviço\Relatórios Glide.xlsx`
  - **NÃO tem aba `PublicadorReal`**
- `Publicador Real.csv` (186 colunas, com `Desativado` + `Data Início Publicador`):
  - Localização: `docs/RM Desacoplado/Publicador Real.csv`
  - Para importar via UI: precisaria de XLSX com aba nomeada "PublicadorReal"
  - Hoje foi feito via SQL direto (migration)

### Colunas Glide relevantes para import
- `PioneiroAuxiliar` (BA) → `is_auxiliary_pioneer` por relatório
- `PioneiroRegular` (AV) → `is_regular_pioneer` snapshot por relatório
- `PioneiroEspecial` (AY) → `is_special_pioneer` snapshot por relatório
- `Desativado` (col 16 PublicadorReal) → `is_congregated = NOT Desativado`
- `Data Início Publicador` (col 174) → `publisher_date`

---

## 9. Backlog Priorizado

### Alta prioridade (próxima sessão)
1. **Decisão PE no S-1** (§4) → impacta view + KPIs
2. **1 relatório faltante** no DB para jun/2026 → re-import `Relatórios Glide.xlsx` quando atualizado
3. **1 publicador** no CSV sem match no DB → identificar e corrigir

### Média prioridade (Fase 2)
4. Trigger `is_late_report` automático (I-3 backlog P1)
5. Popular `rm.settings` (`submission_window_end_day = '20'`)
6. View `v_s4_annual` agrupando por `service_year`
7. RLS multi-role (secretary/group_leader)
8. KPI "Não relataram" = `Congregados − Relatórios entregues`

### Backlog aberto (não RM)
- `dispatchS89Receipt` migrar para Edge Function
- GAP UI: notificações de recusa na aba Agente

---

## 10. Âncora de Rollback

```bash
# Rollback código (pré-RM):
git reset --hard pre-rm-fase1  # tag local @ feed0c5

# Rollback DB:
DROP SCHEMA rm CASCADE;
DROP FUNCTION public.rm_open_month, public.rm_close_month;
```

---

## 11. Instruções Operacionais para o Agente

1. **NUNCA modificar invariantes sem aprovação do Eliezer** (comando epistêmico)
2. **Antes de qualquer migration**: verificar impacto em `v_s1_consolidation` e triggers
3. **Commit sempre antes do deploy**: `git commit → git push → npm run deploy`
4. **Rollback disponível**: tag `pre-rm-fase1` @ `feed0c5`
5. **Supabase MCP disponível**: `mcp_supabase_apply_migration` + `mcp_supabase_execute_sql`
6. **Não usar `has_preached` como critério de modalidade** — apenas para `field_service_status`
7. **PE's no S-1**: aguardar decisão do Eliezer (§4) antes de alterar
