# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-09-19 11:45 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção (Fases 12 e 13 Concluídas — Auditoria P1-P8, Automação do S-140 via Z-API, Saneamento de `needs_reassignment`, Alerta Matinal Detalhado e Especificação do Monitor Canônico 2.0 com Solução Híbrida de Observabilidade)  
> **Checkpoint / Tag Git**: `v2.6.0-checkpoint-s140-monitor`

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app` (Deploy `dpl_6hXPt84GbSaT9oTh4N7gcz88JbZR` ativo em cima de `16024a4`).
- **Frontend GitHub Pages**: Ativo (`https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/`), sincronizado via `npm run deploy`.
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).
- **Último Commit Estável / Checkpoint**: `7fedb03` (Tag: `v2.6.0-checkpoint-s140-monitor`)
  - `20fa331`: fix(automation): resolver apontamentos da auditoria de fluxos P1-P8
  - `f831850`: feat(s140): automação de envio de S-140 via Z-API, CRUD de funções congregacionais e permissões
  - `94cc17a`: fix(reassignment): resetar needs_reassignment ao atribuir publicador e blindar cron contra partes resolvidas
  - `7fedb03`: feat(cron): detalhar semana, parte e publicador no alerta de substituicoes pendentes
- **Edge Functions Supabase Ativas (`pevstuyzlewvjidjkmea` em Produção)**:
  - `cron-whatsapp-reminders`: Blindada contra falsos alarmes de partes resolvidas e com alerta matinal detalhado por semana, data, parte e publicador.
  - `trigger-github-workflow`: v2 ativa para orquestração de disparos.
  - `zapi-smart-webhook`: v19 ativa com processamento assíncrono de botões nativos.
  - `cron-alert-notifications` e `cron-web-push`: operacionais.

---

## 2. Últimas Entregas: Fase 9 — Blindagem Total de Tokens da Comissão de Serviço (2026-09-05)

### 📌 1. Banco de Dados e RPC `authorize_publisher_form_token`
- **Novas Colunas em `publisher_form_tokens`**: `publisher_id text` e `bound_email text`.
- **Amarracão Estrita de Destinatários**:
  - Marcos Rogério (`SEC`): `publisher_id = '17'`, `bound_email = '2282739mro@gmail.com'`.
  - Israel Vieira (`CCA`): `publisher_id = '21'`, `bound_email = 'israelvieiratj941@gmail.com'`.
  - Domingos Oliveira (`SS`): `publisher_id = '22'`, `bound_email = 'domingosbel45@gmail.com'`.
  - Edmardo Queiroz (`SRVM`): `publisher_id = '23'`, `bound_email = NULL` (First-Access Binding).
- **Estratégia First-Access Binding**: Para publicadores sem e-mail cadastrado inicialmente, a RPC captura o e-mail do primeiro login Google realizado pelo link e amarra automaticamente no token e no cadastro do publicador (`publishers.data.email`).
- **Resolução Forçada de Identidade**: A autoria teocrática e o log de uso são resolvidos exclusivamente a partir do `v_token.publisher_id` gravado no banco, tornando inócuas tentativas de adulteração de parâmetros da URL (`&u=`).
- **Checagem de E-mail**: Bloqueio sumário com `reason: 'email_mismatch'` se a conta Google conectada não corresponder ao titular autorizado (com bypass para `is_admin()`).

### 📌 2. Frontend do Formulário (`PublisherStatusForm.tsx`)
- **Autenticação Google Obrigatória**: Links da Comissão de Serviço agora exibem card de login seguro com Google antes de validar permissões.
- **Tratamento Elegante de Mismatch de Conta**: Tela explicativa detalhada exibindo o titular do link, a conta Google conectada e a conta esperada, com opções de "Trocar de Conta Google" e "Sair".
- **Identificação no Header Sticky**: Exibição do e-mail do usuário logado e botão discreto de logoff.

### 📌 3. Gerenciamento no Painel Admin (`PublisherFormLinkManager.tsx`)
- Seletor para vincular novo link diretamente a um titular da Comissão / RVM (`csMembers`), preenchendo automaticamente cargo, `publisher_id` e `bound_email`.
- Exibição de badge de status do vínculo seguro na listagem de tokens (`Conta Google: ...` ou `Aguardando 1º acesso Google`).

### 📌 4. Padronização de Notificações Automáticas Z-API (`cron-whatsapp-reminders`)
- **Destinatários de Notificações de Status e Publicadores Pausados**:
  1. **Comissão de Serviço (CS)**: Coordenador do Corpo de Anciãos (Israel Vieira), Secretário (Marcos Rogério) e Superintendente de Serviço (Domingos Oliveira).
  2. **Superintendente da Reunião Vida e Ministério (SRVM)**: Edmardo Queiroz.
  3. **Admin de Sistema**: Administrador técnico (Eliezer Rosa).
- **Invariante Teocrático Confirmado**: O CCA **NÃO tem** e **NÃO deve ter** status de Admin de sistema. Todas as rotulações genéricas ou derivadas de "Admin" foram removidas. Todos os irmãos são descritos fielmente pela sua **função cadastrada** no sistema.
- **Substituição de Rota & Tokens Personalizados**: Removida a referência equivocada a "painel Admin" e a rota inexistente `?portal=publisher-status`. A notificação agora envia o link direto com token individualizado de cada irmão da tabela `publisher_form_tokens` (`?portal=publisher-form&token=...`), já protegido por autenticação Google.
- **Deploy**: Edge function `cron-whatsapp-reminders` republicada com sucesso no Supabase.

---

## 3. Auditoria Canônica: Crons, Publicação S-89, Importação e Sync (2026-09-06)

### 📌 1. Execução Real de Crons (pg_cron no Supabase)
- **Job 1 (`zapi-daily-reminders` / `cron-whatsapp-reminders`)** (12:00 UTC / 09:00 BRT):
  - **Auto-conclusão de reuniões passadas**: Varre `workbook_parts` e finaliza partes vencidas (`PROPOSTA`/`DESIGNADA` -> `CONCLUIDA`).
  - **Ciclo Semanal de Sábado (`today.getDay() === 6`)**: Executado com sucesso aos sábados, notificando via WhatsApp os membros da CS, SRVM e Admin com links protegidos por tokens Google sobre publicadores pausados por tempo indeterminado (`isIndefinitelyPaused`).
- **Job 2 (`cron-alert-notifications`)** (13:00 UTC / 10:00 BRT):
  - Sentinela de leitura: monitora falhas de despacho Z-API (A1), importações pendentes (A2), pendências de publicação em D-15 (A3) e partes órfãs em semanas já publicadas (A4).
- **Job 3 (`cron-web-push`)** (11:00 UTC / 08:00 BRT):
  - Despacha notificações Web Push nativas pendentes no navegador a partir da RPC `get_pending_push_events`.

### 📌 2. Invariantes de Publicação de Designações (S-89)
- **Bloqueio Mestre do Cron**: O cron **NUNCA** envia lembretes (D-7 ou D-2) para partes que não possuam `PUBLICACAO_S89` com status `SUCCESS` na `zapi_dispatch_log`.
- **Soberania do Botão Manual**: O envio oficial dos cartões S-89 **NÃO é automático pelo Cron**. Ele é disparado exclusivamente pelo SRVM via botão **"Publicar"** no painel da Apostila (`weekPublishService.ts`), que gera o cartão PNG Base64, o token do portal e o registro na `zapi_dispatch_log`.
- **Sentinela D-15 (Alerta A3)**: O cron apenas alerta o SRVM quando a reunião está a $\le 15$ dias e ainda não teve os S-89 emitidos.

### 📌 3. Gatilho Híbrido de Importação de Apostilas
- **Cron Mensal (Dia 1º)**: O Bloco M1 calcula as semanas dos próximos 60 dias e, se faltarem semanas no banco, grava a flag `pending_auto_import` em `app_settings`.
- **Execução Desacoplada no Frontend (`useAutoFlags.ts`)**: Ao abrir a aplicação, o hook consome a flag e baixa as semanas via `jwOrgService.ts`, alertando o SRVM no WhatsApp ao finalizar.
- **Cobrança Diária**: Se a flag não for consumida, o `cron-alert-notifications` (Alerta A2) cobra o SRVM diariamente às 10:00 BRT.

### 📌 4. Designações Automáticas: Cron vs Código Duro
- **Cron**: **NÃO gera designações de partes sozinho em background** (evita decisões sem supervisão pastoral e sobrecarga de contexto).
- **Código Duro do App (`generationService.ts`)**: Executa o motor rotacional determinístico em 3 fases com anti-fome (Presidência -> Ensino -> Estudantes), com auto-propagação do Presidente para Oração Inicial, Comentários e Elogios (`isAutoAssignedToChairman`), pareamento litúrgico de gênero e pareamento estrito de menores com os pais.

### 📌 5. Auditoria de Sincronização Local x Remoto
- **Git `main` e GitHub `origin/main`**: 100% sincronizados no commit estável `16024a4`.
- **Vercel Produção**: 100% ativo no commit `16024a4` (`dpl_6hXPt84GbSaT9oTh4N7gcz88JbZR`).
- **GitHub Pages**: Sincronizado via `npm run deploy` (`gh-pages`).
- **Supabase**: Banco de produção ativo com todas as RPCs e tabelas.
- **Projeto HVAC-R (Refrigeração)**: Preservado e isolado em `C:\Users\Eliez\.gemini\antigravity-ide\scratch\hvacr-apresentacao\`.

---

## 4. Entregas da Fase 8 — Auditoria Real, Invariante "Legado" e Blindagem de Autor

### 📌 1. Sanitização Invariante de Autoria no Supabase
- **Regra Invariante Aplicada**: Todo registro em `publisher_profile_history` sem identificação estrita de log (`token` e `author_id` nulos) foi atualizado para **`"legado"`** (122 registros).
- **Preservação de Registros Reais**: Os 7 registros com token comprovado do Secretário (`373adba0…` - Marcos Rogério) foram preservados intactos.
- **Sincronização em `publishers.data.profileMeta`**: 69 publicadores que possuíam carimbo derivado anterior (`CCA` ou `Admin`) foram limpos para `updatedBy = "legado"`.
- **RPC `record_publisher_profile_change`**: Adicionado fallback rigoroso `v_effective_author := COALESCE(NULLIF(TRIM(p_author_label), ''), 'legado')`.

### 📌 2. Restrição Estrita de Correção Manual ao Administrador
- **Frontend (`PublisherStatusForm.tsx` & `PublisherStatusHistoryTooltip.tsx`)**:
  - A permissão `canEditAuthor` foi travada exclusivamente para `isAdminAccess || role === 'admin'`.
  - Para todos os demais usuários (acesso via links de WhatsApp com token de CCA, SEC, SRVM ou CS), os botões `✏️ Corrigir Autor` e `corrigir` são **completamente omitidos do DOM**.
  - Abertura de histórico configurada para acionamento **exclusivamente sob clique**.
- **Banco de Dados (`update_publisher_profile_history_author`)**:
  - A RPC agora exige formalmente `public.is_admin()` ou role de `admin` em `profiles`. Tokens de portal não possuem privilégio de alterar o histórico de auditoria.

---

## 3. Próxima Fase: Blindagem Total de Tokens (Publisher ID + E-mail do Logado)
- **Objetivo**: Atrelar cada token diretamente ao `publisher_id` e exigir que o usuário que abre o link esteja autenticado com o e-mail correspondente (`bound_email`).
- **Checkpoint de Risco**: Criado plano formal de implementação (`implementation_plan.md`) para garantir que irmãos sem e-mail cadastrado (como Edmardo Queiroz) não sejam bloqueados acidentalmente.

### 📌 1. Atribuição Real de Autoria Teocrática (CCA vs Admin)
- **Correção Histórica no Supabase**: Todos os registros precedentes de inaptidão (`isNotQualified`) e pausas pastorais (como Gustavo Rangel, Larissa Queiroz, Brenda Cristine, Eugenio Longo, Gerusa Souza, Gabriel Henrique, etc.) foram corrigidos de `author_label = 'Admin'` para `author_label = 'CCA'`. O `profileMeta.updatedBy` nos JSONs de `publishers` foi igualmente sincronizado.
- **Seletor de Autoria no Modo Admin (`PublisherStatusForm.tsx`)**: No topo do formulário, o operador admin conta com um seletor dinâmico com persistência em `localStorage`:
  `👤 Registrar alterações como: [ 👑 CCA: Israel Vieira ▾ ]`
  - Opções: CCA (Israel Vieira), SEC (Marcos Rogério), SRVM (Edmardo Queiroz), Comissão de Serviço, Admin (Ajuste Técnico).
  - Novas gravações em lote recebem automaticamente a autoria do ancião/comissão responsável.
- **Formatação Limpa de Autoria**: `formatAuthorShort` limpa prefixos redundantes (`SEC : SEC - Marcos Rogério` -> `SEC: Marcos Rogério`).

### 📌 2. Eliminação de Falsos Positivos ("NÃO VERDADE;")
- **Diff Semântico Inteligente**: Sanitização de registros com `isFieldActuallyChanged`, tratando `null vs false`, `null vs ""` e `null vs []` como equivalentes, impedindo que campos não alterados gerem histórico falso.
- **Isolamento Estrito por Seção**: O popover e os badges filtram rigorosamente apenas os campos pertencentes à aba ativa (`Status de Participação`, `Privilégios`, `Por Seção`), evitando vazamento de dados pessoais (cônjuge, etc.) na área de status.

### 📌 3. Status Invisíveis a Nível de Código Duro
- Mapeamento e transparência de 6 regras rígidas de bloqueio do motor (`eligibilityService.ts`): Disponibilidade Temporal, Não Batizado, Restrições Litúrgicas de Gênero, Faixa Etária Infantil, Pareamento Estrito com Pais e Não Congregado.
- Botão explicativo `🔍 Status Invisíveis (Código Duro)` disponível na barra de ferramentas.

### 📌 4. Ergonomia e Plasticidade da Tela
- Cabeçalho superior com barra de ações ancorada no topo (`position: sticky; top: 0; zIndex: 100`).
- Cabeçalho das colunas da tabela (`<th>`) sticky com container de rolagem vertical independente (`max-height: calc(100vh - 195px); overflow: auto`), mantendo os títulos das colunas visíveis durante a navegação.

---

## 2. Últimas Entregas: Agente Curador IA & Base de Conhecimento (2026-09-03 / 2026-09-04)

### 📌 1. Ergonomia do Botão Flutuante do Curador
- **Posicionamento Canônico**: O botão do Curador IA (`SemanticDraggableGenerator`) é acoplado por padrão no **canto inferior esquerdo** do rodapé da tela ao entrar na semana.
- **Comportamento Retrátil**: Permanece minimizado/retrátil exibindo apenas o badge com a contagem de regras/partes da semana; expande-se e abre o modal somente sob comando/clique do usuário.
- **Arrasto Suave (Drag & Drop)**: O usuário pode arrastar o botão livremente para qualquer área da tela durante o trabalho; ao mudar ou reentrar na semana, o botão reseta suavemente para o rodapé esquerdo.

### 📌 2. Integração com Elegíveis do Motor (Filtro de Desbloqueio / Clearance)
- **Elegibilidade Garantida**: A seleção do Curador é restrita estritamente aos irmãos elegíveis que ficam visíveis quando o mecanismo de desbloqueio do motor é acionado.
- **Preservação de Regras**: Todas as regras determinísticas (cooldown, gênero, privilégios, disponibilidade, restrições e exclusões) já chegam pré-aplicadas pela função `getRankedEligibleForPart()`.
- **Foco Semanal e Individual**: A seleção do Curador opera exclusivamente entre os irmãos elencados na semana em foco, processando cada parte individualmente.

### 📌 3. Agente Especialista de Lote (`curatorBatchSpecialistAgent`)
- **Especialização Contínua**: Um agente dedicado entra em ação automaticamente após a importação de novos lotes de apostilas (via `WorkbookManager.tsx`) ou sob demanda pelo botão "Especializar Lote".
- **Meta-Análise Contextual**: O modelo (Gemini Flash via proxy proxy-resiliente) varre o lote completo, identifica temas centrais (ex: o livro profético de Jeremias nos meses de Setembro e Outubro de 2026) e infere perfis necessários.
- **Enriquecimento Dinâmico**: Ele cria novos perfis ou enriquece os perfis existentes adicionando insights práticos da congregação.

### 📌 4. Base de Conhecimento Permanente de Perfis (Supabase)
- **Tabela `curator_profiles`**: Armazena permanentemente os 16+ perfis típicos e seus metadados (`ideal_traits`, `avoid_traits`, `applicable_roles`, `keywords`, `insights`).
- **Tabela `curator_batch_insights`**: Registra as análises de cada lote importado com temas centrais, livros bíblicos em foco e timestamp de análise.
- **Serviço Central**: [`src/services/curatorKnowledgeBaseService.ts`](file:///c:/Antigravity%20-%20RVM%20Designa%C3%A7%C3%B5es/rvm-designacoes-unified/src/services/curatorKnowledgeBaseService.ts).

### 📌 5. Cadastro de Publicadores com Perfis Sintéticos Multi-Select (+1)
- **Interface no Cadastro**: O formulário [`PublisherForm.tsx`](file:///c:/Antigravity%20-%20RVM%20Designa%C3%A7%C3%B5es/rvm-designacoes-unified/src/components/PublisherForm.tsx) agora conta com um seletor interativo de tags alimentado dinamicamente pelos perfis da Base de Conhecimento.
- **Seleção Múltipla (+1)**: Cada publicador pode receber um ou mais perfis aplicáveis (ex: "Conselheiro Amoroso", "Instrutor Bíblico Eloquente", "Acolhedor").
- **Persistência Transparente**: O array de IDs de perfis é salvo no campo `syntheticProfiles?: string[]` dentro do payload JSONB do publicador no Supabase.

### 📌 6. Curador Híbrido: Ponto de Partida Determinístico + Flexibilidade Contextual
- **Ponto de Partida Determinístico**: Se um publicador possui em seu cadastro o perfil exato exigido para a parte, ele recebe um bônus determinístico expressivo (+300 pontos de afinidade) e o badge visual `💎 Perfil Atribuído no Cadastro`.
- **Flexibilidade Total**: O Curador não restringe a lista apenas a quem possui o perfil pré-cadastrado. Todos os irmãos elegíveis da semana são ranqueados considerando histórico, tema da parte e compatibilidade contextual, permitindo ao secretário escolher qualquer elegível.
- **Zero Interferência no Motor "Gerar"**: O motor principal de rotação automática (`unifiedRotationService.ts`, `generationService.ts`) permanece 100% isolado e inalterado. O Curador atua estritamente como assessor/consultor de casting em tempo de tela.

---

## 3. Estado do Banco de Dados & Módulo RM

- **Publicadores Cadastrados**: 192 publicadores (129 `is_congregated=true`, 63 `false`).
- **Perfis Sintéticos na Base de Conhecimento**: 16 perfis canônicos ativos + insights contextuais de Jeremias (Set/Out 2026).
- **Relatórios Mensais (RM)**: 2.442+ relatórios no schema `rm.*` (set/2023–jun/2026).
- **Status do Serviço de Campo**: Regras `rm_status_rules_v3` ativas (ATIVO=6/6, IRREGULAR=1-5/6, INATIVO=0/6, RECÉM-CONGREGADO).
- **Invariante de Auth / Hash OAuth**: Higienização permanente em `src/lib/supabase.ts` ativa contra loops 429.

---

## 4. Consolidação Canônica de Migrations & Harmonização de Auth (2026-09-06)

### 📌 1. Migrations Extraídas para `supabase/migrations/`
1. `20260904000000_curator_knowledge_base.sql`:
   - Tabelas `curator_profiles` e `curator_batch_insights` + índices e políticas RLS.
2. `20260905000000_fase8_publisher_profile_history_and_semantic_diff.sql`:
   - Tabelas `publisher_profile_history` e `publisher_profile_change_notifications`.
   - RPC `record_publisher_profile_change` (diff semântico inteligente, fallback `'legado'`).
   - RPC `get_publisher_profile_history_for_form` (leitura segura para formulário).
   - RPC `dismiss_publisher_profile_notification` (dismiss admin).
   - RPC `update_publisher_profile_history_author` (exclusividade estrita para `is_admin()`, eliminando sobrecarga legada).
3. `20260905060000_expand_is_editor_for_cs.sql`:
   - Harmonização da função PostgreSQL `public.is_editor()` para incluir `'Secretário'` e `'Superintendente de Serviço'`, destravando operações de RLS para todos os membros da CS.
4. `20260905120000_fase9_publisher_tokens_first_access_binding.sql`:
   - Colunas `publisher_id` e `bound_email` na tabela `publisher_form_tokens`.
   - RPC `authorize_publisher_form_token` com resolução de nome antecipada, First-Access Binding e retorno explícito de `expected_email` e `expected_publisher_name` em caso de mismatch.

### 📌 2. Auditoria e Resolução de Contradições de Auth
1. **Desacoplamento de Google Auth x WhatsApp 2FA (`PublisherStatusForm.tsx`)**:
   - Corrigido travamento onde membros da CS com conta Google válida ficavam presos na tela de login porque `isAuthenticated` exigia `whatsapp_verified: true`. A validação do token agora checa a sessão Google ativa (`!user`).
2. **Eliminação de Sobrecarga Vulnerável**:
   - A versão legada de 3 parâmetros de `update_publisher_profile_history_author` que aceitava tokens foi dropada no Supabase e expurgada das migrations.
3. **RLS Unificada da CS**:
   - `is_editor()` agora abrange Coordenador, Secretário, Superintendente de Serviço, SRVM e Ajudante de SRVM.

---

## 5. Robô Headless de Automação RVM: Geração Antecipada (D-30) e Publicação (D-21) (2026-09-06)

### 📌 1. Arquitetura Operacional
- **Opção B (GitHub Actions + Puppeteer)**:
  - Workflow canônico: [`.github/workflows/headless-bot.yml`](file:///c:/Antigravity%20-%20RVM%20Designa%C3%A7%C3%B5es/rvm-designacoes-unified/.github/workflows/headless-bot.yml) executado diariamente às **08:00 BRT (11:00 UTC)**, rodando 1 hora antes do cron de lembretes diários Z-API (09:00 BRT).
  - Script executor: [`scripts/headless-bot.js`](file:///c:/Antigravity%20-%20RVM%20Designa%C3%A7%C3%B5es/rvm-designacoes-unified/scripts/headless-bot.js) que inicializa Chromium headless com suporte pleno a Canvas/DOM.
  - Componente Worker: [`src/components/AutomationWorker.tsx`](file:///c:/Antigravity%20-%20RVM%20Designa%C3%A7%C3%B5es/rvm-designacoes-unified/src/components/AutomationWorker.tsx) na rota pública `/?portal=automation-worker&token=...`.

### 📌 2. Invariante de Autenticação Segura (Supabase)
- **Token no Banco**: Chave `automation_bot_token` registrada em `public.app_settings`.
- **RPC `verify_automation_bot_token(p_token text)`**: Função `SECURITY DEFINER` que valida a credencial do bot sem expor tokens ou segredos no bundle compilado do frontend.
- **Migration**: [`supabase/migrations/20260906160000_automation_bot_token_rpc.sql`](file:///c:/Antigravity%20-%20RVM%20Designa%C3%A7%C3%B5es/rvm-designacoes-unified/supabase/migrations/20260906160000_automation_bot_token_rpc.sql).

### 📌 3. Regras de Disparo D-30 e D-21
1. **Geração Antecipada (D-30: Janela de 22 a 35 dias)**:
   - Se uma semana futura estiver vazia (>50% das partes sem publicador), o motor `generationService.generateDesignations` preenche as partes com status `PROPOSTA`.
   - As partes permanecem em rascunho por ~9 dias para conferência e ajustes da liderança da RVM antes da emissão de qualquer cartão.
2. **Publicação Automática S-89 (D-21: Janela $\le 21$ dias)**:
   - Para qualquer semana com reunião em $\le 21$ dias que já esteja designada e ainda não publicada (`!isWeekPublished`), o bot executa `publishWeek`.
   - Renderiza os cartões S-89 via Canvas/PDF offscreen, despacha via Z-API para os irmãos, registra `week_published` e carimba `zapi_dispatch_log`.
   - Recupera automaticamente semanas pendentes que já passaram de D-21 (como a semana de 21/set/2026 em D-15).

### 📌 4. Invariante Estrito de Comunicação (Z-API)
- Avisos de geração em lote (D-30) e relatórios de publicação (D-21) são enviados **EXCLUSIVAMENTE** para:
  1. **Admin de Sistema**: Eliezer Rosa (`27992035302`)
  2. **Superintendente da RVM (SRVM)**: Edmardo Queiroz (`27998412368`)
  3. **Ajudantes do SRVM**: Patrick de Oliveira (`27999598949`) e Eliezer Rosa
- Membros da Comissão de Serviço (CCA, Secretário e SS) e grupos gerais de congregação **NÃO** recebem esses comunicados de rotação da RVM.

### 📌 5. Idempotência e Auditoria
- Cada ciclo registra em `public.automation_bot_log` com tipo `D-30_GENERATION` ou `D-21_PUBLICATION`. Registros com status `SUCCESS` no mesmo dia impedem disparos repetidos.

---

## 6. Próximos Passos Imediatos

1. Acompanhar a primeira execução do workflow `headless-bot.yml` no GitHub Actions (ou disparo manual via `workflow_dispatch`).
2. Monitorar a publicação automática da semana de 21/set/2026 e a geração em rascunho da semana de 05/out/2026.
3. Concluir a flag de "Pausa por Tempo Indeterminado" com lembrete semanal via Cron no WhatsApp.

---

## 7. Checkpoint Arquitetural: Migração para Inteligência Nativa Permanente (Opção 3)

- **Data do Checkpoint**: 2026-09-08
- **Tag Git de Resguardo**: `checkpoint-pre-opcao3-permanente`
- **Decisão Estratégica**:
  1. **Adoção Definitiva da Opção 3**: A inteligência conversacional via Z-API passa a ser o motor padrão, permanente e nativo do RVM para comunicação de designações (sem toggle de desativação, sem arquitetura temporária).
  2. **Extinção do Link Web no WhatsApp**: Os cartões S-89 e notificações deixam de carregar links para o portal web no navegador (`/?portal=confirm&token=...`), eliminando o atrito de abertura de navegadores e logins em celulares.
  3. **Interação Híbrida Nativa**: A confirmação de partes passa a ser feita por:
     - **Botões Nativos do WhatsApp**: `[✅ Confirmar]` e `[❌ Não Poderei]` com resposta determinística em 1 toque.
     - **Leitura Conversacional Completa**: Processamento inteligente contínuo de respostas em texto livre, áudios e reações de emojis (👍, ❌).
  4. **Invariante Absoluta de Notificações**: Recusas, justificativas e substituições comunicadas exclusivamente para:
     - **O Superintendente (SRVM)**
     - **Ajudante do SRVM**
     - **Admins**
     - *(A Comissão de Serviço - CS - permanece estritamente isolada dessa operação diária).*
  5. **Simplificação e Limpeza**: Descontinuação do gatilho legado duplicado (`trg_webhook_whatsapp_orchestrator`) em favor da nova Edge Function unificada (`zapi-smart-webhook`).

---

## 8. Fase 10 — Implementação Definitiva S-89 via WhatsApp, Unificação DRY e Retrocompatibilidade (2026-09-10)

### 📌 1. Arquitetura DRY Estrita e Eliminação de Redundâncias
- **Fonte Única de Verdade**: `communicationService.prepareS89Message` é agora o **único** ponto de geração do corpo da mensagem S-89 em todo o sistema.
- **Limpeza de Chamadas Residuais**: Removidos imports e chamadas não canônicas a `generateWhatsAppMessage` em `AgentModalHost.tsx`, `WorkbookManager.tsx` e `ReplacementPortal.tsx`. Todas as telas e serviços usam exclusivamente `prepareS89Message`.
- **Assinatura Padronizada**: `prepareS89Message(part, publishers, allWeekParts, options)` retorna `{ content, phone, availabilityUrl, confirmationUrl }`.

### 📌 2. Fluxo Nativo Z-API (`isZApiFlow = true`)
- **Cartão Visual Limpo**: Envio da imagem PNG do cartão S-89 renderizada em alta fidelidade pelo Canvas/DOM sem sobrecarga ou poluição de legendas.
- **Três Botões Nativos do WhatsApp**:
  1. `[✅ Confirmar]`: Dispara callback determinístico (`confirm_<partId>`) que transiciona o status da designação para `CONFIRMADA` em 1 toque.
  2. `[❌ Não Poderei]`: Abre o fluxo de justificativa/recusa (`decline_<partId>`) com alerta imediato para SRVM, Ajudante e Admin.
  3. `[📅 Disponibilidade]`: Botão de link nativo de ação direcionando para o Portal de Disponibilidade do publicador (`https://.../?portal=availability&token=<token>`).
