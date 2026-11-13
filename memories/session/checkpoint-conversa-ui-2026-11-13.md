# Checkpoint Estável — Pós-Entrega "Conversa RVM" & Pré-Revisão do Plano (2026-11-13)

> **Data**: 2026-11-13 18:15 (BRT)  
> **Tag Git**: `checkpoint-conversa-ui-2026-11-13`  
> **Baseline de Código**: `27aaafc` (`feat(conversa): refina carrossel sem barras de rolagem e auto-ajuste responsivo de forms`)  
> **Checkpoint Anterior**: `checkpoint-pre-conversa-ui-66f083d` (pré-implementação da UI Conversa RVM)

---

## 1. Propósito deste Checkpoint

Congelar um ponto de restauração seguro após a entrega e o refinamento responsivo da UI-Chat-IA desacoplada (`src/features/conversa/**`, `conversa.html`, `api/conversa-nlu.ts`) e imediatamente antes da revisão de [`memories/repo/plano-ui-conversa-ia-2026-11-10.md`](../repo/plano-ui-conversa-ia-2026-11-10.md).

## 2. Verificações Executadas na Criação do Checkpoint (2026-11-13)

| Portão | Comando | Resultado observado |
|---|---|---|
| Suíte automatizada | `npm test` | **134/134 aprovados** (`0` falhas, `0` pulados) |
| Lint estrito Conversa | `npx eslint src/features/conversa api/conversa-nlu.ts` | **Exit 0** (`0` erros / `0` warnings) |
| Build de produção | `npm run build` (`vite build`) | **Exit 0** (`dist/index.html` e `dist/conversa.html` gerados) |
| Verificação TS completa | `npm run type-check` (`tsc -b`) | **Exit 2** (erros estritos pré-existentes no legado em `src/App.tsx`, `src/components/*` e `src/services/*`, mais 4 checagens de estreitamento em `src/features/conversa/__tests__/conversaFlow.test.ts` — código preservado sem alterações) |

## 3. Ajuste Pontual Registrado no Banco de Dados (Supabase `pevstuyzlewvjidjkmea`)

- Executado em `2026-11-13` (diretamente no BD, sem alterar arquivos do repositório):
  - **Tabela**: `workbook_parts` (`week_id = '2026-11-30'`)
  - **Registro**: `id = 58369c96-f099-4e49-a0f3-3ee2b7ddb15a` (`seq = 18`, `tipo_parte = 'Evento Especial'`, `status = 'DESIGNADA'` preservado)
  - **Alteração**: `resolved_publisher_id` atualizado de `'21'` para `'19'` (única linha modificada dentre as 23 da semana; `special_events` inalterado).

## 4. Como Restaurar em Caso de Rollback

```powershell
git fetch origin --tags
git checkout checkpoint-conversa-ui-2026-11-13
```

## 5. Próximos Passos ao Retomar

1. Retomar a revisão solicitada para [`memories/repo/plano-ui-conversa-ia-2026-11-10.md`](../repo/plano-ui-conversa-ia-2026-11-10.md).
2. Caso `src/features/conversa/` volte a ser editado, incluir o estreitamento de tipos em `src/features/conversa/__tests__/conversaFlow.test.ts` (linhas 353, 474, 475 e 494).
