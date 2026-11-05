# Prompt para Claude (Sonnet/Opus) — Tornar o HG-Sync 100% Automático (RVM ➡️ Hourglass)

Você é o agente de engenharia do projeto **RVM Designações**. Sua missão é concluir e validar o módulo **HG-Sync** (`rvm-designacoes-unified/hg-sync/`) para que a sincronização na direção **RVM ➡️ Hourglass (HG)** (e **Downloads ➡️ HG**) funcione de forma **100% automática, contínua e sem cliques manuais**. Responda sempre em português do Brasil.

## 0. Leitura Obrigatória Antes de Agir (nesta ordem)
1. `rvm-designacoes-unified/memories/repo/hg-sync-estado-2026-11-05.md` — estado atual, bloqueios e arquitetura.
2. `C:\Users\Eliez\.gemini\antigravity\brain\1adbcb0f-f57c-441c-9b0c-b194af095093\plano_hg_sync.md` — plano reajustado para operação 100% automática.
3. `rvm-designacoes-unified/hg-sync/README.md` e `rvm-designacoes-unified/_ESTADO-ATUAL.md` (seção `## 0. HG-Sync`).
4. Código: `hg-sync/src/hg/session.ts`, `browser.ts`, `api.ts`, `src/worker.ts`, `src/server.ts`, `src/config.ts`, `src/store.ts`, `ui/app.js`.
5. Governança Jev: `.roo/rules/10-jev-verificacao.md` e `memories/regras-intencao.md`.

## 1. Invariantes Inegociáveis
- **Operação 100% Automática (Zero Clique)**:
  - O usuário **não** deve precisar abrir o painel `http://localhost:4610` nem clicar em "Sincronizar" ou confirmar cada semana/documento.
  - Mudou ou publicou no RVM ➡️ sincroniza automaticamente para o HG.
  - Surgiu ou atualizou PDF/XLSX de escala em `C:\Users\Eliez\Downloads` ➡️ extrai e sincroniza automaticamente para o HG.
- **Unidirecional e RVM Prevalece (`RVM ➡️ HG`)**:
  - Supabase do RVM é **somente leitura** (`SELECT` / Realtime). Nunca escreva do HG para o RVM.
  - Da semana em curso em diante (semanas publicadas): o RVM é a fonte da verdade absoluta. Se uma parte for alterada no RVM, atualiza no HG; se for removida/esvaziada no RVM, limpa no HG (`assignee: 0`).
- **Desacoplamento Absoluto**:
  - Todo código fica isolado em `rvm-designacoes-unified/hg-sync/`. Não altere código de produção do RVM principal (`src/`).
- **Sessão de Janela do Windows**:
  - Processos iniciados pelo terminal do agente rodam em estação não interativa (sem janela visível no desktop do usuário).
  - Para o serviço rodar na sessão interativa do usuário (permitindo abrir a janela do Chrome nativo automaticamente quando a sessão do HG expirar), a Tarefa Agendada `RVM-HG-Sync` (`install-service.ps1`) ou o `start-hgsync.bat` deve rodar na sessão do usuário.
- **Conformidade Jev Gate (`.roo/rules/10-jev-verificacao.md`)**:
  - Antes de rodar `node scripts/jev-check.mjs .tmp/jev/proposta.patch` em diffs de `hg-sync/`, adicione em `memories/regras-intencao.md` a regra explícita de escopo do submódulo desacoplado `hg-sync/**` e gere sempre o arquivo `.tmp/jev/proposta.patch` em UTF-8 puro (`[IO.File]::WriteAllText`, sem `Out-String` do PowerShell para não corromper acentos).

## 2. Tarefas de Implementação (Execução Direta)

### Bloco 1 — Calibração do Jev Gate + Higiene de Sessão e Auto-Login
1. **Regra de Intenção `hg-sync`**:
   - Adicione em `memories/regras-intencao.md` (em `## Convenções de código`):
     `- Submódulo desacoplado hg-sync/ (hg-sync/src/**, hg-sync/ui/**, hg-sync/test/**) tem ciclo de vida próprio, acessa o Supabase do RVM apenas para leitura (SELECT) e sincroniza unidirecionalmente RVM/Downloads -> Hourglass.`
2. **Consolidação de Perfil Único (`hg-sync/src/config.ts`)**:
   - Fixe `sessionDir` exclusivamente em `path.join(HGSYNC_ROOT, 'data/hourglass_session')`.
3. **Auto-Login Inteligente e Higiene do Headless (`hg-sync/src/hg/session.ts`)**:
   - Não lance Chrome headless em `isAuthenticated()` quando não houver sessão salva (`!hasSavedSession()`).
   - Adicione `ensureAuthenticatedForAutoSync()`: se o worker tiver pendências para sincronizar e a sessão não estiver autenticada, dispare **automaticamente** `startLoginWindow()` (Chrome nativo via CDP na porta `9333`), respeitando um *cooldown* de 6 horas entre aberturas automáticas para nunca abrir janelas repetidas.
   - Assim que o usuário concluir o login/Passkey na janela do Chrome, salve `hg-sync/data/hg-cookies.json`, feche o Chrome nativo automaticamente e retorne `true` para o worker prosseguir imediatamente com a sincronização!
   - Exponha diagnóstico completo em `/api/status/session` (`pid`, `chromePath`, `cdpReachable`, `lastError`) e rota `POST /api/session/cancel`.

