# Resumo da Sessão: Roteamento de Web Push Desacoplado & Bloqueio Biométrico

### 1. Outstanding User Requests
- *Concluído:* "obrigar" que, após o 1º login, a biometria fosse acionada no modo `device_biometric` ou `flexible`.
- *Concluído:* Se o aparelho não suportar biometria (celular antigo/desktop sem senha), o sistema permite acesso sem bloqueio.
- *Concluído:* Fazer o build, commit e deploy do novo cron-web-push e das migrations de banco de dados do fluxo desacoplado.

### 2. User Knowledge
- **Regras de Roteamento de PWA:** Notificações do Z-API ditam o tom das notificações Web Push de forma dinâmica (Dashboard vs Confirmação de Designação).
- **Regra do Bloqueio de Biometria:** Usamos `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` nativamente pelo navegador. Caso suporte, a tela é 100% bloqueada após o OAuth do Google pedindo para ativar a biometria/PIN do aparelho. Sem fechar, o app fica escondido.

### 3. Work Accomplished
- **Migrations & DB:** Tabela `push_dispatch_log` criada e testada. RPC `get_pending_push_events` debuggada (corrigimos bugs de parse de UUID vs Text e JSONB).
- **Edge Functions:** `cron-web-push` atualizado, testado e feito deploy (`supabase functions deploy`).
- **Frontend (Bloqueio):** Novo componente `<ForceBiometricModal />` adicionado ao `App.tsx`. Inspeciona se o usuário já tem registro local; se não, tampa a tela e força a Action.
- **Git & Build:** Build finalizado com sucesso no Vite. Commit com a flag `feat: force biometric registration on 1st login` efetuado e push realizado.

### 4. Files and Code
- **Novos:** `src/components/ForceBiometricModal.tsx`
- **Modificados:** `src/App.tsx`, `supabase/migrations/2026081610000X...`, `cron-web-push/index.ts`.

### 5. Current Work and Next Steps
Tudo na nuvem! O fluxo completo de Web Push orientado a eventos e o onboarding forçado do PIN do aparelho estão live e prontos para teste real pelos irmãos no PWA.
