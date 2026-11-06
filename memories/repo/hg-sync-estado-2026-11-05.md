# HG-Sync — Estado e Memória Persistente (2026-11-05)

> Módulo desacoplado em `rvm-designacoes-unified/hg-sync/` (painel `http://localhost:4610`). Sincroniza RVM ⇄ Hourglass (HG).
> Atualizado em 2026-11-05 22:25 (BRT): **Blocos 1 a 4 Concluídos — Sincronização 100% Automática (Zero Clique)** implementada e testada (`14/14` testes unitários em `hg-sync` + `110/110` testes no RVM principal).

## 1. Requisitos e Invariantes (Não Negociar)
- **100% Automático (Hands-Free)**:
  - **Meio de semana (`RVM ➡️ HG`)**: monitora continuamente o RVM (detector rápido de hash a cada 60s + ciclo completo de 5 min) e grava automaticamente no HG todas as partes (`core` + `cbs` + `tgw` + `fm` titular/ajudante + `lac`) das semanas publicadas da semana atual em diante. O RVM sempre prevalece; parte vazia no RVM ⇒ esvazia automaticamente no HG (`assignee: 0`).
  - **Downloads (`Downloads ➡️ HG`)**: monitora `C:\Users\Eliez\Downloads` (`fs.watch` com debounce de 3s + hash `SHA-256` em `data/processed-files.json`) e sincroniza automaticamente em background (`headless: config.headlessBrowser`) qualquer arquivo novo ou modificado de escala (`PRESIDENTE E LEITOR.pdf`, `INDICADORES E MICROFONE.pdf`, `DESIGNAÇÕES LIMPEZA.pdf`) sem exigir clique no painel.
  - **Auto-Recuperação de Sessão (`ensureAuthenticatedForAutoSync`)**: se houver pendências de sincronização e a sessão do HG estiver desconectada/expirada, o serviço (rodando na sessão interativa do usuário) abre automaticamente uma única janela do Chrome nativo (com cooldown de 6h), aguarda o login/Passkey via CDP (`9333`), salva `data/hg-cookies.json`, fecha a janela e executa imediatamente o sync pendente.
- **Desacoplamento**: nada de HG-Sync no build/test/deploy do RVM principal. Supabase do RVM é **somente leitura** (`SELECT`). Nunca escrever do HG para o RVM.
- **Governança Jev**: O uso do Jev da TypeSafe (`scripts/jev-check.mjs`) pertence ao projeto futuro **`idd-ide`** e está suspenso no RVM Designações (ver `.roo/rules/10-jev-verificacao.md`).

## 2. Entregas Concluídas e Verificadas (Blocos 1 a 4)
1. **Bloco 1 (Higiene de Sessão e Auto-Login Inteligente)**:
   - `config.ts`: `sessionDir` consolidado exclusivamente em `hg-sync/data/hourglass_session`.
   - `session.ts`: `hasSavedSession()`, `isAuthenticated(forceLaunch)` sem abrir Chrome headless quando não há sessão salva, `ensureAuthenticatedForAutoSync()` com cooldown de 6h, `startLoginWindow()`, `cancelLogin()` e diagnóstico completo em `/api/status/session` (`pid`, `chromePath`, `cdpReachable`, `lastError`).
2. **Bloco 2 (Meio de Semana 100% Automático — Core + CBS + TGW + FM + LAC)**:
   - `reconcile.ts` + `api.ts` + `browser.ts`: `saveMidweekSlot()` grava todas as seções via REST API com fallback automático via DOM headless (`saveMidweekSlotViaDom`) e captura automática de endpoints em `data/endpoints.json`, além de releitura de verificação pós-escrita.
   - `worker.ts`: detector de hash do RVM a cada 60s + ciclo completo de 5 min.
3. **Bloco 3 (Downloads 100% Automático — Watcher + SHA-256 + Apelidos 100% Resolvidos)**:
   - `store.ts`: persistência de `data/processed-files.json` (`sha256`, `unresolvedCount`, `syncedCount`), apelidos calibrados para `ELIEZER` (`Eliezer Rosa`) e `LUIZ ALEXAND` (`Luiz Alexandrino`), e `syncAliasesWithKnownUsers()` para atualizar `hg_id` automaticamente com a lista oficial do HG/RVM.
   - `columns.json` + `dates.ts` + `detect.ts` + `scan.ts`: suporte completo às 3 escalas em `C:\Users\Eliez\Downloads`:
     - `PRESIDENTE E LEITOR.pdf`: 26 semanas, **0 pendências**.
     - `INDICADORES E MICROFONE.pdf`: 23 semanas, **0 pendências**.
     - `DESIGNAÇÕES LIMPEZA.pdf`: 7 semanas extraídas (Mês + faixa de datas + grupo multi-linha), **0 pendências**.
4. **Bloco 4 (Serviço Permanente no Logon Interativo do Usuário)**:
   - `install-service.ps1`: configurado com `New-ScheduledTaskPrincipal -LogonType Interactive` para garantir que a tarefa `RVM-HG-Sync` rode na sessão interativa do desktop do usuário.
   - Suíte de testes `npm test --prefix hg-sync`: **14/14 passando**.