### Bloco 2 — Sincronização 100% Automática do Meio de Semana (`RVM ➡️ HG`)
4. **Cobertura Completa de Slots (`core` + `tgw` + `fm` + `lac`)**:
   - Em `hg-sync/src/hg/api.ts` e `hg-sync/src/hg/browser.ts`: além de `saveMidweekCore` (`chairman`, `openprayer`, `closeprayer`, `cbs_reader`), implemente a gravação automática das partes da apostila (`tgw`, `fm` titular e ajudante, `lac` e dirigente do EBC).
   - **Estratégia Híbrida Automática**: tente gravar via REST API do Hourglass; se a rota retornar erro (`404`/`405`), execute automaticamente o fallback via interface DOM (`browser.ts` em `/v2/page/app/scheduling/mm` em modo headless) e intercepte o request real (`page.on('request')`) salvando em `data/endpoints.json` para que as próximas escritas usem REST diretamente.
   - **Releitura Automática de Verificação**: após aplicar o lote de diferenças da semana, releia `getMidweekSchedule` e confirme no log que os IDs no HG batem com o RVM (incluindo `assignee: 0` para partes esvaziadas).
5. **Gatilho Contínuo e Imediato (`hg-sync/src/worker.ts`)**:
   - Mantenha o ciclo de 5 minutos e adicione verificação rápida de hash de mudanças do RVM (ou assinatura Realtime em `workbook_parts` / `published_weeks`) para disparar `runCheck('auto_worker')` assim que houver alteração em semanas publicadas no RVM.

### Bloco 3 — Sincronização 100% Automática da Pasta Downloads (`Downloads ➡️ HG`)
6. **Watcher Automático de Escalas (`hg-sync/src/worker.ts` + `hg-sync/src/store.ts`)**:
   - Adicione controle de arquivos processados em `store.ts` (`data/processed-files.json` guardando `fileName`, `sha256`, `lastSyncedAt`, `pendingCells`).
   - No `SyncWorker`, monitore `config.downloadsDir` (`fs.watch` com debounce de 3s + verificação a cada ciclo do worker).
   - Sempre que um arquivo de escala (`PRESIDENTE E LEITOR.pdf`, `INDICADORES E MICROFONE.pdf`, Limpeza) for novo ou tiver `sha256` alterado (ou possuir células antes pendentes que agora têm apelido resolvido):
     - Extraia as linhas da semana atual em diante;
     - Sincronize **automaticamente** todas as datas/funções com `hg_id` resolvido via `hgBrowser.syncDocument(doc)` (usando `headless: config.headlessBrowser`, ou seja, invisível em segundo plano);
     - Registre no ledger e nos logs de auditoria (`trigger: 'auto_worker'`).
7. **Resolução Automática dos 3 Apelidos Pendentes de `INDICADORES E MICROFONE.pdf`**:
   - Ao conectar ao HG e carregar `getCongregationUsers()`, cruze os 3 nomes pendentes com a lista real de publicadores do HG/RVM, pré-registre os apelidos exatos/unívocos em `config/` ou `store` e reexecute o sync automático até zerar as pendências.

### Bloco 4 — Serviço Permanente no Logon do Usuário
8. **Ativação Permanente**:
   - Verifique `hg-sync/install-service.ps1` e `hg-sync/run-silent.vbs` para garantir que rodem no logon interativo do usuário e iniciem o servidor + worker + watcher automaticamente.
   - Instrua o usuário (em 1 passo único) a rodar `start-hgsync.bat` (ou `install-service.ps1`) e fazer o único login inicial no Chrome que se abrirá sozinho.

## 3. Critérios de Aceite
- **Zero clique para sincronizar**: tanto o Meio de Semana (RVM ➡️ HG) quanto os PDFs em Downloads (Downloads ➡️ HG) sincronizam sozinhos em segundo plano assim que há sessão válida.
- **Auto-Login**: se a sessão expirar, a janela do Chrome nativo abre sozinha (com cooldown), detecta o login via CDP, salva os cookies, fecha a janela e retoma o sync automático.
- **Testes Automatizados**: `npm test --prefix hg-sync` verde (incluindo testes para watcher/hash de Downloads, reconciliação completa do Meio de Semana e higiene de sessão) e `npm test` do RVM principal 110/110 intacto.
- **Memória Multi-IDE Sincronizada**: atualizar `memories/repo/hg-sync-estado-2026-11-05.md`, `_ESTADO-ATUAL.md` e `hg-sync/README.md`, mantendo `git status` limpo e sincronizado com `origin/main`.
