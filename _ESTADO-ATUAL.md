# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-09-06 12:35 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção (Fase 9 Concluída — Blindagem Total de Tokens com Google Auth Restrito e First-Access Binding; Auditoria Canônica de Crons e Invariantes S-89)

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app` (Deploy `dpl_6hXPt84GbSaT9oTh4N7gcz88JbZR` ativo em cima de `16024a4`).
- **Frontend GitHub Pages**: Ativo (`https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/`), sincronizado via `npm run deploy`.
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).
- **Último Commit Estável**: `16024a4` — *feat: notificacoes de status para CS, SRVM e Admin de Sistema com funcao cadastrada*.

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
