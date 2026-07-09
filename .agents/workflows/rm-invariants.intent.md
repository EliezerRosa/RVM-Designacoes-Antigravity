---
description: "Invariantes de negócio do módulo RM — fonte canônica de verdade"
authorization: per-step
invariants:
  - "NUNCA modificar estas regras sem aprovação explícita do Eliezer (comando epistêmico)"
  - "Qualquer alteração de schema rm.* que afete estes invariantes requer migration + test"
---

# RM — Invariantes de Negócio (2026-07-08)

> Documento canônico. Toda decisão de implementação do módulo RM deve ser consistente
> com estas regras. Em caso de conflito, a regra aqui prevalece sobre o código.

---

## I-1. Ano de Serviço (Ciclo JW)

**Regra**: O Ano de Serviço X começa em setembro(X-1) e termina em agosto(X).
- Ano de Serviço 2026 = set/2025 a ago/2026
- Ano de Serviço 2027 = set/2026 a ago/2027

**Fórmula canônica**:
```
service_year = reference_month >= 9 ? reference_year + 1 : reference_year
```

**Exemplos**:
| reference_year | reference_month | service_year |
|---------------|-----------------|-------------|
| 2025 | 9 (set) | 2026 |
| 2025 | 12 (dez) | 2026 |
| 2026 | 1 (jan) | 2026 |
| 2026 | 8 (ago) | 2026 |
| 2026 | 9 (set) | 2027 |

**Status de implementação**:
- ✅ Campo `service_year` existe em `rm.monthly_reports`
- ✅ Populado no import via Glide (`AnoServiçoQdoRelatou`)
- ❌ Nenhum CHECK constraint enforça a fórmula no DB
- ❌ `v_s1_consolidation` agrupa por ano civil, não por `service_year` (correto para S-1 mensal)
- PENDENTE: view `v_s4_annual` agrupando por `service_year` para relatório anual S-4

---

## I-2. Mês de Referência vs Mês Atual

**Regra**: O mês pendente de entrega de relatórios é SEMPRE o mês anterior ao atual.
- Se hoje = julho/2026 → mês pendente = junho/2026
- Se hoje = janeiro/2027 → mês pendente = dezembro/2026

**Fórmula**:
```typescript
const pendingMonth = now.getMonth() === 0 ? 12       : now.getMonth();
const pendingYear  = now.getMonth() === 0 ? year - 1 : now.getFullYear();
```

**Aplicações**:
- `RmDashboard`: default ao mês pendente (✅ corrigido 2026-07-08)
- `rm_open_month` RPC: ao abrir novo mês, abrir o mês pendente
- `RmReportForm`: sugerir o mês pendente como padrão ao criar relatório

---

## I-3. Janela de Entrega Sem Atraso

**Regra**: Um relatório do mês M é considerado "não atrasado" se entregue nos
primeiros 20 dias do mês M+1, EXCETO se o secretário fechar o mês M antes disso.

**Casos**:
| Situação | `is_late_report` |
|----------|-----------------|
| Relatório jun/2026 entregue em 01-20/jul/2026 | `false` |
| Relatório jun/2026 entregue em 21/jul/2026 ou depois | `true` |
| Relatório jun/2026 entregue após SEC fechar jun/2026 | `true` (independente do dia) |

**Configurável**: `rm.settings` → chave `submission_window_end_day` → valor `'20'`
(padrão 20; SEC pode alterar por congregação)

**Status de implementação**:
- ✅ Campo `is_late_report` existe em `rm.monthly_reports`
- ✅ `rm.settings` tabela existe com chave configurável
- ❌ `rm.settings` vazia (não populada com `submission_window_end_day = '20'`)
- ❌ Nenhum trigger calcula `is_late_report` automaticamente — vem do Glide
- ❌ Para relatórios criados via formulário, `is_late_report` não é calculado

**PENDENTE**: Trigger `BEFORE INSERT OR UPDATE ON rm.monthly_reports` que calcula:
```sql
NEW.is_late_report := (
    NEW.submitted_at > (make_date(NEW.reference_year, NEW.reference_month, 1)
                        + interval '1 month'
                        + ((COALESCE(cfg.value,'20')::int - 1) || ' days')::interval)
    OR EXISTS (
        SELECT 1 FROM rm.month_control mc
        WHERE mc.congregation_id = NEW.congregation_id
          AND mc.reference_year = NEW.reference_year
          AND mc.reference_month = NEW.reference_month
          AND mc.is_open = false
          AND mc.closed_at < NEW.submitted_at
    )
);
```

---

## I-4. Unicidade de Relatório por Publicador/Período Civil

**Regra**: Um publicador pode ter NO MÁXIMO um relatório por mês civil.

**Implementação**: ✅ Constraint no DB:
```sql
UNIQUE (publisher_id, reference_year, reference_month)
```

