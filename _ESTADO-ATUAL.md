# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-09-05 09:10 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção (Fase 9 Concluída — Blindagem Total de Tokens com Google Auth Restrito e First-Access Binding)

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app`
- **Frontend GitHub Pages**: Ativo e sincronizado (`npm run deploy`).
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).
- **Último Commit Estável**: `7761623` — *feat(security): checkpoint e plano de blindagem de tokens com publisher_id e email restrito*.

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

## 3. Entregas Anteriores: Fase 8 — Auditoria Real, Invariante "Legado" e Blindagem de Autor (2026-09-04 / 2026-09-05)

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

## 4. Próximos Passos Imediatos

1. Monitorar o uso do botão de "Especializar Lote" conforme novas apostilas de 2026/2027 forem importadas.
2. Acompanhar a adoção dos perfis sintéticos no cadastro de publicadores pelos anciãos e servos designadores.
3. Concluir a flag de "Pausa por Tempo Indeterminado" com lembrete semanal via Cron no WhatsApp.