- **Supressão de Links Crus**: No modo Z-API, o texto da mensagem não exibe URLs cruas de portal web (`/?portal=confirm&token=...`), proporcionando interface limpa e moderna.
- **Sanitização Pré-Disparo**: Função `communicationService.sanitizeMessageForZApi(text)` limpa links de confirmação web inseridos manualmente pelo operador antes do despacho via Z-API.
- **Invariante de Resposta**: Detecção de respostas em texto livre condicionada à prévia existência de disparo registrado em `zapi_dispatch_log` para aquela parte e telefone.

### 📌 3. Fluxo Clássico / Sem Z-API / Fallback (`isZApiFlow = false`)
- **Retrocompatibilidade Plena**: Suporte total e ininterrupto ao botão clássico `Zap 📤` do modal e a lembretes de partes não confirmadas.
- **Inclusão Automática do Link Web**: Quando `isZApiFlow` é falso, `prepareS89Message` gera o token seguro via `communicationService.getOrCreateConfirmationToken` e embute explicitamente na mensagem:
  `👉 *Portal Web:* https://.../?portal=confirm&token=<token>`
- Garante que congregações ou momentos sem integração Z-API ativa continuem permitindo confirmação pelo navegador via WhatsApp Web.

### 📌 4. Sincronização Dual-Table no Supabase (`settings` x `app_settings`)
- **Resolução Unificada da RPC `authorize_availability_portal`**: A migration atualizada faz a busca canônica primeiro em `app_settings` com fallback em `settings`.
- **Gravação Bidirecional**: `communicationService.getOrCreateAvailabilityLink` grava e atualiza os tokens em ambas as tabelas (`app_settings` e `settings`), eliminando erros de autorização decorrentes de divergências de schema.

