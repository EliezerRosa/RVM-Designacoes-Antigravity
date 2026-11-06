# Memória de Sessão — Sincronização REST Nativa, Retenção de HG-ID e Invariantes HG-Sync (2026-11-06)

> Data: 2026-11-06 13:40 (BRT)  
> Agente: Gemini 3.8 Flash (concluindo trabalho do Argon e atendendo solicitações do Eliezer)

## 1. Objetivos da Sessão
1. Esclarecer sobre cotas dos modelos Claude e transição para modelos Gemini.
2. Concluir a sincronização automática do HG-Sync com os endpoints nativos REST do Hourglass.
3. Retenção cirúrgica de `hg_id` no Supabase (`publishers.hg_id` via RPC `public.save_publisher_hg_id`) apenas quando resolvido por fallback de nome, sem alterar código do RVM.
4. Validar no código duro a invariante: "RVM ➡️ Hourglass (sempre prevalecendo o RVM)".
5. Mapear o comportamento real da interface e mensageria do Hourglass (botão `⚠️` vs avião `✈`, push notification/e-mail vs Z-API WhatsApp).

## 2. Ações Executadas e Resultados
- **Correção em `mapper.ts`**: Corrigida a extração de `resolved.confidence !== 'unresolved'` e `resolved.hg_id` (que anteriormente verificava propriedades inexistentes `status` e `hgId`).
- **Validação dos 7 Publicadores no Supabase**:
  - Eliezer Rosa (`id: 3`, `hg_id: 2491248`)
  - Marcos Rogério (`id: 17`, `hg_id: 2489454`)
  - Renato Oliveira (`id: 19`, `hg_id: 2491349`)
  - Emerson França (`id: 20`, `hg_id: 3296264`)
  - Israel Vieira (`id: 21`, `hg_id: 2491316`)
  - Edmardo Queiroz (`id: 23`, `hg_id: 2491469`)
  - Edmilson Monteiro (`id: 28`, `hg_id: 3296262`)
- **Blindagem DOM Fallback (`browser.ts`)**: Avaliações de Playwright convertidas em strings literais para neutralizar o erro `ReferenceError: __name is not defined` gerado pelo `esbuild/tsx`.
- **Testes Unitários**: 14/14 testes verdes em `npm test --prefix hg-sync`.
- **Isolamento de Código**: 0 alterações no código principal do RVM (`src/` intacto).
- **Esclarecimento Teocrático e de Arquitetura**:
  - O Hourglass não envia WhatsApp nativamente (opera via App Push e E-mail); o RVM é essencial por entregar o S-89 interativo via Z-API.
  - O botão `⚠️` oculta a semana por pendências; converte-se no avião `✈` para envio das notificações quando liberado.
