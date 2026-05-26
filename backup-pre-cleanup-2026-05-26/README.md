# Backup pré-cleanup — 2026-05-26

Snapshot dos registros removidos do Supabase em 2026-05-26 (Estratégia B²
revisada após análise de impacto).

## Critério de remoção
1. `workbook_parts WHERE year < 2026` → 2.374 rows
2. `workbook_batches` (3 fantasmas, total_parts declarado mas 0 rows reais):
   - `b835e773-...` (partes_v14.xlsx)
   - `5bbc6f60-...` (ParticipacoesAntigas.xlsx)
   - `cad5cfd7-...` (TodasAsApostilas_COMPLETA.xlsx)
3. `history_records WHERE week_id < '2025-05' AND week_id <> ''` → 75 rows
   (preserva 961 de mai/2025 em diante + 5 com week_id vazio)

## Arquivos
- `workbook_batches_fantasma.json` — 3 batches
- `workbook_parts_chunk{1..4}.json` — 600+600+600+574 = 2.374 parts
- `history_records_pre_may2025.json` — 75 registros

## Validação pós-delete
| Tabela | Antes | Depois |
|---|---|---|
| workbook_parts | 2982 | 608 |
| workbook_batches | 13 | 10 |
| history_records | 1041 | 966 |

## Como restaurar (se necessário)
```powershell
# Pseudo-código — usar supabase-js ou psql COPY a partir dos JSONs
# Os arquivos contêm linhas completas com PKs originais.
```

## Observações
- Batch `8bf0fec5` (TodasAsApostilas..._Corrigida.xlsx) **foi preservado** —
  é misto (2374 pre-2026 + 383 de 2026); apenas suas parts pre-2026 foram
  removidas via DELETE direto em workbook_parts (sem cascade).
- 49 publishers cujo histórico era 100% pré-mai/2025 perdem referência
  histórica → motor de elegibilidade pode pontuá-los como "nunca designados"
  por alguns ciclos. Esperado e aceito pelo usuário.