### 📌 5. Comparativo Operacional: S-89 vs S-140 vs Status Board

| Funcionalidade | Com Z-API (`isZApiFlow: true`) | Sem Z-API / Manual (`Zap 📤` / Web) |
| :--- | :--- | :--- |
| **S-89 (Designação)** | Imagem PNG + Mensagem limpa + 3 botões nativos (`Confirmar`, `Não Poderei`, `Disponibilidade`). Sem URLs no texto. | Link explícito do portal web no texto (`/?portal=confirm&token=...`) + Abertura direta no WhatsApp Web. |
| **S-140 (Programação Completa)** | Disparo automático via API da imagem PNG e legenda para SRVM, Ajudantes e Grupo cadastrados. | Imagem copiada para Área de Transferência (Clipboard) + Abertura da janela do WhatsApp Web com texto pré-preenchido. |
| **Status Board (Quadro Geral)** | Disparo automático do relatório consolidado e imagem para destinatários cadastrados. | Cópia do texto/imagem para o Clipboard + Abertura manual do WhatsApp Web. |

### 📌 6. Higienização Completa de Testes
- **Banco de Dados Supabase (`pevstuyzlewvjidjkmea`)**: Excluídos todos os registros e logs da designação fictícia de teste da semana de 08/out/2026 (`fa000000-0000-4000-8000-000000000001` em `workbook_parts` e `zapi_dispatch_log`).
- **Repositório**: Removidos artefatos de teste locais (`public/test_s89_generated.png`, `scripts/test_live_image.ts` e `scripts/test_render_s89_playwright.ts`).
- **Validação de Tipagem**: `npx tsc --noEmit` executado com zero erros em 100% do projeto.

