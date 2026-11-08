# Estado Atual do Workspace — Antigravity / RVM Designações

> **Fonte Canônica Principal de RVM**: `_ESTADO-ATUAL.md` (na raiz do repositório `rvm-designacoes-unified/`, prevalece para regras, motor, histórico e pendências de RVM)  
> **Última Atualização**: 2026-11-07 21:45 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável em Produção. Motor de Designações `2026-10-15.01` com **Blindagem Bidirecional de Gênero e Parentesco** (Titular ↔ Ajudante) ativa. Integrações externas: estado mantido **apenas localmente** (`docs-local/_ESTADO-LOCAL.md`; regra inflexível de 2026-11-07). Resumo Desacoplado de Próximas Designações Z-API ativo nos envios de S-89 e em Lembretes de Falta de Confirmação (72h / D-9). Planejamento das 6 Invariantes de Botões Z-API de Lembretes (Manual/Robô) concluído. Textos e formatação de datas (DD/MM/AAAA) teocráticos e cordiais padronizados. Axioma Irrevogável de Memória Multi-IDE ativo e sincronizado.

---

## 1. Visão Geral do Workspace

O repositório unificado reside em `rvm-designacoes-unified/`:
- **Produção**: `https://rvm-designacoes-antigravity.vercel.app` (Vercel CLI autenticado com `VERCEL_TOKEN`).
- **GitHub Pages**: `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/` (`npm run deploy`).
- **Supabase**: Projeto `pevstuyzlewvjidjkmea`.
- **Último Checkpoint Git RVM**: commit "chore(policy): isolamento da integração externa e de sessões de navegador no repositório público (2026-11-07)" — único commit à frente de `origin/main`; **histórico reescrito localmente; force-push pendente** (ver §2.4 e pendência 8).

---

## 2. Invariantes Canônicos

1. **Estado Vivo**: Sempre consultar `_ESTADO-ATUAL.md` e manter este `/memories/repo/_ESTADO-ATUAL.md` atualizado in-place.
2. **Resumo Desacoplado de Próximas Designações Z-API**: Se um publicador receber S-89 (manual/lote) OU lembrete de falta de confirmação (`COBRANCA_72H` ou `LEMBRETE_D9` para partes `PROPOSTA`), e possuir $\ge 2$ designações futuras já publicadas, recebe uma mensagem extra desacoplada com o resumo de todas as suas próximas partes reais (descartando partes secundárias/implícitas de presidente como Oração Inicial, Comentários e Conselhos, e cânticos), com status e botões de ação rápida nativos do WhatsApp (`send-button-actions` prioritários, limitados a 3 botões rápidos: confirmação/recusa para pendentes e recusa das datas mais próximas para confirmadas), link de portal permanente para contingência em web/PC, e debounce de 10 min.
3. **6 Invariantes de Botões Z-API em Lembretes (Manual/Robô)**: Quando o destinatário ainda NÃO confirmou aceite (`PROPOSTA`), e SOMENTE neste caso, o botão "Confirmar" DEVE ser exibido sempre. Como a Meta/Z-API limita a 3 botões rápidos, omite-se "Ativar Notificações" dos botões (preservado no rodapé) para acomodar `Confirmar`, `Não Poderei` e `Disponibilidade`. Se já confirmado (`DESIGNADA`), o botão "Confirmar" é omitido, liberando vaga para o botão de push.
4. **AXIOMA IRREVOGÁVEL (Multi-IDE e Sync Remoto)**:
   - Toda a memória de conversas (`/memories/session/`), estado atual (`_ESTADO-ATUAL.md`) e aprendizados correlatos (`/memories/`) DEVE subir para o repositório remoto Git (`git commit` + `git push`) ao final de cada bloco lógico ou sessão, e obrigatoriamente antes de trocar de agente ou IDE.
   - Qualquer agente iniciando conversa em qualquer IDE (VS Code, Cursor, Antigravity, Claude Code) DEVE primeiro ler as memórias antes de agir.
   - **Histórico reescrito em 2026-11-07 (local, `git filter-repo`)**: até o `git push --force` autorizado, NÃO fazer `git pull`/`merge` do remoto; depois, realinhar clones (`git fetch origin; git reset --hard origin/main`). Bundle de segurança em `docs-local/`.
   - **Regra inflexível (Eliezer, 2026-11-07)**: o que estiver no `.gitignore` NUNCA sobe para o remoto — e **tudo** o que diz respeito à integração externa HG (código, scripts, documentação, memórias, dados, sessões de browser) DEVE estar no `.gitignore`. Memória sobre esse tema fica em arquivos locais: `docs-local/_ESTADO-LOCAL.md`, `README-HG-RVM.md` e memórias com `hg` no nome.
5. **Motor de Designações**: Regras `2026-10-15.01` em `.agents/workflows/motor-invariants.intent.md` (M-0…M-12) e `eligibilityService.ts`. Modelo de decisão lexicográfico por faixas (buckets).
   - **Blindagem Bidirecional de Gênero (Titular ↔ Ajudante)**: Duplas de demonstração de estudantes DEVEM ser do mesmo sexo (irmão+irmão ou irmã+irmã), tanto quando o ajudante é designado tendo o titular definido, quanto quando o titular é designado/substituído tendo o ajudante já definido.
   - **Exceções de Parentesco Preservadas Integralmente**:
     - *Cônjuges*: Marido e esposa podem formar dupla independente do sexo (`spouseId` cruzado).
     - *Pais e Filhos*: Pai/mãe com filho/filha podem formar dupla independente do sexo (`parentIds` / `childIds` bidirecionais).
     - Pares de sexos opostos sem parentesco comprovado são sumariamente bloqueados (`eligible: false`), impedindo reincidências tanto no robô automático de reatribuição quanto na seleção manual.
     - **BD Intocado**: Registros do banco de dados não são alterados retroativamente sem autorização expressa.
6. **Publicação S-89**: Apenas o SRVM publica via botão manual; Crons D-7 e D-2 exigem registro prévio `PUBLICACAO_S89` com `SUCCESS`.
7. **Isolamento de Segurança**: Pasta `docs-local/`, diretórios de sessão de navegador/WhatsApp (`whatsapp_session_data/` — esteve rastreado por engano de 2026-08-03 a 2026-11-07; retirado do índice e do histórico) e credenciais nunca sobem para repositórios públicos.
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
7. **Integração externa (local)**: pendências mantidas em `docs-local/_ESTADO-LOCAL.md` → seção "Pendências".
8. **Force-push do histórico reescrito** (aguarda autorização expressa de Eliezer): `git push --force origin main` + `git push --force --tags`; apagar a branch remota `copilot/research-accessibility-analysis` (reescrita, sem commits exclusivos); `gh-pages` não muda. Depois: `git fetch --prune origin` + `git gc --prune=now`, realinhar clones de outras IDEs e **desconectar o dispositivo WhatsApp Web** cuja sessão esteve pública.

---

## 4. Integrações externas — mantido apenas localmente

- Regra inflexível (2026-11-07): tudo o que diz respeito à integração externa HG fica fora do remoto. Posicionamento rápido, histórico e pendências em `docs-local/_ESTADO-LOCAL.md`; README do projeto em `README-HG-RVM.md` (raiz, não versionado).
