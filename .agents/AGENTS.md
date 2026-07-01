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