---

## 9. Auditoria Recente de Rotinas (Crons) e Status de Testes (2026-09-14)

### 📌 1. Dívida Semântica na UI ("Agenda de Automação")
Foi constatado no código-fonte (`supabase/functions`) que a interface do modal `AutomationScheduleModal.tsx` está defasada em relação às invariantes arquiteturais da Fase 10:
- **O Mito do "D-9 (Cobrança)":** A interface rotula o D-9 como "Cobrança". Na realidade, o código implementa a **Cobrança Contínua a cada 72 Horas** para partes `PROPOSTA` (pendentes de confirmação), que reutiliza o S-89 via `COBRANCA_72H`. O "D-9" interno é apenas mais um lembrete idêntico ao D-7 e D-2.
- **A Sentinela Real é o D-15:** O alerta que avisa o SRVM que a reunião está próxima e não foi publicada (Alerta A3) é engatilhado matematicamente em `diffDays <= 15`, e não no D-9. 
- **Lembretes Pós-Confirmação:** Com a **Opção 3** ativa, a emissão do S-89 com botões nativos acontece automaticamente no **D-21** (Robô Headless). Portanto, os lembretes de **D-9, D-7 e D-2** não enviam mais a primeira notificação; eles são estritamente enviados para partes já `DESIGNADA` (confirmadas), servindo como meros lembretes de proximidade.
- **Isolamento de Kill-Switch:** A chave "Automação Z-API Background" na UI desliga **apenas** os crons internos (Lembretes e Cobranças de 72h). O fluxo de Auto-Designação (D-30) e Auto-Publicação (D-21) não é afetado, pois reside no *GitHub Actions* (`headless-bot.yml`). A interface precisa ser atualizada para clarificar isso.

