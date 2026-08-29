# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-08-29 17:15 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app`
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).

---

## 2. Últimas Correções e Evoluções (2026-08-29)

### 📌 Melhorias no Agente Curador IA (Fase 6)
- **Mapeamento Exato de Partes**: A IA (Gemini) foi instruída a retornar o `part_id` exato de cada parte, substituindo a lógica frágil de Fuzzy Matching. 
- **Injeção Temática para Presidente**: O prompt agora avalia o tema central da semana (Leitura da Bíblia, primeiro Tesouros e primeiro Vida Cristã) para definir o perfil sintético do Presidente da Reunião (ex: "Apologista Maduro").
- **Liberação de Tokens**: "Cânticos" e "Orações" foram retirados da análise, evitando cortes de limite de tamanho nas últimas partes da reunião (o bug das partes "Sempre Parando na 8").
- **Fix de Regras Não Renderizadas (Bug Silencioso)**: 
  - **Problema**: O Gemini retornava literalmente `"[PART_ID: uuid]"` no JSON, o que quebrava o matching do frontend que esperava apenas `"uuid"`.
  - **Solução**: `semanticAgentService.ts` sanitiza agressivamente as chaves recebidas, removendo os brackets. Para retrocompatibilidade imediata (para dados já bugados no DB), `SemanticDraggableGenerator.tsx` faz fallback e busca também usando os brackets.
  - **Resultado**: Recomendações voltaram a ser populadas instantaneamente.

### 📌 Resolução da Desconexão de Publicadores (Caso Patrick - 2026-08-11)
- **Problema Solucionado**: Sessões sendo derrubadas por hash OAuth obsoletos na URL.
- **Mecanismo da Correção**: `window.history.replaceState` em `src/lib/supabase.ts` e otimização do `TOKEN_REFRESHED`.

---

## 3. Estado do Banco & Módulo RM

- **Publicadores Cadastrados**: 192 publicadores (129 `is_congregated=true`, 63 `false`).
- **Relatórios Mensais**: 2.442+ relatórios no schema `rm.*` (set/2023–jun/2026).
- **Status do Serviço de Campo**: Regras `rm_status_rules_v3` ativas (ATIVO=6/6, IRREGULAR=1-5/6, INATIVO=0/6, RECÉM-CONGREGADO).

---

## 4. Próximos Passos Imediatos

1. Manter monitoramento do acesso dos publicadores via portal e links Z-API.
2. Re-importar `Relatórios Glide.xlsx` quando houver novos dados para sincronização.
