# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-09-04 08:30 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção (Fase 7 Concluída)

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app`
- **Frontend GitHub Pages**: Ativo e sincronizado (`npm run deploy`).
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).
- **Último Commit Estável**: `925b81b` — *feat(curator): agente especialista de lote, base de conhecimento permanente e multi-select no cadastro de publicadores*.

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