### 📌 2. Status dos Testes Automatizados (Code-level)
A suíte completa de testes de código foi executada e reportou o seguinte estado atual:
- **Testes Unitários:** 🔴 **5 Falharam** | 🟢 **70 Passaram** | 75 Total
  - 4 falhas oriundas de um erro de importação de `.css` da biblioteca `driver.js` no motor de testes nativo (`tsx`), afetando o `WorkbookManager.test.tsx`.
  - 1 falha lógica no motor de rotação `unifiedRotationService.test.ts` (Assertion Error: *sem filtrar, weeksSinceLast vira 0 (loop)* — actual: 40, expected: 0).
- **Testes End-to-End (Playwright):** 🟢 **5 Passaram** | 0 Falhas (100% sucesso)
  - Todos os 5 fluxos visuais do `login.spec.ts` de resiliência e fallback biométrico e autorização RLS (Caso Patrick e Z-API 2FA) operaram sem falhas em ~25s.

---

## 10. Checkpoint Arquitetural: Log Canônico, Auto-Reparo e Web Push (Fase 11 - Planejamento)

- **Data do Checkpoint**: 2026-09-15
- **Objetivos Consolidados**:
  1. **Log Canônico Unificado:** Criação da view `vw_canonical_communication_log` unindo `zapi_dispatch_log` (Outbound), `zapi_smart_interactions` (Inbound) e `push_dispatch_log` (Push PWA). O novo painel `CommunicationLogPanel.tsx` usará Supabase Realtime para notificar o Admin (Toasts) sem poluir abas de segurança.
  2. **Transparência de Bloqueios:** O Log exibirá os motivos lógicos pelos quais mensagens foram ignoradas pelo cron (ex: "Falta de S-89 prévio", "Aquiescência Tácita").
  3. **Auto-Reparo do Limbo Legado:** Modificação do `cron-whatsapp-reminders` para resgatar designações manuais antigas sem `PUBLICACAO_S89`. O cron enviará o D-7/D-2 direto para partes `DESIGNADA` e atirará o S-89 atrasado (resgate) para partes `PROPOSTA` presas há 72h.
  4. **Alertas Operacionais do SRVM:** Novo resumo diário de pendências (Ghosting de publicadores, Recusas esquecidas, Buracos no D-23) entregue via Z-API/Push.
  5. **Estratégia Rica de Web Push (PWA):** Notificações expansíveis com Deep Link (`wa.me/bot`) para furar fila de atenção.
  6. **Onboarding Silencioso de Push:** Adição de um 4º botão (URL Button nativo do WhatsApp: `[ 🔔 Ativar Notificações ]`) apenas para usuários que não têm permissão PWA ativa, induzindo-os a ativar o Push pelo navegador.

