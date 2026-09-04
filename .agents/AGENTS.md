# Regras Persistentes — RVM Designações

## Política de Acesso e Visibilidade (CONDIÇÃO TEMPORÁRIA)

> **DATA**: 2026-07-01  
> **DECISÃO DO USUÁRIO**: Afora o Admin, só SM Ajd SRVM vê abas. Todos os demais = zero abas.  
> **STATUS**: ⏳ TEMPORÁRIO — até que funcionalidades direcionadas a outros perfis sejam implementadas.

### Tabela de Permissões por Policy (banco `permission_policies`)

| condition | funcao | `allowed_tabs` | Notas |
|---|---|---|---|
| **Admin** | _(bypass no código)_ | **TODAS** | `FULL_ADMIN_PERMISSIONS` — sem policy, hardcoded |
| **Servo Ministerial** | Ajd SRVM | `['workbook','agent']` | Único não-admin com abas |
| Ancião | SRVM | `[]` | Zero abas (é admin no profile.role) |
| Ancião | CCA | `[]` | Zero abas |
| Ancião | Ajd SRVM | `[]` | Zero abas |
| Ancião | (genérico) | `[]` | Zero abas |
| Servo Ministerial | (genérico) | `[]` | Zero abas |
| Publicador | — | `[]` | Zero abas |

- O `FALLBACK_PERMISSIONS` no código tem `tabs: ['workbook']` — mas policies específicas sempre prevalecem.
- Quando nenhuma aba é permitida, o app redireciona para a primeira aba acessível; se nenhuma, exibe tela vazia.
- Botão da aba 🤖 Agente protegido por `permissions.canViewTab('agent')` em `App.tsx`.

### Acesso via Links Z-API (Mensagens WhatsApp)

Qualquer usuário acessa APENAS os portais/modais devidos para cada link. Portais são UI isolada, **sem nav bar, sem abas**.

| # | Mensagem | Canal | Link (portal) | Componente | Auth |
|---|---|---|---|---|---|
| 1 | S-89 — Publicação lote | z-api auto | `?portal=confirm&partId=X&publisherId=Y&token=Z` | `DesignationConfirmationPortal` | Google |
| 2 | S-89 — Envio individual | z-api manual | Mesmo `?portal=confirm&...` | `DesignationConfirmationPortal` | Google |
| 3 | S-89 — com VIP Token | z-api auto | `?portal=invite&token=X` | `InvitePortal` | Token |
| 4 | Cobrança D-9 | z-api cron | `?portal=confirm&id=X&publisherId=Y&token=auto` | `DesignationConfirmationPortal` | Google |
| 5 | Reconvite M2 (não participa) | z-api cron mensal | `?portal=preferences&action=rejoin&pubId=X` | `PreferencesPortal` | Google |
| 6 | Reconvite M3 (só ajudante) | z-api cron mensal | `?portal=preferences&action=full-participation&pubId=X` | `PreferencesPortal` | Google |
| 7 | Relatório comissão M4 | z-api cron mensal | `?portal=publisher-form` | `PublisherStatusForm` | Token |
| 8 | S-89 — via WhatsApp Web | Manual (api.whatsapp.com) | Mesmo `?portal=confirm&...` | `DesignationConfirmationPortal` | Google |
| 9 | Lembretes D-7/D-2 | z-api cron | **SEM link** | — | — |
| 10 | S-140 — Publicação | z-api auto (grupo) | **SEM link** (só imagem) | — | — |
| 11 | Alerta de recusa | z-api auto (SRVM) | `?portal=replace&partId=X` | `ReplacementPortal` | Google |

### Portais existentes não enviados via WhatsApp

| Portal | Componente | Gerado por |
|---|---|---|
| `?portal=availability&token=X` | `PublisherAvailabilityPortal` | Modal S-89 / Admin |
| `?portal=my-assignments&publisher_id=X&token=X` | `MyAssignmentsPortal` | Admin |

### Regras de Reconvite (cron mensal)

- M2 (requestedNoParticipation): **NÃO enviar** a quem tem `isNotQualified = true`
- M3 (isHelperOnly): **NÃO enviar** a quem tem `isNotQualified = true`
- Implementado em `cron-whatsapp-reminders/index.ts` linhas 377-416

### Quando remover esta condição temporária

- Quando a aba RM (Relatório Mensal) for implementada e liberada
- Quando funcionalidades self-service forem criadas para publicadores
- A remoção deve atualizar: policies no banco + `FALLBACK_PERMISSIONS` no código + este documento

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

---

## Autenticação Vercel CLI / MCP e Supabase OAuth Hash (INVARIANTE 2026-08-11)

> **DATA**: 2026-08-11  
> **ESTADO-ATUAL CONSOLIDADO**:
> 1. **Vercel CLI / Deploy Auth**: A variável de ambiente do sistema Windows `VERCEL_TOKEN` deve ser mantida com Personal Access Token ativo. Comandos de deploy via CLI/MCP usam o token diretamente sem interrupções de login de navegador ou solicitações de 2FA.
> 2. **Prevenção de Loop de Renovação Supabase (`src/lib/supabase.ts`)**: Antes da inicialização do client Supabase (`createClient`), o arquivo `src/lib/supabase.ts` deve SEMPRE manter a higienização de URL hash que identifica e limpa via `window.history.replaceState` qualquer hash OAuth obsoleto/salvo em favoritos (`#access_token=...` com `iat > 60s` ou `isExpired`). Isso impede loops de renovação acelerados que acionavam HTTP 429 no Supabase Auth e derrubavam usuários (como publicadores) para a tela de login.

---

## Curador IA & Base de Conhecimento Permanente (INVARIANTE 2026-09-04)

> **DATA**: 2026-09-04  
> **DECISÃO DO USUÁRIO**: Curador atua com seleção assistida nos elegíveis desbloqueados da semana em foco, com ponto de partida determinístico (+300 pts) para perfis atribuídos no cadastro, mantendo flexibilidade total e isolamento estrito do motor automático.

1. **Isolamento do Motor 'Gerar'**: O motor rotacional determinístico (`unifiedRotationService.ts` e `generationService.ts`) é sagrado e **NUNCA** pode ser alterado pelas dinâmicas do Curador IA.
2. **Elegibilidade Estrita e Semana em Foco**: Recomendações e seleções do Curador só podem ser feitas sobre o conjunto de publicadores elegíveis desbloqueados para a parte na semana em foco (`getRankedEligibleForPart`).
3. **Ponto de Partida Determinístico + Flexibilidade**: Publicadores que possuem os perfis necessários configurados em `syntheticProfiles` (no cadastro de publicadores) recebem +300 pontos de afinidade e badge distintivo, mas o Curador jamais descarta os demais elegíveis da semana.
4. **Base de Conhecimento e Especialização**: Perfis sintéticos residem na tabela `curator_profiles` e insights temáticos na tabela `curator_batch_insights` (Supabase). O agente `curatorBatchSpecialistAgent.ts` especializa os lotes importados sem alterar as tabelas canônicas de rotação.

