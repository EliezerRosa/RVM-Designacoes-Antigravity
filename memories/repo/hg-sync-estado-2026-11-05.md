# HG-Sync — Estado e Memória Persistente (2026-11-05)

> Módulo desacoplado em `rvm-designacoes-unified/hg-sync/` (painel `http://localhost:4610`). Sincroniza RVM ⇄ Hourglass (HG).
> Diretriz atualizada em 2026-11-05 19:45 (BRT): **Sincronização 100% Automática (Zero Clique)** tanto para Meio de Semana (`RVM ➡️ HG`) quanto para Escalas em Downloads (`Downloads ➡️ HG`), com auto-popup de login na sessão do usuário quando a sessão expirar.

## 1. Requisitos e Invariantes (Não Negociar)
- **100% Automático (Hands-Free)**:
  - **Meio de semana (`RVM ➡️ HG`)**: monitora continuamente o RVM (Supabase Realtime / hash de mudanças + ciclo de 5 min) e grava automaticamente no HG todas as partes (`core` + `tgw` + `fm` + `lac`) das semanas publicadas da semana atual em diante. O RVM sempre prevalece; parte vazia no RVM ⇒ esvazia automaticamente no HG (`assignee: 0`).
  - **Downloads (`Downloads ➡️ HG`)**: monitora `C:\Users\Eliez\Downloads` (`fs.watch` + hash `SHA-256` em `data/processed-files.json`) e sincroniza automaticamente em background (headless) qualquer arquivo novo ou modificado de escala (`PRESIDENTE E LEITOR.pdf`, `INDICADORES E MICROFONE.pdf`, Limpeza) sem exigir clique no painel.
  - **Auto-Recuperação de Sessão**: se houver pendências de sincronização e a sessão do HG estiver desconectada/expirada, o serviço (rodando na sessão de logon do usuário) abre automaticamente uma única janela do Chrome nativo (com cooldown de 6h), aguarda o login/Passkey via CDP (`9333`), salva `data/hg-cookies.json`, fecha a janela e executa imediatamente o sync pendente.
- **Desacoplado**: nada de HG-Sync no build/test/deploy do RVM principal. Supabase do RVM é **somente leitura** (`SELECT`). Nunca escrever do HG para o RVM.
- **Permanente**: Tarefa Agendada do Windows (`install-service.ps1`, tarefa `RVM-HG-Sync`, no logon do usuário, via `run-silent.vbs`).

## 2. O que já está pronto e verificado
- Extração real: `PRESIDENTE E LEITOR.pdf` = 26 semanas (100% nomes resolvidos); `INDICADORES E MICROFONE.pdf` = 23 semanas (3 pendências de nome a resolver automaticamente ao carregar a lista de usuários do HG).
- UI (`http://localhost:4610`), scanner de Downloads, resolvedor de nomes, `src/hg/api.ts`, `src/hg/browser.ts`, `src/worker.ts`.
- Login via Chrome nativo + CDP (`80915b0`), sem flags de automação (`navigator.webdriver = false`), salvando `storageState` em `hg-sync/data/hg-cookies.json`.

## 3. O que falta implementar/validar (ver `hg-sync/PROMPT-CLAUDE.md`)
1. **Bloco 1 (Jev Gate + Sessão e Auto-Login)**:
   - Registrar escopo `hg-sync/**` em `memories/regras-intencao.md` para o verificador Jev (`scripts/jev-check.mjs`).
   - Consolidar `sessionDir` único em `hg-sync/data/hourglass_session`.
   - Evitar lançamento de Chrome headless quando `!hasSavedSession()` e adicionar `ensureAuthenticatedForAutoSync()` (auto-popup com cooldown de 6h).
2. **Bloco 2 (Meio de Semana 100% Automático — Core + TGW/FM/LAC)**:
   - Gravação híbrida (REST API + fallback automático por UI headless com captura de endpoint em `data/endpoints.json`) e releitura automática de verificação.
3. **Bloco 3 (Downloads 100% Automático — Watcher SHA-256)**:
   - `fs.watch` + controle de hash em `data/processed-files.json` disparando `hgBrowser.syncDocument(doc)` em modo headless automaticamente.
4. **Bloco 4 (Serviço Permanente na Sessão do Usuário)**:
   - Rodar `start-hgsync.bat` / `install-service.ps1` na sessão do usuário para concluir o primeiro login e manter o serviço ativo no logon.
