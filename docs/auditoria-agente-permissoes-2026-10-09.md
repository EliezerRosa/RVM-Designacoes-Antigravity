# Auditoria: Agente (aba Chat) × Permissões × Micro-ações × Micro-modais × Modais de Relatório

> Gerado em 2026-10-09 14:55 BRT (sessão VS Code 3c6d1fa3), análise source-only, sem propostas.
> Pergunta de origem (Eliezer): *Agente-chat(aba) X permissões (funcionalidades granulares) X micro-actions X micro-modais X modais-relatórios*.
> Status: relatório entregue; etapa seguinte (decidir/atacar os 4 gaps) interrompida por cota Copilot (402 additional_spend_limit_reached).

---

## 📊 RELATÓRIO: MAPA ESTRUTURAL — Permissões, Ações, Modais e Gaps do Agente RVM

---

### **1. PERMISSÕES — Bandeiras e Resolução**

| **Bandeira/Capacidade** | **Tipo** | **Onde Resolvida** | **Consumida em** | **Observação** |
|---|---|---|---|---|
| `canSeeAgentControlPanel` | boolean | [permissionService.ts:269](../src/services/permissionService.ts#L269) | [ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx) | Visibilidade coluna 3 (painel ações); resetado para qualquer `condition` + `funcao` fora de Ancião/SRVM-Ajudante |
| `canSendZap` | boolean | [permissionService.ts:275](../src/services/permissionService.ts#L275) | [PowerfulAgentTab.tsx:prop](../src/components/PowerfulAgentTab.tsx#L48) | Só Ancião (SRVM) ou Servo Ministerial (SRVM Ajudante); gating de botão Zap |
| `canSeeSensitiveData` | boolean | [permissionService.ts:184](../src/services/permissionService.ts#L184) (policy field) | [TemporalChat.tsx:145](../src/components/TemporalChat.tsx#L145) | Buildado no contextBuilder para agente saber se publicador logado é sensitivo (Ancião) |
| `dataAccessLevel` | `'all'` \| `'filtered'` \| `'self'` | [permissionService.ts:183](../src/services/permissionService.ts#L183) (policy) | [permissionService.ts:410](../src/services/permissionService.ts#L410) | Admin=`'all'`, não-admin=policy+override; filtros aplicados em SELECT direto (RLS pré-4c) |
| `agentActions` (Set) | ação permitida | [permissionService.ts:145](../src/services/permissionService.ts#L145) (FULL_ADMIN_PERMISSIONS) | [agentActionService.ts:192](../src/services/agentActionService.ts#L192) (canAgentAction gate) | Hard-gate em executeAction; admin=all (45 ações), não-admin=policy `allowed_agent_actions` |
| `blockedActions` (Set) | ação proibida | [permissionService.ts:283](../src/services/permissionService.ts#L283) (mergeWithOverride) | [permissionService.ts:410](../src/services/permissionService.ts#L410) | Override pode bloquear mesmo se policy permite |
| `ADMIN_ONLY_ACTIONS` (Set: `MANAGE_PERMISSIONS`) | hardcoded | [permissionService.ts:93](../src/services/permissionService.ts#L93) | [permissionService.ts:412](../src/services/permissionService.ts#L412) (hard-gate) | Mesmo em policy/override, não-admin jamais consegue executar |
| `tabs` (Set<ActiveTab>) | aba visível | [permissionService.ts:145](../src/services/permissionService.ts#L145) | Integração UI (não mapeada neste eixo) | Admin=todas, não-admin=policy `allowed_tabs` |
| `isAdmin` | boolean | [permissionService.ts:208](../src/services/permissionService.ts#L208) | [permissionService.ts:409](../src/services/permissionService.ts#L409) | Profile `role='admin'` → set true; gate em canViewTab, canAgentAction |

**Resolução de Permissões — Fluxo:**
- `loadPermissions()` [permissionService.ts:214](../src/services/permissionService.ts#L214): Admin = FULL_ADMIN_PERMISSIONS (sem query); Non-admin = RPC `get_my_permissions` (phase 4b) → fetch `publisher.data.condition + funcao` → match `permission_policies` (prioridade) → merge `user_permission_overrides` 
- Cache em memória, TTL 5min [permissionService.ts:107](../src/services/permissionService.ts#L107), realtime listeners em Supabase [usePermissions.ts:70](../src/hooks/usePermissions.ts#L70)
- Fallback seguro: mínimo (read-only agent actions) [permissionService.ts:97](../src/services/permissionService.ts#L97)

---

### **2. MICRO-AÇÕES — Tipos, Permissão, Gatilho e Persistência**

| **Ação (AgentActionType)** | **O que faz** | **Escreve DB?** | **Permissão Gate** | **Gatilho (NL/Chip/Botão)** | **Linha executeAction** |
|---|---|---|---|---|---|
| `GENERATE_WEEK` | Gera designações via motor automático | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:629](../src/services/agentActionService.ts#L629) |
| `ASSIGN_PART` | Manual: designa publicador a parte | ✅ Sim (UPDATE workbook_parts) | `canAgentAction()` | NL (Gemini) + confirm via painel | [agentActionService.ts:1127](../src/services/agentActionService.ts#L1127) |
| `APPROVE_PROPOSAL` | Aprova proposta (PROPOSTA→APROVADA) | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:649](../src/services/agentActionService.ts#L649) |
| `REJECT_PROPOSAL` | Rejeita proposta (volta PENDENTE) | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:669](../src/services/agentActionService.ts#L669) |
| `COMPLETE_PART` | Marca como concluída (DESIGNADA→CONCLUIDA) | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:686](../src/services/agentActionService.ts#L686) |
| `UNDO_COMPLETE_PART` | Desfaz conclusão | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:727](../src/services/agentActionService.ts#L727) |
| `UNDO_LAST` | Desfaz última ação (undo stack) | ✅ Sim | `canAgentAction()` | Botão/Chip Desfazer | [agentActionService.ts:741](../src/services/agentActionService.ts#L741) |
| `CLEAR_WEEK` | Limpa todas as partes de uma semana | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:752](../src/services/agentActionService.ts#L752) |
| `CLEAR_RANGE` | Limpa partes em intervalo de semanas | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:777](../src/services/agentActionService.ts#L777) |
| `UPDATE_PUBLISHER` | Atualiza dados publicador (status, motivo) | ✅ Sim (propagação) | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:825](../src/services/agentActionService.ts#L825) |
| `UPDATE_AVAILABILITY` | Bloqueia datas de disponibilidade | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:861](../src/services/agentActionService.ts#L861) |
| `UPDATE_ENGINE_RULES` | Altera config do motor de designações | ✅ Sim | `canAgentAction()` | NL (Gemini) + admin | [agentActionService.ts:891](../src/services/agentActionService.ts#L891) |
| `SEND_S140` | Prepara envio de programação (WhatsApp) | ⚠️ Log apenas | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:926](../src/services/agentActionService.ts#L926) |
| `SEND_S89` | Prepara envio de cartões (WhatsApp) | ⚠️ Log apenas | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:968](../src/services/agentActionService.ts#L968) |
| `MANAGE_SPECIAL_EVENT` | CRUD de eventos especiais (CREATE_AND_APPLY, DELETE) | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1039](../src/services/agentActionService.ts#L1039) |
| `FETCH_DATA` | Query genérica tabelas (LIMIT 50) | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1001](../src/services/agentActionService.ts#L1001) |
| `SIMULATE_ASSIGNMENT` | Dry-run: simula designação sem gravar | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1088](../src/services/agentActionService.ts#L1088) |
| `CHECK_SCORE` | Exibe top-10 candidatos (análise) | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:220](../src/services/agentActionService.ts#L220) |
| `EXPLAIN_SCORE` | Explica posição/score de um publicador | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:316](../src/services/agentActionService.ts#L316) |
| `EXPLAIN_PART` | Explica restrições de uma parte | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:477](../src/services/agentActionService.ts#L477) |
| `EXPLAIN_RANKING` | Explica top-4 para parte específica | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:543](../src/services/agentActionService.ts#L543) |
| `GET_ENGINE_RULES` | Retorna config ativo do motor | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:587](../src/services/agentActionService.ts#L587) |
| `GET_ELIGIBILITY_VERSION` | Versão das regras + cooldown constants | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:608](../src/services/agentActionService.ts#L608) |
| `SHOW_MODAL` | Abre modal (publishers, workbook, events, etc) | ❌ Não | `canAgentAction()` | NL (Gemini) + TemporalChat.onActionResult | [agentActionService.ts:202](../src/services/agentActionService.ts#L202) |
| `RESOLVE_PENDING_LINKS` | Abre ProfileLinksPanel (admin) | ❌ Não | `canAgentAction()` + isAdmin check | NL (Gemini) | [agentActionService.ts:211](../src/services/agentActionService.ts#L211) |
| `NOTIFY_REFUSAL` | Envia notificação de recusa (callback) | ⚠️ Log + notif | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1381](../src/services/agentActionService.ts#L1381) |
| `MANAGE_LOCAL_NEEDS` | CRUD fila de necessidades locais | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1405](../src/services/agentActionService.ts#L1405) |
| `MANAGE_WORKBOOK_PART` | CRUD partes da apostila | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1592](../src/services/agentActionService.ts#L1592) |
| `MANAGE_WORKBOOK_WEEK` | CRUD semanas | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1647](../src/services/agentActionService.ts#L1647) |
| `IMPORT_WORKBOOK` | Importa apostila (jw.org) | ✅ Sim | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1517](../src/services/agentActionService.ts#L1517) |
| `MANAGE_PERMISSIONS` | CRUD policies + overrides (admin-only) | ✅ Sim | ADMIN_ONLY (hard-gate) | NL (Gemini) + admin UI | [agentActionService.ts:1742](../src/services/agentActionService.ts#L1742) |
| `QUERY_PUBLISHER_ASSIGNMENTS` | Lista designações de um publicador | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1941](../src/services/agentActionService.ts#L1941) |
| `QUERY_WEEK_ASSIGNMENTS` | Lista designações de uma semana | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:2005](../src/services/agentActionService.ts#L2005) |
| `QUERY_VACANT_PARTS` | Lista partes sem designação | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:2085](../src/services/agentActionService.ts#L2085) |
| `QUERY_ELIGIBILITY` | Verifica elegibilidade de publicador/parte | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:2119](../src/services/agentActionService.ts#L2119) |
| `QUERY_PUBLISHER_PROFILE` | Perfil completo do publicador | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:2172](../src/services/agentActionService.ts#L2172) |
| `QUERY_PUBLISHER_LIST` | Lista de publicadores (filtrado por perms) | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:2204](../src/services/agentActionService.ts#L2204) |
| `GET_ANALYTICS` | Analytics de participação | ❌ Não | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1461](../src/services/agentActionService.ts#L1461) |
| `NAVIGATE_WEEK` | Navega para semana no PowerfulAgentTab | ❌ Não (apenas UX) | `canAgentAction()` | NL (Gemini) | [agentActionService.ts:1342](../src/services/agentActionService.ts#L1342) |
| `VIEW_S140` | Abre visualização S-140 (não grava) | ❌ Não | `canAgentAction()` | NL (Gemini) | (não mapeado em executeAction) |
| `SHARE_S140_WHATSAPP` | Compartilha S-140 via link (não grava) | ❌ Não | `canAgentAction()` | Botão S-140 | (não mapeado em executeAction) |
| `QUERY_COOLDOWN_STATUS` | Status cooldown de um publicador | ❌ Não | `canAgentAction()` | NL (Gemini) | (não mapeado em executeAction) |
| `QUERY_LAST_PARTICIPATION` | Última participação | ❌ Não | `canAgentAction()` | NL (Gemini) | (não mapeado em executeAction) |
| `QUERY_PENDING_WEEKS` | Semanas sem gerar | ❌ Não | `canAgentAction()` | NL (Gemini) | (não mapeado em executeAction) |
| `QUERY_ANALYTICS` | Query analítica (L0 Router fast-path) | ❌ Não | `canAgentAction()` + L0 determinístico | NL (Gemini) | [routeAnalyticsIntent en agentService.ts](../src/services/agentService.ts) |

**Checklist de Permissions:**
- ✅ `canAgentAction()` gate executado em **TODA ação** [agentActionService.ts:192](../src/services/agentActionService.ts#L192)
- ✅ **Hard-gate** em MANAGE_PERMISSIONS [permissionService.ts:412](../src/services/permissionService.ts#L412)
- ✅ Fallback permissões restritas se cache falhar [permissionService.ts:97](../src/services/permissionService.ts#L97)

---

### **3. MICRO-MODAIS / DRAWERS / MICRO-UIs — Gatilho e Permissão**

| **Modal/Drawer/Component** | **Arquivo** | **Triggers** | **RPC/Service chamada** | **Permissão Gate** | **Observação** |
|---|---|---|---|---|---|
| **AgentModalHost** | [AgentModalHost.tsx](../src/components/AgentModalHost.tsx) | `SHOW_MODAL` action result | N/A (orquestrador apenas) | N/A | Dispatcher central: renderiza publishers, workbook, events, etc. |
| PublisherList (dentro AgentModalHost) | [PublisherList.tsx](../src/components/PublisherList.tsx) | AgentModalHost case 'publishers' | Supabase select | `dataAccessLevel` filtra visibilidade | Editor/Admin via `is_editor()` RLS phase 4c |
| PublisherForm (create/edit) | [PublisherForm.tsx](../src/components/PublisherForm.tsx) | AgentModalHost + manual edit button | `publisherMutationService.savePublisherWithPropagation()` | Non-admin não pode abrir | Gating de visibilidade UI + impedance check antes de save |
| SpecialEventsManager | [SpecialEventsManager.tsx](../src/components/SpecialEventsManager.tsx) | AgentModalHost case 'events' | `specialEventManagementService.createAndApply()` | `canAgentAction('MANAGE_SPECIAL_EVENT')` | CRUD eventos especiais |
| LocalNeedsQueue | [LocalNeedsQueue.tsx](../src/components/LocalNeedsQueue.tsx) | AgentModalHost case 'local_needs' | `localNeedsService` mutations | `canAgentAction('MANAGE_LOCAL_NEEDS')` | CCA/SEC têm CRUD, demais read-only |
| WorkbookTable (dentro AgentModalHost) | [WorkbookTable.tsx](../src/components/WorkbookTable.tsx) | AgentModalHost case 'workbook' | Supabase select `workbook_parts` | No RLS in phase 4a, direct SELECT | Phase 4c vai restringir |
| PartEditModal | [PartEditModal.tsx](../src/components/PartEditModal.tsx) | AgentModalHost + edit part button | `workbookManagementService.updatePart()` | Non-admin não acessa | Inline edit de partes |
| TerritoryManager | [TerritoryManager.tsx](../src/components/TerritoryManager.tsx) | AgentModalHost case 'territories' | Territory mutations | Non-admin não acessa | Terr CRUD (admin only) |
| WorkbookImportModal | [WorkbookImportModal.tsx](../src/components/WorkbookImportModal.tsx) | AgentModalHost case 'workbook_import' | `importWorkbookFromJwOrg()` | Non-admin não acessa | Upload apostila jw.org |
| ProfileLinksPanel | [ProfileLinksPanel.tsx](../src/components/admin/ProfileLinksPanel.tsx) | AgentModalHost case 'profile_links' | `admin_list_unlinked_profiles` RPC | Admin only | Vinculação profiles ↔ publishers (admin) |
| ManualReplacementModal | [ManualReplacementModal.tsx](../src/components/admin/ManualReplacementModal.tsx) | AgentModalHost case 'manual_replacement' | Replacement mutations | Admin only | Substituição manual de publicador |
| **ProposalApprovalMicroUi** | [ProposalApprovalMicroUi.tsx](../src/components/ui/ProposalApprovalMicroUi.tsx) | TemporalChat renderiza inline + RightPanelDetails drawer | `approveProposal()` / `rejectProposal()` | `canSeeApprovalMicroUi` = `accessLevel==='elder'` | Apenas Anciãos veem/interagem |
| **AvailabilityUpdateMicroUi** | [AvailabilityUpdateMicroUi.tsx](../src/components/ui/AvailabilityUpdateMicroUi.tsx) | TemporalChat renderiza inline | `publisherAvailabilityService.updateAvailability()` | No explicit gate (pode ser removido) | UPDATE availability |
| **PublisherQuickEditMicroUi** | [PublisherQuickEditMicroUi.tsx](../src/components/ui/PublisherQuickEditMicroUi.tsx) | TemporalChat renderiza inline | `publisherMutationService` | No explicit gate (pode ser removido) | Quick-edit publicador |
| **ChatDrawerShell (Left/Right)** | [ChatDrawerShell.tsx](../src/components/ui/ChatDrawerShell.tsx) | PowerfulAgentTab state | N/A (container apenas) | N/A | Drawer esquerdo (LeftPanelActions) + direito (RightPanelDetails) |
| **LeftPanelActions** | [LeftPanelActions.tsx](../src/components/ui/LeftPanelActions.tsx) | PowerfulAgentTab state + TemporalChat | N/A (UI apenas) | Chips filtrados por `allowedAgentActions` | Chips e ações semânticas contextuais |
| **RightPanelDetails** | [RightPanelDetails.tsx](../src/components/ui/RightPanelDetails.tsx) | PowerfulAgentTab state + activeMicroUis | N/A (UI apenas) | Micro-UIs renderizadas conforme permissão do agente | Renderiza micro-UIs ativas |
| **S89SelectionModal** | [S89SelectionModal.tsx](../src/components/S89SelectionModal.tsx) | PowerfulAgentTab state `showS89Modal` | `communicationService.prepareS89Message()` | No explicit gate | Seleção dia reunião + preview S-89 |
| **MyAssignmentsModal** | [MyAssignmentsModal.tsx](../src/components/MyAssignmentsModal.tsx) | PowerfulAgentTab state `showMyAssignmentsModal` | Filter por `profile.publisher_id` | `accessLevel` filters visibility | Designações do publicador logado |

**Fluxo de Abertura Modal:**
1. TemporalChat chama `agentActionService.executeAction(action)` [TemporalChat.tsx:376](../src/components/TemporalChat.tsx#L376)
2. `SHOW_MODAL` retorna `{ data: { modal: 'publishers' }, actionType: 'SHOW_MODAL' }` [agentActionService.ts:202](../src/services/agentActionService.ts#L202)
3. TemporalChat.onActionResult seta `setActiveModal(result.data.modal)` 
4. PowerfulAgentTab recebe prop e renderiza `<AgentModalHost modal={activeModal} ... />`
5. AgentModalHost dispatcher [AgentModalHost.tsx:94](../src/components/AgentModalHost.tsx#L94) renderiza componente

**Micro-UIs em Drawer:**
- FloatingMicroUiHost renderiza `activeMicroUis[]` [PowerfulAgentTab:setActiveMicroUis](../src/components/PowerfulAgentTab.tsx#L113) via callback `onActiveMicroUiChange`
- TemporalChat passa micro-UIs ativas + request de auto-open drawer [TemporalChat.tsx:72](../src/components/TemporalChat.tsx#L72)

---

### **4. MODAIS DE RELATÓRIO — Componentes, Dados, Permissão**

| **Relatório/Modal** | **Arquivo** | **Abre Via** | **Dados Fonte** | **Permissão Gate** | **Linha Chave** |
|---|---|---|---|---|---|
| **S-140 Preview** (Carrossel semanas) | [S140PreviewCarousel.tsx](../src/components/S140PreviewCarousel.tsx) | Coluna 1 (PowerfulAgentTab) | `weekParts` (props) | No explicit gate (renderiza semana focus) | Visualiza partes designadas como S-140 |
| **S-140 Multi-Weeks** | [S140MultiModal.tsx](../src/components/S140MultiModal.tsx) | Botão/Action menu | Seleciona múltiplas semanas | No explicit gate | Preview + export S-140 (papelaria) |
| **S-140 Print Route** | [S140UnifiedPrintRoute.tsx](../src/components/S140UnifiedPrintRoute.tsx) | Browser print (URL route) | `weekParts` query via API | Fase 4c RLS vai restringir | Renderização para impressão |
| **S-89 Selection** (Modal) | [S89SelectionModal.tsx](../src/components/S89SelectionModal.tsx) | Botão S-89 no PowerfulAgentTab | `weekParts` (props) | No explicit gate | Escolhe dia reunião, preview cartão designado |
| **Participation Analytics** | [ParticipationAnalytics.tsx](../src/components/ParticipationAnalytics.tsx) | TemporalChat action + drawer | `participationAnalyticsService.analyzeByContext()` | No explicit gate | Histograma/ranking participações |
| **Reports Tab (Summary)** | [ReportsTab.tsx](../src/components/ReportsTab.tsx) | Aba "Relatórios" (UI) | `analyticsService.generateSummary()` | No explicit gate (lê de `parts` local) | Gráficos resumidos (Recharts: Pie, Bar, Line) |
| **Publisher Profile History** | [PublisherHistoryTooltip.tsx](../src/components/PublisherStatusHistoryTooltip.tsx) | Tooltip (ActionControlPanel) | RPC `get_publisher_profile_history_for_form` [publisherHistoryService.ts:243](../src/services/publisherHistoryService.ts#L243) | SECURITY DEFINER validates `is_admin()` | Histórico mudanças status (admin) |
| **Publisher Assignments (MyAssignmentsModal)** | [MyAssignmentsModal.tsx](../src/components/MyAssignmentsModal.tsx) | PowerfulAgentTab | Filter local `parts` by `resolvedPublisherId === profile.publisher_id` | No explicit gate (data filtering em client) | Designações do publicador logado |
| **Portal Minhas Designações** | [MyAssignmentsPortal.tsx](../src/components/MyAssignmentsPortal.tsx) | Portal token anônimo | RPC `get_portal_part_data` [s:258](../src/services/communicationService.ts#L258) | RPC validates token (não auth.uid()) | Publicador vê só suas partes via link WhatsApp |

**Dados Sensíveis Reportados:**
- `canSeeSensitiveData()` determina se Anciãos veem motivo de inapto / recusa [contextBuilder.ts:build()](../src/services/contextBuilder.ts) → agente sabe no system prompt
- S-140 não filtra por permissão (todos veem partes designadas) — restrição ocorre em RLS phase 4c
- Analytics é READ-only (sem escrita sensível) mas calcula baseado em histórico completo (não filtra por `dataAccessLevel`)

---

### **5. GAPS — Ações Sem Gate, Permissões Inconsistentes, Client vs Server**

#### **5.1 AÇÕES COM ESCRITA SUSPEITAMENTE SEM GATE (ou gate client-only)**

| **Ação** | **Arquivo:Linha** | **Descrição do Gap** | **Severidade** | **Recomendação** |
|---|---|---|---|---|
| `AvailabilityUpdateMicroUi` onChange | [ui/AvailabilityUpdateMicroUi.tsx](../src/components/ui/AvailabilityUpdateMicroUi.tsx) | MicroUI renderizado sem verificar se `canAgentAction('UPDATE_AVAILABILITY')` — mas executeAction faz gate | Baixa | MicroUI é parte da TemporalChat; gate já existe em executeAction |
| `PublisherQuickEditMicroUi` onChange | [ui/PublisherQuickEditMicroUi.tsx](../src/components/ui/PublisherQuickEditMicroUi.tsx) | Mesmo padrão: UI sem gate explícito | Baixa | Mesmo; gate em executeAction |
| `ProposalApprovalMicroUi` | [ui/ProposalApprovalMicroUi.tsx](../src/components/ui/ProposalApprovalMicroUi.tsx) | Gate: `accessLevel==='elder'` só em TemporalChat [L322](../src/components/TemporalChat.tsx#L322); MicroUI não re-valida ao clicar | **Média** | Adicionar gate local em ProposalApprovalMicroUi antes do botão "Aprovar" |

#### **5.2 PERMISSION FLAGS DEFINIDOS MAS NÃO CONSUMIDOS**

| **Flag** | **Definido em** | **Consumido em** | **Status** | **Ação** |
|---|---|---|---|---|
| `canSendZap` | [permissionService.ts:275](../src/services/permissionService.ts#L275) | [PowerfulAgentTab.tsx:prop](../src/components/PowerfulAgentTab.tsx#L48) | ✅ Consumido no prop `canSendZap` | OK |
| `publisherFilters` (object) | [permissionService.ts:184](../src/services/permissionService.ts#L184) (PublisherFilterCriteria) | [FETCH_DATA action](../src/services/agentActionService.ts#L1001) ignora filters | **Média** | FETCH_DATA não aplica `publisherFilters` — publicador comum vê lista completa via agent |
| `dataAccessLevel` | [permissionService.ts:183](../src/services/permissionService.ts#L183) | [TemporalChat contextBuilder](../src/services/contextBuilder.ts) + queries diretas (pré-RLS) | ⚠️ Parcial | RLS phase 4c vai enforçar no SELECT; agora é client-side apenas |

#### **5.3 VERIFICAÇÃO CLIENT-ONLY vs SERVER-SIDE (Revalidação RPC/RLS)**

| **Ação** | **Gate Client** | **RPC/RLS Server** | **Risco** | **Situação Atuales** |
|---|---|---|---|---|
| `ASSIGN_PART` | `canAgentAction()` [agentActionService:192](../src/services/agentActionService.ts#L192) | Não (UPDATE direto via `workbookManagementService`) | ⚠️ Médio | Escreve no banco sem re-validar server-side; RLS phase 4c não cobre workbook_parts ainda |
| `UPDATE_PUBLISHER` | `canAgentAction()` | `publisherMutationService` → propagação + audit log | ✅ Sim (audit) | Mutation service registra ação; sem RPC SECURITY DEFINER |
| `UPDATE_AVAILABILITY` | `canAgentAction()` | RPC `record_publisher_profile_change` [api.ts:210](c:/Aigravity%20-%20RVM%20Designações/rvm-designacoes-unified/src/services/api.ts#L210) (SECURITY DEFINER) | ✅ OK | RPC re-valida permissão de escrita |
| `APPROVE_PROPOSAL` | `canAgentAction()` | RPC `approve_proposal` (SECURITY DEFINER) | ✅ OK | workbookLifecycleService provavelmente usa RPC |
| `GENERATE_WEEK` | `canAgentAction()` | Não (generationService apenas) | **Alto** | Escreve múltiplas partes sem RPC SECURITY DEFINER; risco race condition e RLS bypass |
| `SEND_S89` / `SEND_S140` | `canAgentAction()` | RPC `log_whatsapp_dispatch` (SECURITY DEFINER) [announcementService:159](../src/services/announcementService.ts#L159) | ✅ OK | Logging revalidado server-side |
| `FETCH_DATA` | `canAgentAction()` | Não (dataDiscoveryService SELECT direto) | **Alto** | **Gap crítico**: não filtra por `publisherFilters`; publicador comum acessa todos publishers via agent |
| `MANAGE_PERMISSIONS` | ADMIN_ONLY hard-gate | Sim (permission_policies RLS) | ✅ OK | CRUD policies usa Supabase table row-level security |

#### **5.4 INCONSISTÊNCIAS — System Prompt vs Gating**

| **Discrepância** | **System Prompt ([contextBuilder.ts](../src/services/contextBuilder.ts))** | **Ação Gate ([agentActionService.ts](../src/services/agentActionService.ts))** | **Impacto** |
|---|---|---|---|
| Agent vê "todos os publicadores" | Buildado com `canSeeSensitiveData`, `dataAccessLevel` | QUERY_PUBLISHER_LIST não filtra por `dataAccessLevel` | Publicador comum acha sugestão de "Bruno" mesmo se seu `dataAccessLevel=self` |
| Agent oferece "UPDATE_ENGINE_RULES" | No system prompt se `isAdmin` | Hard-gate ADMIN_ONLY | ✅ Consistente; agente não oferece se não-admin |
| Agent sabe "canSeeAgentControlPanel" | Buildado em contextBuilder | Não há ação chamada "SHOW_ACTION_CONTROL_PANEL" | ✅ OK; é apenas visibilidade UI |
| Agent pode "Enviar S-89/S-140" | `canSendZap` em context | `SEND_S89` + `SEND_S140` gateados por `canAgentAction()` | ✅ Consistente |

#### **5.5 VALIDAÇÃO DE DADOS — Sem Server-Side Revalidation**

| **Operação** | **Validação Client** | **Server-Side** | **Gap** |
|---|---|---|---|
| `ASSIGN_PART` publisherName resolve | Fuzzy match no array local [agentActionService:1206](../src/services/agentActionService.ts#L1206) | Nenhuma; UPDATE direto | Agente pode "corrigir" nome e gravá-lo se match fuzzy local funcionar, mas DB recusa fk |
| `ASSIGN_PART` elegibilidade | `checkEligibility()` local | Nenhuma (RLS não cobre workbook_parts) | Agente ignora resultado local e grava mesmo se inelegível (gate bloquearia, mas não valida) |
| `UPDATE_PUBLISHER` inapto/motivo | Validação simples (nome existe?) | `publisherMutationService` grava sem re-validar elegibilidade | Agente pode marcar como inapto sem verificação cross-part |

---

### **Resumo Consolidado — Gaps Críticos (4)**

1. **🔴 FETCH_DATA não filtra por `publisherFilters`** — publicador comum via `FETCH_DATA` acessa `publishers` completo [agentActionService.ts:1001](../src/services/agentActionService.ts#L1001). **Recomendação:** filtrar no dataDiscoveryService pelo permissionGate.
2. **🔴 GENERATE_WEEK sem RPC/RLS revalidation** — escreve múltiplas partes direto [agentActionService.ts:638](../src/services/agentActionService.ts#L638). **Recomendação:** criar RPC `agent_generate_week` com SECURITY DEFINER.
3. **🟠 ProposalApprovalMicroUi não re-valida gate** — UI renderizada sem `canAgentAction('APPROVE_PROPOSAL')` check local; gate existe em executeAction mas MicroUI pode existir fora [ui/ProposalApprovalMicroUi.tsx](../src/components/ui/ProposalApprovalMicroUi.tsx). **Recomendação:** condicional `if (canSee) { <button onClick={approve} /> }`.
4. **🟡 RLS Phase 4c não cobre `workbook_parts`** — escritas via ASSIGN_PART, COMPLETE_PART, CLEAR_WEEK ignoram RLS [agentActionService.ts:1127+](../src/services/agentActionService.ts#L1127). **Recomendação:** aplicar RLS SELECT direto quando phase 4c completar.

---

**Documento finalizado em 9 de outubro de 2026, análise source-only (sem propostas).**
---

## ADENDO — Resolução dos 4 gaps (2026-10-09 20:30 BRT)

| # | Gap | Veredito após verificação | Correção aplicada |
|---|-----|---------------------------|-------------------|
| 1 | `FETCH_DATA` ignora `publisherFilters` | **Confirmado**. `dataAccessLevel`/`publisherFilters` eram resolvidos mas nunca consumidos no cliente. RLS 4c já zera `publishers` para não-editores, mas editores não-admin com nível `filtered`/`self` viam tudo. | Novo núcleo puro [`permissionFilterCore.ts`](../src/services/permissionFilterCore.ts) (`filterPublishersByScope`, `redactSensitivePublisherFields`, `filterPublisherRowsByScope`) + `PermissionGate.getPublisherScope()` + `ResolvedPermissions.selfPublisherId`. Aplicado em `executeAction` para `FETCH_DATA` (linhas de `publishers`), `QUERY_PUBLISHER_LIST` e `QUERY_PUBLISHER_PROFILE`. Campos pastorais (`notQualifiedReason`, `noParticipationReason`, `indefinitePauseReason`) redigidos quando `!canSeeSensitiveData`. 6 testes em `permissionFilterCore.test.ts`. |
| 2 | `GENERATE_WEEK` sem revalidação server-side | **Confirmado e generalizado**: todas as 21 ações de escrita dependiam só de `canAgentAction` no cliente (RLS é binário `is_editor()`, não granular). | Migration [`20261009200000_agent_action_server_gate.sql`](../supabase/migrations/20261009200000_agent_action_server_gate.sql): RPCs `can_agent_action(text)` (espelho exato da resolução policy+override+blocked+ADMIN_ONLY) e `assert_agent_action(text)` (42501). `agentActionService.executeAction` chama `assert_agent_action` para toda ação em `WRITE_AGENT_ACTIONS` — **fail-closed**. Migration aplicada em produção (`pevstuyzlewvjidjkmea`). |
| 3 | `ProposalApprovalMicroUi` não revalida gate | **Parcialmente incorreto**: aprovar/rejeitar/bloquear data passam por `executeDirectAction → executeAction` (gate + agora RPC). O único caminho que escapava era a **edição rápida de ficha** (`handleQuickEditPublisher` / `handlePreviewPublisherEdit` chamam `publisherMutationService` direto). | Gate local em `TemporalChat.tsx` nos dois handlers: exige `canAgentAction('UPDATE_PUBLISHER')` **e** `canSeeSensitiveData()`. |
| 4 | RLS fase 4c não cobre `workbook_parts` | **Incorreto — já coberto desde 2026-08-05**. Verificado em `pg_policies`: `publishers` e `workbook_parts` com RLS ON e SELECT/INSERT/UPDATE/DELETE todos condicionados a `is_editor()` (admin, SRVM, AjSRVM, CCA, Secretário, SS). | Nenhuma. Residual aceito: `is_editor()` é binário; a granularidade por ação é garantida pelo gap 2 (RPC chamada pelo cliente — um editor mal-intencionado via DevTools ainda escreve o que `is_editor()` permite). Para fechar isso seria preciso mover as escritas do agente para RPCs SECURITY DEFINER por ação — fora de escopo. |

**Observação de dados**: as policies de produção divergem do seed `002_permissions.sql` (ex.: `Ancião` geral prio 5 **sem** `GENERATE_WEEK`; `Servo Ministerial` prio 3 **sem** `GENERATE_WEEK`). O espelho SQL lê as tabelas vivas, então acompanha automaticamente.

**Validação**: `tsc --noEmit` limpo; `npm test` 97/97; RPC testada no banco (`anon → false`, grants `authenticated` only).