---

## 11. Brainstorm e Planejamento: Automa��es Avan�adas Z-API e Invariantes de Substitui��o (2026-09-16)

### ?? 1. Capacidades Inexploradas da Z-API Mapeadas
- **Option-Lists (Menus Interativos)** limitados a 10 itens por gaveta (ideal para coleta de disponibilidade mensal ou pequenos fluxos de m�ltipla escolha).
- **Jittering de Envio**: Necessidade de adicionar pequenos delays (2-5s) no envio de lotes do S-140 para evitar banimentos por burst rate e engasgos na fila.
- **Queda de Sess�o**: Uso do webhook `on-disconnected` atrelado � nossa rec�m-criada Web Push Notification para alertar o Admin imediatamente em caso de queda do WhatsApp.

### ?? 2. Blindagem Obrigat�ria: Idempot�ncia do Webhook
- **O Problema:** A Z-API reenvia webhooks incessantemente se o servidor n�o responder HTTP 200 entre 3 a 5 segundos.
- **A Solu��o:** Isolar o processamento real (consultas no Supabase, IA, disparo de Z-API) usando `EdgeRuntime.waitUntil()`, devolvendo imediatamente o `200 OK` logo na entrada da Edge Function.

### ?? 3. Invariantes Absolutas (Cravadas na Pedra)
- **Lideran�a no Controle:** Somente Admin, SRVM e Ajd podem eleger substitutos. Um publicador que clica em 'N�o poderei' encerra seu fluxo ali, sem op��es de sugerir substituto.
- **Exclusividade Web do Curador IA:** O sistema de Intelig�ncia Artificial Curador atua �nica e exclusivamente sob acionamento manual na aba Apostila da aplica��o Web. Nunca ser� executado assincronamente pelo webhook do WhatsApp.

### ?? 4. Evolu��o do Fluxo de Recusa (N�o Poderei)
- Foi validado que o sistema j� possui a funcionalidade estrita de realocar o irm�o menos sobrecarregado atrav�s da fun��o `reassignParts` na aba Admin.
- **A Dire��o Escolhida (Em Standby para Refinamento):** Automatizar o clique do 'N�o poderei' do WhatsApp conectando-o a essa mesma l�gica do Frontend. O sistema (seja via Headless Bot ou via Painel) ir� rodar a reatribui��o anti-fome, eleger o novo candidato e, **imediatamente**, engatilhar o fluxo completo da Troca Manual (gera��o do S-89 em PNG via html2canvas no browser e notifica��o de todos os envolvidos), reiniciando o ciclo organicamente.

---

## 12. Auditoria e Blindagem dos Fluxos P1 a P8 (2026-09-17)

