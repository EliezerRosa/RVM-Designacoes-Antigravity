# Prompt para Claude (Sonnet/Fable) — Concluir e validar o HG-Sync

Você é o agente de engenharia do projeto **RVM Designações**. Continue o módulo **HG-Sync** (`rvm-designacoes-unified/hg-sync/`) até ele sincronizar de verdade com o Hourglass (HG). Responda em português do Brasil.

## 0. Leia antes de agir (obrigatório, nesta ordem)
1. `rvm-designacoes-unified/memories/repo/hg-sync-estado-2026-11-05.md` — estado, bloqueios, armadilhas.
2. `rvm-designacoes-unified/hg-sync/README.md` e `_ESTADO-ATUAL.md` (seção HG-Sync).
3. Código: `hg-sync/src/hg/session.ts`, `browser.ts`, `api.ts`, `src/worker.ts`, `src/server.ts`, `src/config.ts`, `ui/app.js`.
4. Plano original: `C:\Users\Eliez\.gemini\antigravity\brain\1adbcb0f-f57c-441c-9b0c-b194af095093\plano_hg_sync.md` (se existir).

## 1. Restrições invioláveis
- **Desacoplamento**: só altere `hg-sync/` (e memória/`_ESTADO-ATUAL.md`). Não mexa em código, build, testes ou deploy do RVM. Supabase do RVM é **somente leitura**.
- **Unidirecional**: RVM → HG. Nunca escreva do HG para o RVM.
- **RVM prevalece**: parte vazia no RVM ⇒ esvaziar no HG. Meio de semana: semana em curso em diante, só publicadas.
- **Escrita no HG é irreversível para a congregação**: antes de qualquer escrita real, faça **dry-run** (diff) e peça confirmação ao usuário; teste primeiro com **1 única data**. Nunca em massa sem confirmação.
- **Janela invisível**: processos que *você* inicia rodam em estação de janela não interativa — o Chrome NÃO aparece para o usuário. **Não suba o daemon para tentar login.** Peça ao usuário para rodar `C:\Antigravity - RVM Designações\start-hgsync.bat` (ou `install-service.ps1` em PowerShell dele). Você pode subir o servidor apenas para testes que não exijam janela (ex.: `/api/downloads/scan`), e deve encerrá-lo depois.
- Não contorne autenticação (Google/Passkey), não copie cookies do Chrome pessoal do usuário, não use credenciais. O login é sempre feito pelo usuário na janela dele.
- Siga as regras de `memories/regras-intencao.md` e rode o verificador `scripts/jev-check.mjs` conforme `.roo/rules/10-jev-verificacao.md` ao alterar código.

## 2. Tarefas (nesta ordem)
**A. Login confiável (com o usuário)**
1. Instrua o usuário (passo a passo curto) a rodar `start-hgsync.bat`, abrir `http://localhost:4610` e clicar **Conectar ao HG**. Se a janela não abrir, peça o texto do console do `.bat`.
2. Torne a falha diagnosticável: `/api/session/login` deve retornar o `pid` do Chrome e o caminho do `chrome.exe`; log claro de cada etapa; UI com estado "aguardando login (até 5 min)", botão "Cancelar" e mensagem se o Chrome não responder na porta 9333.
3. Verifique o ciclo completo: login → cookies salvos em `hg-sync/data/hg-cookies.json` → Chrome nativo fechado → worker/headless reabre com sessão válida → `GET /api/status/session` = `authenticated:true`. Se a sessão não persistir após fechar, investigue (cookies de sessão, `storageState`, perfil) e corrija.

**B. Higiene do runtime**
4. Consolidar os 3 perfis `hourglass_session` em **um** (definir caminho único em `hg-sync/data/`, sem depender de pastas do RVM) e atualizar `config.ts`.
5. Worker: não subir Chrome headless a cada 5 min quando não autenticado ou durante `isLoggingIn`; usar backoff e um único aviso na UI. Garantir que nunca disputa o perfil com o Chrome nativo do login.

**C. Validação de leitura (sem escrever)**
6. Com sessão ativa, ler do HG `mm/schedule/{range}`, `wm/schedule/{range}`, `av_attendant/{range}` e comparar com RVM/PDFs. Mostrar o diff no painel (prévia). Pendências de nome: resolver pelo dicionário de apelidos e perguntar ao usuário o que sobrar (`LUIZ ALEXANDR`, `GABRIEL CAMI`, `DANIEL`, `LOPES`, `ROGÉRIO`).

**D. Escrita (com confirmação)**
7. **Fim de semana (WM)** e **AV/Indicadores**: automação de UI (`browser.ts`) — Editar → dropdown → Salvar. Execute para **uma data**, confirme visualmente/por releitura da API, peça OK do usuário e só então o documento inteiro (`PRESIDENTE E LEITOR.pdf` 26 semanas; `INDICADORES E MICROFONE.pdf` 23 semanas). Releia do HG depois e comprove que bate com o documento.
8. **Meio de semana (RVM→HG)**: confirmar as rotas REST de escrita (`mm/schedule/{semana}/core`, `/{tgw|fm|lac}/{slot}`) capturando o tráfego real de uma edição manual (Playwright `page.on('request')`). Se não confirmar, usar o fallback por UI. Validar com 1 semana antes de ligar o worker de escrita contínua. Implementar a limpeza (`assignee: 0`) quando o RVM estiver vazio.
9. Registrar cada escrita no ledger/histórico (data, parte, antes → depois, origem).

**E. Permanente**
10. Peça ao usuário para rodar `install-service.ps1` (PowerShell dele) e validar que `RVM-HG-Sync` inicia no logon; documentar login (1 vez) e como renová-lo quando a sessão expirar (o painel deve mostrar 🔴 e o botão Conectar).

## 3. Critérios de aceite
- `authenticated:true` após login feito pelo usuário e após reinício do servidor (sessão persiste).
- 1 data de cada tipo (WM, AV, MM) escrita no HG e **confirmada por releitura**; depois, os documentos completos.
- Worker do meio de semana: alteração e limpeza no RVM refletidas no HG em ≤ 1 ciclo; sem Chrome headless desnecessário.
- `npm test --prefix hg-sync` verde + testes novos para: reconciliação (inserir/atualizar/limpar/noop), detecção de sessão e dry-run; `npm test` do RVM continua 110/110.
- Memória atualizada: `memories/repo/hg-sync-estado-*.md`, `_ESTADO-ATUAL.md`, `hg-sync/README.md`; `git push` ao fim de cada bloco (Axioma de Memória Multi-IDE).

## 4. Forma de trabalho
- Faça uma tarefa por vez, valide, commite (`fix(hg-sync): ...` / `feat(hg-sync): ...`) e dê push.
- Pare e pergunte ao usuário antes de qualquer escrita real no HG e sempre que precisar de ação na tela dele.
- Seja honesto sobre o que foi/não foi verificado; não declare "funcionando" sem releitura do HG.
