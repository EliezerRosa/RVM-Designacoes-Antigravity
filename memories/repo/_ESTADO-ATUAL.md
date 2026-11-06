# Estado Atual do Workspace — Antigravity / RVM Designações

> **Fonte Canônica Principal de RVM**: `_ESTADO-ATUAL.md` (na raiz do repositório `rvm-designacoes-unified/`, prevalece para regras, motor, histórico e pendências de RVM)  
> **Última Atualização**: 2026-11-06 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável em Produção. Motor de Designações `2026-10-15.01` com **Blindagem Bidirecional de Gênero e Parentesco** (Titular ↔ Ajudante) ativa. Automação Hourglass ativa. Resumo Desacoplado de Próximas Designações Z-API ativo nos envios de S-89 e em Lembretes de Falta de Confirmação (72h / D-9). Planejamento das 6 Invariantes de Botões Z-API de Lembretes (Manual/Robô) concluído. Textos e formatação de datas (DD/MM/AAAA) teocráticos e cordiais padronizados. Axioma Irrevogável de Memória Multi-IDE ativo e sincronizado. **Pacote de reengenharia HG → RVM (documentação, 2026-11-06) concluído e aguardando decisões R1–R12** (ver §4 e `_ESTADO-ATUAL.md` raiz §36).

---

## 1. Visão Geral do Workspace

O repositório unificado reside em `rvm-designacoes-unified/`:
- **Produção**: `https://rvm-designacoes-antigravity.vercel.app` (Vercel CLI autenticado com `VERCEL_TOKEN`).
- **GitHub Pages**: `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/` (`npm run deploy`).
- **Supabase**: Projeto `pevstuyzlewvjidjkmea`.
- **Último Checkpoint Git RVM**: `cb2b3aa` (docs: sincronizar memórias persistentes e plano de botões de lembretes Z-API).

---

## 2. Invariantes Canônicos

1. **Estado Vivo**: Sempre consultar `_ESTADO-ATUAL.md` e manter este `/memories/repo/_ESTADO-ATUAL.md` atualizado in-place.
2. **Resumo Desacoplado de Próximas Designações Z-API**: Se um publicador receber S-89 (manual/lote) OU lembrete de falta de confirmação (`COBRANCA_72H` ou `LEMBRETE_D9` para partes `PROPOSTA`), e possuir $\ge 2$ designações futuras já publicadas, recebe uma mensagem extra desacoplada com o resumo de todas as suas próximas partes reais (descartando partes secundárias/implícitas de presidente como Oração Inicial, Comentários e Conselhos, e cânticos), com status e botões de ação rápida nativos do WhatsApp (`send-button-actions` prioritários, limitados a 3 botões rápidos: confirmação/recusa para pendentes e recusa das datas mais próximas para confirmadas), link de portal permanente para contingência em web/PC, e debounce de 10 min.
3. **6 Invariantes de Botões Z-API em Lembretes (Manual/Robô)**: Quando o destinatário ainda NÃO confirmou aceite (`PROPOSTA`), e SOMENTE neste caso, o botão "Confirmar" DEVE ser exibido sempre. Como a Meta/Z-API limita a 3 botões rápidos, omite-se "Ativar Notificações" dos botões (preservado no rodapé) para acomodar `Confirmar`, `Não Poderei` e `Disponibilidade`. Se já confirmado (`DESIGNADA`), o botão "Confirmar" é omitido, liberando vaga para o botão de push.
4. **AXIOMA IRREVOGÁVEL (Multi-IDE e Sync Remoto)**:
   - Toda a memória de conversas (`/memories/session/`), estado atual (`_ESTADO-ATUAL.md`) e aprendizados correlatos (`/memories/`) DEVE subir para o repositório remoto Git (`git commit` + `git push`) ao final de cada bloco lógico ou sessão, e obrigatoriamente antes de trocar de agente ou IDE.
   - Qualquer agente iniciando conversa em qualquer IDE (VS Code, Cursor, Antigravity, Claude Code) DEVE primeiro ler as memórias antes de agir.
   - O que estiver no `.gitignore` (ex: material de HG em `docs-local/`, dumps de DOM, sessões de browser, tokens/chaves) NUNCA sobe para o remoto.