### 📌 1. Escopo da Auditoria
Foi executada uma varredura exaustiva nos 8 fluxos críticos de automação e mensageria:
- **P1 (Disparo D-21 S-89 via GitHub Actions)**: Validação do pipeline headless, integridade da geração do cartão S-89 via Chromium/Canvas e registro em `zapi_dispatch_log`.
- **P2 (Lembretes Contínuos de 72h para `PROPOSTA`)**: Verificação da cobrança respeitosa a cada 72 horas para irmãos que ainda não clicaram no botão interativo.
- **P3 (Lembretes de Proximidade D-7 e D-2 para `DESIGNADA`)**: Disparo condicionado exclusivamente a partes já confirmadas ou resgatadas.
- **P4 (Processamento de Botão 'Confirmar')**: Transição imediata de `PROPOSTA` para `CONFIRMADA`/`DESIGNADA`, log em `zapi_smart_interactions` e feedback visual.
- **P5 (Processamento de Botão 'Não Poderei')**: Notificação imediata e exclusiva ao SRVM, Ajudantes e Admin, impedindo que o publicador escolha substitutos e marcando a parte para intervenção.
- **P6 (Botão de Disponibilidade)**: Encaminhamento via Link Action nativo do WhatsApp para o portal de disponibilidade seguro com token individual.
- **P7 (Fallback para WhatsApp Web Clássico)**: Preservação de links web explícitos quando a Z-API estiver desligada ou no envio manual via modal.
- **P8 (Kill-Switch e Configurações)**: Isolamento estrito entre a chave mestre de desligamento dos crons e os workflows do GitHub Actions.

---

## 13. Automação Operacional do S-140 e Gestão de Funções Congregacionais (2026-09-18)

### 📌 1. Visão Geral da Entrega
Implementação completa da automação de envio do **S-140 (Programa da Reunião Nossa Vida e Ministério Cristão)** via WhatsApp (Z-API), do **CRUD dinâmico de Funções Congregacionais** no cadastro de publicadores, e da integração com a matriz de **Permissões** da aba Admin.

### 📌 2. Regras Operacionais e Invariantes dos Modos de Envio
- **Automações Existentes 100% Intactas**: Notificações individuais de substituições (antigo, novo com S-89, parceiro e equipe RVM) continuam ocorrendo imediatamente no ato da troca. O módulo S-140 é puramente aditivo e desacoplado.
- **Regra de Ouro do Presidente**: Cada Presidente de semana com ajuste recebe **sempre** sua mensagem dedicada de condução de reunião com a folha única S-140 da sua respectiva semana, mesmo se fizer parte da Equipe RVM ou do Grupo oficial.
- **Modo 1 (Regular Semanal — Segunda-feira 08:00 BRT)**:
  - Disparado se houver novidades: nova semana publicada recentemente (D-21) OU trocas acumuladas de partes.
  - *Grupo de WhatsApp oficial (`120363425170091102-group`)*, *Equipe RVM (SRVM, Ajudantes, Admins)* e o *Responsável pelo Quadro de Anúncios* recebem o **Pacote Completo** (todas as semanas publicadas a partir da atual) com texto explicativo contextual.
  - Cada Presidente de semana que teve ajuste recebe exclusivamente a folha única S-140 da sua semana.
  - Sem alterações: **Silêncio total**.
- **Modo 2 (Emergência na Semana em Curso — Pós-Segunda-feira)**:
  - Se ocorrer qualquer substituição na semana ativa da reunião (`weekId === currentWeekId`):
    - Grupo + Equipe RVM + Quadro recebem imediatamente o **Pacote Completo atualizado** com aviso de urgência.
    - O Presidente da semana atual recebe imediatamente o **S-140 ÚNICO** da sua semana com a nova escala.
- **Modo 3 (Incidental Manual)**:
  - Botão *'📤 Despachar Pacote'* integrado à barra de ferramentas `WorkbookToolbar` para envio imediato sob demanda com confirmação do operador.

### 📌 3. CRUD de Funções Congregacionais e Permissões
- **Serviço Centralizado (`congregationRoleService.ts`)**: Gerencia funções customizadas em `app_settings.congregation_roles`.
- **Modal de Gerenciamento (`RoleManagerModal.tsx`)**: Interface para adicionar, editar e excluir funções congregacionais com sincronização dual-table do `zapi_group_id`.
- **Cadastro de Publicadores (`PublisherForm.tsx`)**: Campo 'Função' habilitado para todos os irmãos batizados (Ancião, Servo Ministerial e Publicador).
- **Matriz de Permissões (`PermissionManager.tsx`)**: Permissões granulares configuráveis para qualquer função cadastrada (ex: Responsável pelo Quadro de Anúncios).

---

## 14. Saneamento de `needs_reassignment`, Falsos Alarmes e Refinamento do Cron Matinal (2026-09-19)

### 📌 1. Diagnóstico do Falso Alarme das 09:00 BRT
- **Sintoma**: No relatório diário das 09:00 BRT enviado ao SRVM e Admins, a rotina `checkRefusalsLapsing` apontava 2 'Substituições Pendentes' sem identificar quem ou quais partes eram.
- **Identificação**: As partes eram da semana de 21/09/2026 (Presidente) e 28/09/2026 (Parte Vida Cristã). Ambas já haviam sido resolvidas manualmente com novos irmãos designados (Edmilson Monteiro e Renato Oliveira).
- **Causa Raiz**: O campo `needs_reassignment` permanecia com valor `true` no banco de dados porque as funções de atribuição (`proposePublisher`, `approveProposal`, `directExecutePublisherUpdate` e `executeManualReplacement`) não realizavam o reset da flag para `false`.

### 📌 2. Saneamento e Blindagem Definitiva
1. **Saneamento do Banco de Dados**:
   - Executado comando SQL saneador no Supabase para resetar `needs_reassignment = false` em todas as partes que já possuíam status ativo (`DESIGNADA`, `PRONTO`, `CONCLUIDA`) e publicador preenchido.
2. **Correção nos Serviços (`replacementOrchestratorService.ts` e `workbookService.ts`)**:
   - Inclusão explícita de `needs_reassignment: false` em todas as operações de atualização, substituição direta e aprovação de propostas.
3. **Filtro Defensivo na Edge Function (`cron-whatsapp-reminders/index.ts`)**:
   - A rotina `checkRefusalsLapsing` agora valida se a parte já possui publicador escalado e status ativo antes de contabilizá-la, blindando o sistema contra qualquer inconsistência residual.
4. **Refinamento Informativo do Alerta**:
   - O alerta matinal agora lista com precisão cirúrgica cada pendência real:
     - **Semana e Data da Reunião**: ex: `Semana 21/09 (Quinta-feira, 24 de Setembro)`
     - **A Parte / Tema**: ex: `*Presidente*`
     - **O Publicador que Recusou**: lido com prioridade de `refusal_logs` e `rejected_reason`.
   - Título da seção diária dinâmico: `🔍 *Acompanhamento Operacional:*` em dias normais, reservando `📋 *Ações mensais executadas:*` para o dia 1º do mês.

---

## 15. Triagem da Mensageria, Ponto Cego e Monitor Canônico 2.0 (2026-09-19)

### 📌 1. Diagnóstico de Triagem: Logs Escapados e Redundâncias
Foi realizada uma triagem completa no banco de dados e nos serviços de mensageria, revelando dois apontamentos arquiteturais cruciais:
1. **Ponto Cego de Canais no Monitor Atual**:
   - A view atual `vw_canonical_communication_log` monitora apenas `zapi_dispatch_log`, `zapi_smart_interactions` e `push_dispatch_log`.
   - **291 confirmações e recusas** realizadas pelo Portal Web clássico (`confirmation_portal_responses`) e **19 alterações de disponibilidade** (`availability_history`) ocorrem em canais válidos, mas não apareciam no Monitor da aba Comunicações.