**Conflito com import Glide**: O upsert usa `ON CONFLICT (glide_row_id)`. Se o Glide
gerar dois registros para o mesmo publicador+período (emenda), o segundo INSERT é
rejeitado pelo UNIQUE civil. Comportamento correto: o sistema não aceita duplicatas de período.

---

## I-5. Relatórios Atrasados — Consolidação

**Regra**: Relatórios atrasados têm `late_consolidation_period` (YYYY-MM) indicando
em qual mês devem ser somados para fins de S-1. Um relatório de junho entregue em
agosto pode ser configurado para somar em julho.

**Status de implementação**:
- ✅ Campo `late_consolidation_period` existe
- ❌ `v_s1_consolidation` ignora este campo — agrupa por `(reference_year, reference_month)`
- PENDENTE: `v_s1_consolidation` deveria usar:
  ```sql
  COALESCE(late_consolidation_period, reference_year::text || '-' || lpad(reference_month::text,2,'0'))
  ```

---

## I-6. Horas — Somente para Pioneiros

**Regra**: O campo `hours` só deve ser preenchido para publicadores com
`is_regular_pioneer = true` ou `is_special_pioneer = true` ou `is_auxiliary_pioneer = true`.
Para não-pioneiros: `hours = NULL`.

**Status**: ✅ Campo nullable — ❌ sem CHECK constraint no DB.

---

## I-7. Status de Campo (`field_service_status`) — Cálculo Automático

Função `rm.calculate_publisher_status(publisher_id)` baseada nos últimos 6 meses civis
(janela relativa ao **dia de hoje**, não ao último relatório do publicador).

### Valores válidos (CHECK constraint)
| Status | Critério | Prioridade |
|---|---|---|
| `RECÉM-CONGREGADO` | `publisher_date` < 1 mês atrás | 1ª (máxima) |
| `ATIVO` | pregou (`has_preached=true`) em ≥1 mês dos últimos 6 | 2ª |
| `IRREGULAR` | pregou em 0 dos últimos 6 meses (inclui quem nunca relatou) | 3ª |

**Nota:** `INATIVO` e `QUASE-INATIVO` foram **eliminados** (2026-07-09).
`RECÉM-CONGREGADO` usa `publisher_date` (Data Início Publicador do Glide).
Enquanto `publisher_date = NULL`, o publicador cai no critério de atividade.

### Distinção conceitual
- **Modalidade de serviço** (Publicador/Aux/Regular/Especial) = snapshot do relatório por mês.
  Critério: flags `is_auxiliary_pioneer`, `is_regular_pioneer`, `is_special_pioneer`.
  **`has_preached` NÃO é critério de modalidade.**
- **Status de campo** (ATIVO/IRREGULAR/RECÉM-CONGREGADO) = trajetória do publicador.
  Critério: `has_preached = true` em janela de 6 meses.

### Implementação
- ✅ `rm.calculate_publisher_status()` atualizada (migration `rm_status_rules_v2c`)
- ✅ Trigger `trg_monthly_reports_recalc_status` dispara após INSERT/UPDATE/DELETE
- ✅ CHECK constraint atualizado para os 3 valores válidos
- ⚠️ `publisher_date` ainda NULL para todos os publicadores importados do Glide.
  Será populado quando o import ler `Data Início Publicador` (col 174 do CSV Glide).
  Até lá, `RECÉM-CONGREGADO` só aparece para publicadores criados manualmente com data preenchida.

---

## I-8. Mês Aberto/Fechado — Governança do Secretário

**Regra**: O secretário (SEC) controla `rm.month_control.is_open` por congregação.
- `is_open = true` → aceita novos relatórios (não atrasados)
- `is_open = false` → novos relatórios são `is_late_report = true`

**Comportamento atual**: `rm_open_month` e `rm_close_month` são RPCs em `public.*`
(SECURITY DEFINER, guarda admin). Liberação para secretário = Fase 2 (RLS multi-role).

---

## PENDÊNCIAS DE IMPLEMENTAÇÃO (backlog)

| # | Item | Prioridade |
|---|------|-----------|
| P1 | Trigger `is_late_report` automático em INSERT/UPDATE | Alta |
| P2 | Popular `rm.settings` com `submission_window_end_day = '20'` | Alta |
| P3 | Corrigir `v_s1_consolidation` para usar `late_consolidation_period` | Média |
| P4 | CHECK constraint `service_year` na fórmula sep-ago | Baixa |
| P5 | View `v_s4_annual` agrupando por `service_year` | Média |
| P6 | RLS multi-role Fase 2 (secretary/group_leader) | Planejada |

---

## Dados reais no banco (2026-07-08)

- 3 congregações · 7 grupos · 192 publicadores · 192 sync_map
- monthly_reports: 0 (aguarda upload do xlsx do OneDrive)
- Auto-match: 110 auto / 79 unmatched / 3 conflitos (Marias com encoding corrompido no Glide)
- Período histórico Glide: set/2023–jun/2026 (Ano Serviço 2024–2026) · ~2598 linhas
