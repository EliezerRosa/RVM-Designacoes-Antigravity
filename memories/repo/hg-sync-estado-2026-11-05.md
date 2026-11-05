# HG-Sync — Estado e Memória Persistente (2026-11-05)

> Módulo desacoplado em `rvm-designacoes-unified/hg-sync/` (painel `http://localhost:4610`). Sincroniza RVM ⇄ Hourglass (HG).
> Commits relevantes (branch `main`): `9ff037a`, `95a37f3`, `80915b0`. Testes: `npm test --prefix hg-sync` → 9/9 OK; RVM principal 110/110 OK.

## 1. Requisitos (invariantes — não negociar)
- **Desacoplado**: nada de HG-Sync no build/test/deploy do RVM. Supabase do RVM é **somente leitura** (`SELECT`). Nunca escrever do HG para o RVM.
- **Meio de semana (RVM → HG)**: da semana em curso em diante, só semanas **publicadas**. O RVM sempre vence; parte vazia no RVM ⇒ esvaziar no HG (`assignee: 0`).
- **Downloads**: extrair data+nomes de PDF/XLSX em `C:\Users\Eliez\Downloads` (Presidente/Leitor → `/scheduling/wm`; Indicadores/Microfones → `/scheduling/av_attendant`; Limpeza → `/scheduling/other/clean`).
- **Permanente**: Tarefa Agendada do Windows (`install-service.ps1`, tarefa `RVM-HG-Sync`, no logon, via `run-silent.vbs`).

## 2. O que está pronto e verificado
- Extração real: `PRESIDENTE E LEITOR.pdf` = 26 semanas (100% nomes resolvidos); `INDICADORES E MICROFONE.pdf` = 23 semanas (3 pendências de nome).
- UI (abas Downloads / Meio de Semana / Apelidos / Histórico), favicon, scanner, prévia, dicionário de apelidos.
- `src/hg/api.ts` (REST do HG), `src/hg/browser.ts` (automação de UI: navega meses, abre dropdown, clica nome, Salvar), `src/worker.ts` (vigia a cada 5 min), `src/midweek/{mapper,reconcile}.ts`, `src/names/resolver.ts`.
- `/api/sync/document` devolve **401** com mensagem clara se o HG não estiver autenticado (antes dava 500). UI bloqueia o clique e mostra aviso.
- `getContext(headless)` agora recria o Chrome quando o modo pedido difere do atual; `runExclusive` serializa abertura/fechamento.
- Login (`HgSessionManager.openLoginWindow`, commit `80915b0`): mata Chrome órfão do perfil → abre **Chrome nativo** (sem flags de automação) com `--remote-debugging-port=9333` e o `--user-data-dir` da sessão → observa via `connectOverCDP` até `fsreport/startup` retornar `whoami.user` → salva `storageState` em `hg-sync/data/hg-cookies.json` → fecha o Chrome nativo. Cookies são reaplicados em `getContext()`.

## 3. NÃO verificado (nunca rodou de ponta a ponta)
- **Login real concluído**: nunca foi feito por falta de janela visível (ver §4). `GET /api/status/session` sempre retornou `authenticated:false`.
- **Nenhuma escrita real no HG** foi executada: `browser.syncDocument` (WM/AV) e o worker autenticado do meio de semana nunca rodaram ao vivo.
- Rotas de escrita REST do meio de semana (`mm/schedule/{semana}/core`, `/{tgw|fm|lac}/{slot}`) seguem **inferidas**, não confirmadas. `PUT wm/schedule/{data}` → 405. O caminho por UI (Editar → dropdown → Salvar) foi comprovado manualmente.
- Que o cookie salvo + perfil persistente mantêm a sessão quando o Chrome headless reabre.

## 4. Bloqueio atual (causa-raiz)
- Processos iniciados pelo agente (Antigravity) rodam em **estação de janela não interativa**: nenhum `chrome`/`node` tem `MainWindowHandle` (inclusive o Chrome comum do usuário). Qualquer `chrome` aberto pelo servidor, se iniciado pelo agente, **não aparece na tela do usuário**. O painel dizia "abriu" mas nada aparecia.
- **Regra**: o servidor HG-Sync deve ser iniciado **pelo próprio usuário** (duplo-clique em `C:\Antigravity - RVM Designações\start-hgsync.bat`) ou pela Tarefa Agendada instalada por `install-service.ps1` rodado num PowerShell do usuário. O agente **não** deve subir o daemon para fins de login.
- Último estado deixado: daemon do agente encerrado; Chromes órfãos do perfil encerrados; porta 4610 livre.

## 5. Armadilhas conhecidas
- `config.sessionDir` escolhe o primeiro existente de: `rvm-designacoes-unified/hourglass_session`, `<raiz>/hourglass_session`, `hg-sync/data/hourglass_session`. Existem **3** perfis no disco; só o primeiro é usado (todos "NOT LOGGED IN"). Consolidar em um só.
- Chrome com perfil em uso ⇒ `ProcessSingleton`/`SingletonLock` (exit 21). Sempre matar Chrome do perfil antes de relançar (`killProfileChrome`).
- O worker chama `isAuthenticated()` a cada 5 min, que sobe um Chrome **headless** no perfil mesmo desconectado (pesado e conflita com o login nativo). Melhorar: backoff/pular enquanto `isLoggingIn` ou sem sessão.
- Erros de console `runtime.lastError ... message port closed` e `main.js RegisterClientLocalizationsError` vêm de extensões do navegador do usuário — ignorar.
- Nomes cortados nos PDFs (`LUIZ ALEXANDR`, `GABRIEL CAMI`, `DANIEL`, `LOPES`, `ROGÉRIO`) dependem de `config/` de apelidos + resolvedor fonético; 105/133 publicadores têm `hg_id`.
- Playwright 156/Chrome estável em `C:\Program Files\Google\Chrome\Application\chrome.exe`; login do HG usa Google Sign-In/Passkey (só navegador real).

## 6. Próximos passos (ver `hg-sync/PROMPT-CLAUDE.md`)
1. Usuário sobe `start-hgsync.bat` e conclui o login; validar `authenticated:true`.
2. Validar leitura (dry-run) e, só então, escrita: 1 semana → documento inteiro.
3. Confirmar rotas de escrita do meio de semana (captura de rede) ou manter fallback por UI.
4. Reduzir custo do worker; consolidar perfis; instalar tarefa agendada; atualizar README/memória; commit + push.
