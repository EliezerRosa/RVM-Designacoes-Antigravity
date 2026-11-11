# Sessão 2026-11-11 — Implementação da Nova UI-Chat-IA Desacoplada ("Conversa RVM")

## 1. Contexto e Objetivos
- **Demanda do Usuário**:
  1. Criação prévia do checkpoint Git antes de qualquer alteração (`checkpoint-pre-conversa-ui-66f083d`).
  2. Implementação integral do Plano "UI Conversa IA" com arquitetura modular desacoplada.
  3. Requisito de entrada/login/retorno de foco com briefing proativo (fala, escrita e micro-modal com pendências a confirmar/cumprir e eventos futuros).
  4. Isolamento estrito: zero imports do legado no novo módulo e zero dependências do novo módulo na aplicação principal do RVM.
  5. Interação natural sem botões intrusivos (micro-ações e opções surgem estritamente por intenção ou desambiguação).
  6. Carrossel cronológico para documentos (S-140, S-89) e modo multimodal com alternância voz/texto.

## 2. Entregas Realizadas

### A. Checkpoint de Segurança
- Tag Git criada e enviada: `checkpoint-pre-conversa-ui-66f083d`.

### B. Core do Módulo (`src/features/conversa/core/`)
- `intentCatalog.ts`: Catálogo fechado com 19 intenções tipadas, categorias, permissões herdadas do `AgentActionType` e níveis de risco.
- `nlu/l0Grammar.ts`: Parser determinístico de linguagem natural em pt-BR (custo 0, determinismo total) para formulários (S-140, S-89/folhinha, S-4, S-1), partes vagas, regras teocráticas, datas (DD/MM/AAAA, DD/MM, relativas), desambiguações e briefing.
- `nlu/l1Cache.ts`: Cache de sessão em memória para histórico recente e contexto imediato.
- `nlu/l2Classifier.ts`: Pipeline em camadas (L1 Cache -> L0 Grammar -> L2 Serverless Classifier com fallback gracioso).
- `entityResolver.ts`: Resolução de publicadores e semanas contra dados reais cadastrados, com desambiguação controlada.
- `policyGuard.ts`: Adaptador de permissões estrito consumindo `PermissionGate`.
- `conversationState.ts`: Tipos e gerenciamento de estado da conversação.
- `cardPlanner.ts`: Orquestrador de turnos que deriva micro-painéis, carrossel e explicações a partir da intenção e do contexto.

### C. Conhecimento e Portas de Integração (`src/features/conversa/`)
- `knowledge/rvmRulesKnowledge.ts`: Base de diretrizes teocráticas e regras canônicas do motor (S-38-T, rodízio, intervalo, gênero).
- `ports/knowledgePort.ts`: Formatação de respostas explicativas com citação formal de fontes.
- `ports/queryPort.ts`: Consultas reais a publicadores, partes da semana, vagas e pendências via Supabase e APIs existentes.
- `ports/briefingPort.ts`: Acolhimento proativo com cálculo de designações a confirmar, designações a cumprir e eventos especiais futuros.
- `ports/documentPort.ts`: Montagem de itens cronológicos com foco inicial para S-140 e S-89.
- `ports/voicePort.ts`: Integração com Web Speech API (STT via SpeechRecognition e TTS via SpeechSynthesis com voz em pt-BR e fallback suave).
- `ports/actionPort.ts`: Execução de micro-ações seguras com prévia e confirmação.

### D. Interface do Usuário (`src/features/conversa/ui/`)
- `conversa.css`: Estilização isolada com tokens CSS independentes, tipografia 18px, design system leve, responsivo e dark mode elegante.
- `ConversaApp.tsx`: Aplicação top-level com suporte a autenticação, permissões, acolhimento de login/retorno de foco e briefing.
- `ConversaShell.tsx`: Container limpo com timeline vertical, cards derivados e composer fixo.
- `Composer.tsx`: Campo de entrada de texto com alternador instantâneo teclado/microfone e feedback de transcrição.
- `VoiceToggle.tsx`: Botão de alternância e estado de escuta por voz.
- `BriefingModal.tsx`: Micro-modal proativo de pendências e eventos especiais.
- `DocumentCarousel.tsx`: Carrossel cronológico com navegação prev/next, foco inicial e visualização em tela cheia.
- `ClarifyCard.tsx`: Grid de opções numeradas para desambiguação de entidades ambíguas.
- `ExplainAnswer.tsx`: Card de resposta explicativa com badge de fonte e citação de documento oficial.
- `MicroPanel.tsx`: Micro-painéis de listagem de partes, vagas e prévia de ações.

### E. Entrypoint Multi-página e Serverless Edge
- `conversa.html`: Entrypoint HTML dedicado e isolado.
- `src/features/conversa/main.tsx`: Montagem React independente sob `StrictMode`, `ErrorBoundary` e `AuthProvider`.
- `vite.config.ts`: Configurado `rollupOptions.input` com `{ main, conversa }`, compilando bundles separados sem inchaço.
- `api/conversa-nlu.ts`: Endpoint Edge serverless para classificação L2 via LLM estruturada com fallback sem falha se offline.

### F. Qualidade e Testes Automatizados
- `src/features/conversa/__tests__/boundary.test.ts`:
  - Garante que nenhum arquivo externo importe nada de `features/conversa`.
  - Garante que `features/conversa` não importe o agente legado nem o chat temporal.
- `src/features/conversa/__tests__/l0Grammar.test.ts`:
  - 100% de cobertura dos casos determinísticos de gramática pt-BR.
- `src/features/conversa/__tests__/briefing.test.ts`:
  - Validação do cálculo de pendências e eventos com síntese falada e escrita.
- **Suite completa**: 120/120 testes passando (`npm test`).
- **Build de produção**: `vite build` executado com sucesso em 26s gerando `dist/conversa.html`.

## 3. Estado Git & Prontidão
- Todas as alterações commitadas e sincronizadas com `origin/main`.
- Axioma Absoluto cumprido: ambiente 100% documentado, limpo e pronto para qualquer IDE ou agente.