5. **Motor de Designações**: Regras `2026-10-15.01` em `.agents/workflows/motor-invariants.intent.md` (M-0…M-12) e `eligibilityService.ts`. Modelo de decisão lexicográfico por faixas (buckets).
   - **Blindagem Bidirecional de Gênero (Titular ↔ Ajudante)**: Duplas de demonstração de estudantes DEVEM ser do mesmo sexo (irmão+irmão ou irmã+irmã), tanto quando o ajudante é designado tendo o titular definido, quanto quando o titular é designado/substituído tendo o ajudante já definido.
   - **Exceções de Parentesco Preservadas Integralmente**:
     - *Cônjuges*: Marido e esposa podem formar dupla independente do sexo (`spouseId` cruzado).
     - *Pais e Filhos*: Pai/mãe com filho/filha podem formar dupla independente do sexo (`parentIds` / `childIds` bidirecionais).
     - Pares de sexos opostos sem parentesco comprovado são sumariamente bloqueados (`eligible: false`), impedindo reincidências tanto no robô automático de reatribuição quanto na seleção manual.
     - **BD Intocado**: Registros do banco de dados não são alterados retroativamente sem autorização expressa.
6. **Publicação S-89**: Apenas o SRVM publica via botão manual; Crons D-7 e D-2 exigem registro prévio `PUBLICACAO_S89` com `SUCCESS`.
7. **Isolamento de Segurança**: Pasta `docs-local/`, diretórios de sessão (`hourglass_session/`, `whatsapp_session_data/`) e credenciais nunca sobem para repositórios públicos.
8. **Faturamento BYOK**: Modelo Google com API Key própria consome créditos da Conta RVM Pro (`017DC8-83643E-7F9157`) do Google Developer Program Premium (~R$ 58/mês), preservando a cota do Copilot Pro+/Max.

---

## 3. Pendências Ativas do Projeto

0. **Destino dos arquivos não rastreados** (`scratch/`, `scripts/check_*.ts`): manter no `.gitignore` ou commitar seletivamente.
1. **Alerta de Desconexão Z-API (P10)**: Implementar monitoramento ativo de webhooks (`on-disconnected`) para alertar SRVM caso o celular da congregação fique offline.
2. **Monitor Canônico 2.0 (P2)**: Criar tabela `system_canonical_events` e consolidar observabilidade 360º.
3. **Integração Sentry (P5)**: Instalar telemetria técnica de APM.
4. **Evolução Cognitiva (A1-A6)**: Habilitar `pgvector` no Supabase e avançar para motor de perfis.
5. **Vedação de Tela Legada (`CommunicationTab.tsx`)**: Tranca de `logDispatch` vs aposentadoria do Chatbot para S-89.
6. **Log Canônico do Pacote S-140**: Implementar no `s140PackageService` o registro canônico estrito dos envios em lote (PDF) e emergenciais para os Responsáveis pelo Quadro.
7. **Reengenharia HG → RVM**: responder R1–R12 em `docs-local/hourglass/reengenharia-2026-11-06/00-indice-e-parecer.md`; se aprovado, abrir issues RF-PES-04 / RF-AGT-01 / RF-FRM-01 e iniciar M0/I0.

---

## 4. Reengenharia HG → RVM (2026-11-06) — resumo para posicionamento

- **Pacote** (local, gitignored, sem dados pessoais): `docs-local/hourglass/reengenharia-2026-11-06/00…07` + `diagramas/` (13 Mermaid `.mmd`/`.svg`). Detalhes em `_ESTADO-ATUAL.md` raiz §36 e em `memories/repo/reengenharia-hg-2026-11-06.md`.
- **Tese**: absorver o que falta do HG por **ações de chat + imagem exata dos S-n** (não por telas); alicerce primeiro (cadastro único M1 → catálogo de privilégios M2 → estado unificado M3).
- **IA**: "último recurso" — L0 gramática → L1 cache → **L2 Jev** (0,90 escrita / 0,75 leitura) → L3/L4 LLM `:free` com schema → L5 humano; teto US$ 3/mês. FinOps OpenRouter: comprar US$ 10 uma vez, saldo nunca negativo, chave por carga.
- **Normas**: S-38 vigente **S-38-T 8/26** (28 §; antecedência 3 semanas §24); territórios 4 meses (od 9§30–34); 12 itens NÃO CONFIRMADOS (V1–V12) permanecem parâmetros.
- **Aguardando**: decisões R1–R12 do Eliezer. Pesquisa pública concluída (S-38/od/LGPD + HG/concorrentes/fontes jw.org) e incorporada ao doc 07.
