# Regras Persistentes — RVM Designações

## Política de Acesso: Publicador Comum (CONDIÇÃO TEMPORÁRIA)

> **DATA**: 2026-07-01  
> **DECISÃO DO USUÁRIO**: Publicador comum NÃO deve ver NADA via acesso direto ao app.  
> **STATUS**: ⏳ TEMPORÁRIO — até que funcionalidades direcionadas a publicadores sejam implementadas (ex: aba RM).

### Regra
- Publicadores comuns (condition = `'Publicador'`, sem funcao especial) que façam login direto no app **NÃO devem ver nenhuma aba**.
- A policy `Publicador` no banco tem `allowed_tabs: []` (array vazio).
- O `FALLBACK_PERMISSIONS` no código tem `tabs: ['workbook']` — mas políticas específicas prevalecem.
- Quando nenhuma aba é permitida, o app deve redirecionar para a primeira aba acessível; se nenhuma, exibe tela sem conteúdo.

### Quem vê a aba 🤖 Agente (acesso direto)
- ✅ **Admin** (profile.role = 'admin') — bypass automático via `FULL_ADMIN_PERMISSIONS`
- ✅ **Ajudante SRVM** (Servo Ministerial) — policy com `'agent'` no `allowed_tabs`
- ❌ Todos os demais — **aba oculta + redirect automático**

### Quem vê o quê via links Z-API
- Links z-api usam **portal mode** (`?portal=confirm|preferences|invite|form`)
- Portais renderizam UI **isolada**, sem nav bar, sem abas
- O publicador NUNCA vê o app principal ao clicar em link z-api

### Quando remover esta condição
- Quando a aba RM (Relatório Mensal) for implementada e liberada para publicadores
- Quando funcionalidades self-service forem criadas para publicadores
- A remoção deve atualizar: policy `Publicador` no banco + este documento

---

## Fidelidade Visual — AXIOMA INEGOCIÁVEL

> **DATA**: 2026-06-30  
> **DECISÃO DO USUÁRIO**: "A exatidão visual é um axioma inegociável. Todos sem exceção devem ser como se o usuário estivesse vendo o papel."

Aplica-se a TODOS os formulários oficiais: S-4, S-1, S-21, S-61, S-89.
Técnica: `pdf-lib` overlay sobre o PDF original (mesmo padrão do S-89_T já implementado).

---

## Chat-Agente — Preparação para Upgrade Futuro

> **DATA**: 2026-07-01  
> **DECISÃO DO USUÁRIO**: Todos os usuários usarão a aba Agente para interagir com RVM+RM.

O chat-agente NÃO recebe mudança de código para suportar RM. Novas ações RM são adicionadas APENAS como novos valores no union `AgentActionType` e novos `AgentIntentContract` em `agentIntentCatalog.ts`. O sistema de permissões controla visibilidade por contexto de usuário logado. **Zero mudança em TemporalChat.tsx ou ChatAgent.tsx.**
