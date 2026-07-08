---
description: "Importar monthly_reports do Glide para rm.monthly_reports"
authorization: confirm-once
invariants:
  - "NÃO upsert de publishers sem glide_id (corromperia mestres)"
  - "NÃO re-upsert de congregações/grupos quando xlsx não tem essas abas"
  - "Operação SEMPRE idempotente (ON CONFLICT glide_row_id)"
  - "Carregar pubMap/congMap do DB quando xlsx = apenas aba Relatórios"
  - "Ordem obrigatória: cong → grupos → pubs → reports"
secrets_required: []
rollback: "DELETE FROM rm.monthly_reports WHERE glide_row_id IS NOT NULL"
---

## WHY
Os relatórios mensais vivem no Glide (Relatórios Glide.xlsx, OneDrive).
Precisam ser importados para rm.monthly_reports para habilitar análises
e o módulo S-1. A importação é on-demand (não automática).

## WHAT
- Upload via sub-aba Sincronização (UI já implementada — rmSyncService.importGlideWorkbook)
- Fonte: C:\Users\Eliez\OneDrive\...\PIONEIROS ESPECIAIS\Estância\Sup Serviço\Relatórios Glide.xlsx
- Abas esperadas: apenas "Relatórios" (sem PublicadorReal/Congregação/Grupos)
- Resultado: ~2598 linhas em rm.monthly_reports

## PHASES
1. Navegar para aba Relatórios Mensais → sub-aba Sincronização
2. Upload do arquivo Relatórios Glide.xlsx
3. Aguardar progress log: "Sem aba PublicadorReal — carregando mestres do DB…"
4. Verificar summary: reports > 0, skipped mínimo
5. Conferir no dashboard: Visão Anual mostra dados

## ADAPTERS
- browser: upload via RmSyncPortal.tsx (já deployado)
- supabase: rm.monthly_reports upsert via PostgREST

## NOTES
- O xlsx do OneDrive é o arquivo VIVO que o Glide atualiza.
- A cópia local em workspace (Glide Apps/) está DEFASADA — ignorar.
