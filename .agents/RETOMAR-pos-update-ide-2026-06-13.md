# ⚠️ LEITURA OBRIGATÓRIA NO RETORNO — checkpoint pós-update IDE (2026-06-13)

> AGENTE: ao iniciar a PRÓXIMA conversa neste workspace, LEIA este arquivo ANTES
> de agir. É o ponto de retomada após o update do VS Code/extensão. Confirme se
> algo mudou no reload (git status, versão da extensão, MCPs ativos).
> Espelho versionado de `/memories/repo/RETOMAR-pos-update-ide-2026-06-13.md`.

## Git (rvm-designacoes-unified) — estado ao salvar
- Branch `main`, working tree LIMPO, sincronizado com `origin/main`.
- HEAD = `04caee8`. Commits desta sessão (12–13/jun), todos pushed + deployed (gh-pages):
  - `04caee8` fix: botão Excluir ProfileLinksPanel usa RPC `admin_delete_profile` (DELETE direto era no-op por RLS)
  - `9c6d0b2` feat: imagem de status S-140 mostra CONCLUIDA como aceita
  - `b993cd9` feat(admin): delete option + collapse toggle no ProfileLinksPanel
  - `e7e141f` fix: painel Auditoria WhatsApp usa coluna `dispatched_at` (era `created_at`)
  - `c0d1245` fix(zapi): alerta de recusa vai a SRVM + Ajd SRVM (nunca grupo)
- Nada pendente de build/deploy. `tsc` + `build` verdes no último ciclo.

## Trabalho concluído nesta sessão (tudo no ar)
1. **ZApiAuditPanel**: coluna `dispatched_at`.
2. **Cron WhatsApp lembretes**: `pg_cron`+`pg_net` instalados, job `zapi-daily-reminders`
   ativo (`0 12 * * *` = 09:00 BRT). Decisão: só **D-2/D-1 automáticos** (D-7 de 18/06
   perdido, sem catch-up). Próximos: D-2 16/06 09:00, D-1 17/06 09:00.
3. **Dia da reunião**: cron já lê `settings.s89_meeting_day_by_week` (mesma chave do modal
   S-89). Quinta (4) é só fallback. **NÃO era bug.**
4. **Imagem status S-140**: CONCLUIDA = "✓ ACEITA" (`S89SelectionModal`, `statusRef`, bloco
   "REGRA AUTORITATIVA"). Só na imagem; cards do modal intocados.
5. **Botão Excluir ProfileLinksPanel**: Opção B — RPC `admin_delete_profile` SECURITY DEFINER
   (migration `20260612000000_admin_delete_profile_rpc.sql`). Status RESOLVIDO.

## Backlog aberto (não urgente)
- `dispatchS89Receipt` ainda usa `waService` (client-side) — migrar p/ Edge Function ao
  unificar caminhos de envio sob provider `edge-function` em `whatsappAutoService`.
- GAP UI: notificações/links de recusa não aparecem na aba do Agente — proposta de
  banner/contador realtime gated SRVM+Ajd+Admin.

## Deploy workflow (lembrete)
cwd = `rvm-designacoes-unified`. `git add` → `git commit` (sem `()`/`{}`/`&&` na msg) →
`git push origin main` → `npm run deploy`. No PowerShell o push escreve no stderr mas
`EXIT=0` = sucesso (procurar `x..y main -> main`). Supabase projeto `pevstuyzlewvjidjkmea`.

## Descarte
Após a 1ª conversa pós-update confirmar ambiente OK e iniciar nova frente, este
checkpoint pode ser removido.
