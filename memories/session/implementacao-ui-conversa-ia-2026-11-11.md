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
- `conversa.css`: Estilização isolada com tokens CSS independentes, tipografia 18px, modo claro/escuro, `.cv-carousel-fullscreen`, `.cv-badge-danger`, estilos de recusa inline e layout do Auth Gate (sem carregar `src/index.css`).
- `ConversaAuthGate.tsx`: Guarda de autenticação próprio em `/conversa.html` (Google OAuth mantendo `redirectTo` para `/conversa.html`, Biometria/PIN, 2FA WhatsApp, `AppLockScreen` e tela de vínculo pendente).
- `ConversaApp.tsx`: Aplicação top-level com carregamento escopado pelo `PermissionGate`, briefing proativo, contexto do usuário conectado (`selfPublisherId`), envio de mensagens e ações diretas de confirmação/recusa no briefing.
- `ConversaShell.tsx`: Cabeçalho com chip do usuário, sino de pendências, lixeira, botão `Sair`, timeline vertical, cards derivados e composer fixo.
- `Composer.tsx`, `VoiceToggle.tsx`, `ClarifyCard.tsx`, `ExplainAnswer.tsx`: Entrada multimodal voz/texto, escolhas de desambiguação e respostas explicativas com fonte oficial (`findKnowledge` normalizando acentos pt-BR).
- `BriefingModal.tsx`: Micro-modal proativo com confirmação direta e campo inline de motivo de recusa.
- `DocumentCarousel.tsx`: Carrossel cronológico com navegação prev/next, foco inicial, proteção de índice e tela cheia.
- `MicroPanel.tsx`: Micro-painéis de partes, semanas pendentes (`pending-weeks-list`), vagas, prévia de ações e feedback `success`/`error`.

### E. Entrypoint Multi-página e Serverless Edge
- `conversa.html`: Entrypoint HTML dedicado e isolado.
- `src/features/conversa/main.tsx`: Montagem React independente sob `StrictMode`, `ErrorBoundary`, `AuthProvider` e `ConversaAuthGate`, configurando `./ui/conversa.css` e `pdf.worker.min.mjs`.
- `api/conversa-nlu.ts` + `l2Classifier.ts`: Contrato `{ utterance, text }` compatível dos dois lados e sanitização de slots.

### F. Qualidade, Verificação e Execução
- **Novos testes adicionados**:
  - `src/features/conversa/__tests__/conversaFlow.test.ts` (fluxos de `cardPlanner`, `choiceIndex` 0-based, execução real de `registerAbsence`/`approveWeekProposal`, acentuação em `knowledgePort`, `expandAbsenceDateRange` e contrato L2).
  - `src/features/conversa/__tests__/conversaUi.test.tsx` (testes React+JSDOM para `BriefingModal`, `MicroPanel`, `DocumentCarousel` e `ConversaShell`).
- **Suíte completa**: `132/132` testes passando (`npm test`, sendo 21 subtestes em `src/features/conversa/__tests__`).
- **Build de produção**: `npm run build` (`vite build`) compilado com sucesso gerando `dist/conversa.html` e `dist/index.html`.
- **Playwright headless Chromium (`vite preview` + dev server live em `http://127.0.0.1:5173/conversa.html`)**: verificado estado não autenticado com `ConversaAuthGate` e fluxo autenticado simulado com `BriefingModal`, explicação `"como funciona o rodízio"`, `"minhas designações"`, prévia `"vou viajar de 10/12 a 12/12"` e `DocumentCarousel` S-140, sem erros de página; 4 capturas PNG inspecionadas e registradas no artefato `execucao_browser_conversa.md` (conversa `1adbcb0f-f57c-441c-9b0c-b194af095093`).
- **Como executar localmente**:
  - Desenvolvimento: `npm run dev` -> `http://localhost:5173/conversa.html`
  - Preview de produção local: `npm run build` e `npm run preview` -> `http://localhost:4173/conversa.html`
  - Observação de deploy Vercel: `vercel.json` do RVM não foi alterado (possui rewrite `/(.*) -> /index.html`).

## 3. Estado Git & Prontidão
- Alterações de código restritas exclusivamente a `src/features/conversa/**`, `api/conversa-nlu.ts` e documentos de memória/estado; RVM legado intacto.
## 4. Refinamento Noturno (2026-11-11 20:30 BRT) — Carrossel Sem Barras de Rolagem & Auto-Ajuste por Dispositivo
- **Carrossel Documental (`DocumentCarousel.tsx` + `conversa.css`)**:
  - Removido completamente `overflow: auto` / `maxHeight: 450px` e `min-height: 380px` fixo; zero barras de rolagem horizontais ou verticais em qualquer resolução.
  - Implementado cálculo dinâmico de escala (`ResizeObserver` + `window.visualViewport` + `orientationchange`) que mede `naturalWidth` × `naturalHeight` reais de cada folha e aplica `transform: scale(s)` dentro de um `.cv-form-frame` com dimensões exatas `scaledW` × `scaledH` para celular retrato (`375×667`), celular paisagem (`844×390`), laptop (`1366×768`) e tela cheia (`100dvh`).
  - Liberada 100% da largura da coluna para cards/carrossel do assistente e removidas as margens laterais ociosas do S-140 via escopo CSS `.cv-form-canvas .s140-wrapper .container`.
  - Adicionados navegação por gesto *swipe* horizontal no toque, atalhos de teclado (`ArrowLeft`, `ArrowRight`, `Escape` em tela cheia) e desativação limpa das setas quando há item único.
- **Formulários Completos no Carrossel (`documentPort.ts` + `cardPlanner.ts` + `policyGuard.ts`)**:
  - Adicionada renderização cronológica oficial para **S-4** (`S-4-T 11/23`, `480px`) e **S-1** (`S-1-T 11/23`, `800px`, restrito por `policyGuard` a perfis com acesso a Relatórios Mensais), além de fallback HTML fiel para **S-89** (`460px`).
- **Padronização & Qualidade**:
  - Datas padronizadas em `DD/MM/AAAA` via módulo puro `core/dateFormat.ts` (evitando side-effect de `autoRefreshToken` do cliente Supabase em testes JSDOM).
  - Eliminados todos os 32 apontamentos de ESLint em `src/features/conversa/` (`0` erros, `0` `any`), neutralizadas menções a sincronização externa e suíte ampliada para **`134/134` testes passando** (`npm test`) + validação real em Microsoft Edge Headless (Playwright).


