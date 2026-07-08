---
description: "UX Visão Geral — gráficos de série anual no RmDashboard"
authorization: confirm-once
invariants:
  - "NÃO modificar schema rm.* (apenas queries de leitura)"
  - "NÃO introduzir nova dependência de pacote (recharts já está no bundle)"
  - "tsc deve passar sem erros após cada arquivo modificado"
  - "Aba Sincronização e RmSyncPortal intocados"
  - "Estado vazio (0 relatórios) deve ser tratado com mensagem orientativa"
rollback: "git revert HEAD"
---

## WHY
A Fase 1 do RM entregou a infra e a carga de mestres. Para que o secretário
(e o administrador) tenham visibilidade analítica, o RmDashboard precisa de
gráficos de série temporal mês-a-mês, além dos KPIs pontuais já existentes.

## WHAT
- Tab "Mês Atual": KPIs existentes + barra de progresso (inalterado)
- Tab "Visão Anual": BarChart recharts com 4 séries (Relatórios, Pregaram, Estudos, P. Auxiliar)
- Estado vazio: placeholder orientativo quando monthly_reports = 0
- Filtro: congregação + ano (sem mês na visão anual)

## PHASES
1. Adicionar `getConsolidationSeries(year, congregationId?)` em rmService.ts
2. Refatorar RmDashboard.tsx com tabs + BarChart + estado vazio
3. tsc --noEmit (zero erros)
4. git commit + push + deploy

## ADAPTERS
- filesystem: rvm-designacoes-unified/src/
- supabase: pevstuyzlewvjidjkmea (schema rm, read-only nesta fase)
