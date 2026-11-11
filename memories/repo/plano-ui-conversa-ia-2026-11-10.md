# Plano — Nova UI-Chat-IA "Conversa RVM" (2026-11-10)

> **Status**: 🟢 **Aprovado e implementado end-to-end** (checkpoint `checkpoint-pre-conversa-ui-66f083d`; commits `a95f67d` e `62ca187`). Ver registro completo em [implementacao-ui-conversa-ia-2026-11-11.md](../session/implementacao-ui-conversa-ia-2026-11-11.md).
> **RVM legado intocado**: implementado exclusivamente em `src/features/conversa/**` e `api/conversa-nlu.ts`, sem alterações em `src/App.tsx`, `AuthContext`, `vite.config.ts`, `vercel.json` ou `index.html`.
> **Plano completo** (artefato da conversa Antigravity `1adbcb0f-f57c-441c-9b0c-b194af095093`): `C:\Users\Eliez\.gemini\antigravity\brain\1adbcb0f-f57c-441c-9b0c-b194af095093\plano_ui_conversa_ia.md`
> Qualquer agente/IDE que retomar este tema DEVE ler esta memória antes de agir.

## 1. Pedido original de Eliezer (9 requisitos, literais em essência)

1. **Totalmente desacoplada** do Agente atual e das demais funcionalidades do RVM.
2. Focada em **linguagem natural**, para entender **intenções** e oferecer **micro-ações e/ou micro-painéis** derivados da conversa.
3. **Nenhum botão visível** por padrão; botões só aparecem por entendimento de intenção; interações de **resolução de ambiguidade sem alucinar** nem derivar espontaneamente.
4. **Especialista em RVM Designações**, dando explicações quando solicitadas.
5. **Modo voz** como opção.
6. Respeitar as **restrições e permissões** de funcionalidades já existentes.
7. Todo output (S-n, PDFs, relatórios) em **carrossel**, focando a página inicial ou o formulário em foco na demanda, listando os **pares em ordem de tempo**.
8. **Visual simples, agradável, não poluído, leve.**
9. Mesmo em texto, **alternar voz/texto facilmente**.
10. **Briefing proativo na entrada inicial / login / retorno de foco**: Chat-IA fala, escreve e exibe **micro-modal** com pendências do usuário (designações de qualquer natureza a cumprir/confirmar) e eventos futuros (assembleias, etc.).

## 2. Decisões de projeto propostas

