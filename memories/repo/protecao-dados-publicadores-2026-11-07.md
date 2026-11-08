# Proteção de dados de publicadores no repositório público (regra de 2026-11-07)

> Memória durável do workspace. **Arquivo público** — não contém, e nunca deve conter, nomes, telefones, e-mails ou SHAs de histórico antigo.

## Regra (Eliezer, 2026-11-07)
- Dumps do banco, seeds, evidências de testes e saídas de scripts que carreguem dados de publicadores (nome, gênero, telefone, e-mail, congregação, grupo de campo, tokens de confirmação) **nunca** sobem para o repositório público `EliezerRosa/RVM-Designacoes-Antigravity`.
- Documentos públicos (incl. `_ESTADO-ATUAL.md` e espelho) citam publicador só por **papel + `publisher_id`** — nunca e-mail/telefone.
- Aplicada em 2026-11-07: bloco dedicado no `.gitignore` (logo após `whatsapp_session_data/`), 16 arquivos retirados do índice, histórico reescrito e remoto realinhado por force-push (autorizado). Fatos do incidente ficam **apenas** em `docs-local/_ESTADO-LOCAL.md`.

## Padrões ignorados (bloco do `.gitignore`)
`_backups-local/` · `backup_rvm_*.json` · `backup-pre-cleanup-*/` · `comparison_result.txt` · `scripts/_rm_seed.sql` · `scripts/test_lifecycle_evidence.json` · `scripts/test_lifecycle_log.txt` · `scripts/week_check_output.txt` · `scripts/_archived/*.txt` (além de `backups/` e `*.csv`, já existentes).

## Geradores que continuam gravando nesses caminhos (sem alteração de código)
- `scripts/full_backup.ts` → `backup_rvm_COMPLETO_<timestamp>.json` na raiz (ignorado pelo padrão). Guardar cópias em `_backups-local/`.
- `scripts/_gen_rm_sql.py` → `scripts/_rm_seed.sql`.
- `scripts/test_full_lifecycle.ts` → `scripts/test_lifecycle_evidence.json` + `scripts/test_lifecycle_log.txt`.

## Checagem antes de qualquer commit que toque dados/documentos
```powershell
# celulares BR (com ou sem +55/DDI) em arquivos rastreados que não são código
git grep -I -n -P '(?<!\d)(?:\+?55\s?)?\(?[1-9]\d\)?\s?9\s?\d{4}[-\s]?\d{4}(?!\d)' HEAD -- . ':!*.ts' ':!*.tsx' ':!*.js' ':!*.cjs' ':!*.mjs' ':!*.json'
# e-mails pessoais (excluir os domínios/contas institucionais conhecidos ao revisar)
git grep -I -l -E '[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.' HEAD -- . ':!*.ts' ':!*.tsx' ':!*.js' ':!*.cjs' ':!*.mjs' ':!supabase/migrations'
# arquivos novos que caem nos padrões protegidos (devem aparecer como ignorados, nunca como "??")
git status --short --ignored | Select-String 'backup|_rm_seed|lifecycle|_archived'
```

## Pendência em aberto (decisão do Eliezer)
- Nomes e telefones de publicadores escritos **diretamente em código** (`src/services/*`, `scripts/test_*.ts`, `scripts/_archived/*.py`) não foram tocados — exigiriam alterar `src/` e nova reescrita de histórico.
- Nomes dos titulares de papéis (CCA/SEC/SS/SRVM) citados em documentos públicos (`_ESTADO-ATUAL.md`, `.agents/workflows/motor-invariants.intent.md`, `docs/motor-grafo-2026-10-09.html`, `database/update_publisher_availability.sql`) — **decidido manter** (Eliezer, 2026-11-07: papéis públicos da congregação); telefones/e-mails desses titulares, não.

## Lições de execução (reescrita com `git filter-repo`)
- Enumerar também os **caminhos históricos antigos** dos arquivos (antes de renomes/moves) e usar `--path-glob` para variações de nome.
- Arquivo de `--replace-text` deve ser UTF-8 **sem BOM**; substituir **linhas inteiras literais** quando o dado está num documento, nunca nomes soltos que também existem em código.
- Depois do force-push: `git fetch --prune`, `reflog expire --expire=now --all`, `gc --prune=now`; clones em outras IDEs realinham com `git fetch origin; git reset --hard origin/main` (nunca `pull`).
- Commits antigos seguem acessíveis por SHA no GitHub até o GC deles → não citar SHAs antigos em arquivos públicos; purga garantida só via GitHub Support.