2. **Duplicidade Sistemática de Webhooks Z-API**:
   - A Z-API reenvia eventos em frações de segundo caso a resposta HTTP 200 demore microssegundos a mais.
   - Como a tabela `zapi_smart_interactions` não possuía constraint de unicidade em `inbound_message_id`, mensagens idênticas foram inseridas em duplicidade (exemplo: as 16 mensagens registradas para Gerusa Souza correspondiam, na realidade, a 8 eventos reais duplicados).

### 📌 2. Especificação Arquitetural: Monitor Canônico 2.0
Para elevar o monitoramento ao mais alto padrão de usabilidade e governança teocrática, foi desenhada a nova arquitetura do **Monitor Canônico 2.0**:
- **Hub Canônico de Eventos (`system_canonical_events`)**: Tabela unificada no Supabase capturando eventos de todos os canais:
  - WhatsApp (Z-API) Outbound e Inbound
  - Portal Web de Confirmação (`confirmation_portal_responses`)
  - Portal Web de Disponibilidade (`availability_history`)
  - Web Push PWA
  - Ações Manuais de Operador / Modal
- **Deduplicação Nativa por `inbound_message_id`**: Índice único e mecanismo de `UPSERT` / ignore no webhook, eliminando redundâncias na raiz.
- **Síntese e KPIs no Topo do Monitor**:
  - Cards de Taxa de Confirmação Global, Tempo Médio de Resposta, Falhas de Entrega Ativas e Substituições sem Desfecho.
- **Filtros por 4 Perspectivas Chave**:
  1. *Por Publicador*: Linha do tempo 360º de todas as interações de um irmão.
  2. *Por Semana / Reunião*: Diagnóstico completo da escala de uma semana específica.
  3. *Por Canal / Via*: WhatsApp Z-API vs Portal Web vs Web Push vs Manual.
  4. *Auditoria de Operações Críticas*: Trocas manuais, recusas de partes e falhas de envio.

### 📌 3. Solução Híbrida de Mercado & Análise de Custos
- **Arquitetura Recomendada**:
  - **Camada de Negócio e Governança**: Supabase Nativo (`system_canonical_events`) integrado com RLS e consumido diretamente no painel React da RVM.
  - **Camada de Telemetria Técnica e Erros**: Sentry (Application Performance Monitoring) para rastrear erros de código em tempo real, stacktraces do frontend e falhas não capturadas de Edge Functions.
- **Análise de Custos**:
  - **Sentry Developer Tier (Free)**: R$ 0,00 (Cota de 10.000 erros/mês e 50.000 transações/mês, cobrindo com folga de 100x a demanda de uma congregação).
  - **Supabase**: R$ 0,00 (Dentro do plano atual do projeto).
  - **Custo Total**: **R$ 0,00 / mês**.

---

## 16. Engenharia de Auto-Cura, Blindagem de Idempotência e Auditoria de Disparos Manuais (2026-09-22)

### 📌 1. Sweeper de 2h (Engenharia de Auto-Cura)
- **O Desafio**: Perda de mensagens, webhooks com timeout ou instabilidades temporárias da Z-API poderiam deixar publicadores em um limbo sem o S-89 ou lembretes, forçando o operador a atuar manualmente.
- **A Solução**: O Cron Principal (`cron-whatsapp-reminders`) foi evoluído de uma execução estática (1x ao dia) para um **Sweeper Contínuo** (`0 8-20/2 * * *`). Ele "varre" a base a cada 2 horas (das 08:00 às 20:00).
- **Controle Antispam / Idempotência de Concreto**: 
  - A varredura contínua foi implementada com **Strict Equality Idempotency** usando a tabela `zapi_dispatch_log` como Fonte Única de Verdade. Ele só envia o lembrete (D-9, D-7, etc.) ou auto-cura um S-89 se *não existir nenhum registro de sucesso* prévio.
  - **Relatórios Gerenciais Silenciados**: Relatórios pesados de pendências ou estatísticas para a Comissão de Serviço e SRVM foram condicionados estruturalmente para dispararem *apenas no ciclo das 08:00h*, eliminando qualquer risco de "spam a cada 2 horas". (Deploy realizado).

### 📌 2. Auditoria e Fix de Rotas Manuais (Log Canônico)
- **Problema Encontrado**: O envio de cartões S-89 via WhatsApp Manual (usando o próprio celular com `wa.me`, no `S89SelectionModal.tsx`) estava passando argumentos com a tipagem e ordem equivocadas para a função `zapiOrchestrator.logDispatch`. Isso fazia com que o envio manual não gravasse o tipo `PUBLICACAO_S89` corretamente, cegando o Sweeper para os envios manuais.
- **A Correção**: Fix aplicado no Frontend (`S89SelectionModal.tsx`), assegurando que envios via "Botão Zap Manual" insiram o registro perfeitamente no log canônico (`status = SUCCESS_MANUAL`). Agora, rotas automáticas (Z-API) e Manuais convergem para a mesma blindagem.

### 📌 3. Identificação de Funcionalidade Legada
- **Central de Comunicações (`CommunicationTab.tsx`)**: O fluxo onde o Agente IA (Chat) prepara rascunhos de S-89 e joga na "Caixa de Saída" para o usuário apertar "Enviar" foi identificado como Legado.
- **A Brecha**: O botão `Enviar` dessa aba não implementa a chamada para o `logDispatch`.
- **Decisão**: Foi documentado como legado. Recomenda-se inserir o Log Canônico nessa tela ou descontinuá-la, visto que a Fábrica (D-21) e o novo S89 Modal tornaram o fluxo de rascunhos via chat amplamente obsoleto para S-89.

---

## 🛑 PENDÊNCIAS ATIVAS NO PROJETO

1. **Alerta de Desconexão Z-API (P10)**: Implementar monitoramento ativo de webhooks (`on-disconnected`) para alertar o SRVM caso o celular da congregação fique offline ou despareado.
2. **Monitor Canônico 2.0 (P2)**: Criar a tabela `system_canonical_events` e consolidar todo o fluxo 360º de comunicação visual.
3. **Integração Sentry (P5)**: Instalar a telemetria técnica de Application Performance Monitoring.
4. **Evolução Cognitiva (A1-A6)**: Habilitar o `pgvector` no Supabase e avançar para o motor hiper-dimensional de perfis.
5. **Vedação de Tela Legada (`CommunicationTab.tsx`)**: Decidir entre injetar a tranca do `logDispatch` na Central de Comunicações ou aposentar a rota do Chatbot para S-89 em favor da interface visual.