- **Módulo novo** `src/features/conversa/` (camadas `ui → core → ports → serviços existentes`). Nada existente importa a Conversa; a Conversa **não importa** `ChatAgent`, `TemporalChat`, `PowerfulAgentTab`, `AgentModalHost`, `agentService`, `agentActionService`, `semanticAgentService`, `contextBuilder`, `api/chat.ts`. Garantido por **lint + teste de fronteira** automatizado.
- **Entrada separada** no Vite (`conversa.html` → `src/features/conversa/main.tsx`); único arquivo existente tocado: `vite.config.ts`. Feature flag `app_settings.conversa_enabled`.
- **Briefing Proativo Multimodal (`BriefingModal.tsx` + `briefingPort.ts`)**: acionado no boot, login ou retorno de foco da janela (`visibilitychange`/`focus` com debounce de 15 min). Escreve cordialidade na conversa, fala resumo conciso em áudio (se habilitado) e exibe micro-modal listando designações de qualquer natureza (a cumprir/confirmar com botões rápidos `[Confirmar]` / `[Não poderei]`) e eventos futuros (visita SC, assembleias, etc.).
- **NLU em camadas**: L0 gramática determinística pt-BR → L1 cache de intenção → L2 classificador restrito (endpoint novo `api/conversa-nlu.ts`, saída JSON validada por schema, enum de intenções, temperature 0, prompt **sem dados pessoais**). Limiares: escrita ≥ 0,90; leitura ≥ 0,75. Meta: ≥ 70 % das falas em L0/L1.
- **Catálogo fechado de intenções**; cada intenção declara o **`AgentActionType` governante** → herda a mesma matriz de permissões (`PermissionGate.canAgentAction`, `dataAccessLevel`, `canSeeSensitiveData`, `ADMIN_ONLY_ACTIONS`) e a RPC servidor `assert_agent_action` (fail-closed) em toda escrita. **Zero política nova.**
- **Anti-alucinação**: toda opção exibida (nomes, semanas, partes) vem de consulta ao banco; ambiguidade → `ClarifyCard` com ≤ 4 candidatos reais + "nenhum destes"; fora do catálogo → "não entendi" + reformulações do catálogo; explicação sem fonte → "não sei" + humano. No máximo 1 "próximo passo" ligado à intenção atual.
- **Especialista**: base de conhecimento curada/versionada (regras do motor M-0…M-12, S-38 §→N-xx, filosofia de mensagens, ciclo da semana, RM) + `EXPLAIN_SCORE`/`EXPLAIN_RANKING` com dados reais; resposta sempre com fonte citada.
- **Carrossel documental único** (`DocumentCarousel`): foco no documento pedido (ou 1ª página / semana atual); pares do mesmo tipo/recorte em ordem cronológica; janela ±6 sob demanda. Reusa sem alterar `generateS89PngBase64`, `generateS140ImageBase64`/`renderS140ToElement`, renderização equivalente a `RmS4Modal`/`RmS1PrintTemplate`, `pdfjs-dist`.
- **Voz**: Web Speech API pt-BR (grátis), modos *ditado* e *conversa por voz*; único botão ⌨︎/🎙 no compositor com preferência salva; confirmação de escrita por voz exige "confirmar" falado **e** card de prévia; sem suporte → microfone some, texto segue.
- **Visual**: uma coluna (máx. 720 px), estado vazio só com saudação + compositor, fonte base 18 px, 1 cor de destaque, ícone + texto, contraste AA, modo escuro automático, CSS próprio (não herda o do app).

## 3. Catálogo v1 (resumo)

| Grupo | Permissões herdadas | Saída |
|---|---|---|
| Consultas | `QUERY_PUBLISHER_ASSIGNMENTS`, `QUERY_WEEK_ASSIGNMENTS`, `QUERY_VACANT_PARTS`, `QUERY_LAST_PARTICIPATION`, `QUERY_ELIGIBILITY`, `QUERY_PENDING_WEEKS` | MicroPanel |
| Documentos | `VIEW_S140`, `SHOW_MODAL`, leitura RM (aba `monthly-reports`) | DocumentCarousel |
| Explicações | `EXPLAIN_RANKING`, `EXPLAIN_SCORE`, `EXPLAIN_PART`, `GET_ENGINE_RULES` | ExplainAnswer com fonte |
| Escritas (F5) | `UPDATE_AVAILABILITY`, `APPROVE_PROPOSAL`, `ASSIGN_PART`, `SEND_S89`, `UNDO_LAST` | prévia + confirmar + auditoria + desfazer |

## 4. Fases

F0 fundação (pasta, entrada, flag, policyGuard, fronteira) → F1 conversa texto/leitura & briefing proativo (golden set ≥ 150 frases, ≥ 95 %; `BriefingModal` login/foco com fala + escrita + modal de pendências/eventos) → F2 carrossel → F3 voz → F4 especialista → F5 micro-ações de escrita (começando por ausência por intervalo) → F6 refino (promoção cache→L0, custo, acessibilidade). **Tag git de checkpoint antes de F0 e a cada fase.** Suíte existente (`npm test`, `type-check`) verde em toda fase.

## 5. Decisões pendentes (com recomendação)

| ID | Pergunta | Recomendação |
|---|---|---|
| D1 | Página separada (`conversa.html`) ou nova aba? | Página separada |
| D2 | Público v1: admin/SRVM ou todos (publicador em escopo `self`)? | Admin/SRVM na v1; demais na F6 |
| D3 | L2: endpoint novo com Gemini (chave existente) ou Jev/OpenRouter? | Gemini Flash com saída JSON; Jev depois em modo sombra |
| D4 | Escritas na v1? | Só leitura até F4; escritas na F5 |
| D5 | Voz: Web Speech ou STT de servidor desde já? | Web Speech com adaptador trocável |

