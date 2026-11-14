# Checkpoint Estável — Pós-Entrega "Conversa RVM" & Pré-Revisão do Plano (2026-11-13)

> **Data**: 2026-11-13 18:15 (BRT)  
> **Tag Git**: `checkpoint-conversa-ui-2026-11-13`  
> **Baseline de Código**: `27aaafc` (`feat(conversa): refina carrossel sem barras de rolagem e auto-ajuste responsivo de forms`)  
> **Checkpoint Anterior**: `checkpoint-pre-conversa-ui-66f083d` (pré-implementação da UI Conversa RVM)

---

## 1. Propósito deste Checkpoint

Congelar um ponto de restauração seguro após a entrega e o refinamento responsivo da UI-Chat-IA desacoplada (`src/features/conversa/**`, `conversa.html`, `api/conversa-nlu.ts`) e imediatamente antes da revisão de [`memories/repo/plano-ui-conversa-ia-2026-11-10.md`](../repo/plano-ui-conversa-ia-2026-11-10.md).

## 2. Verificações Executadas na Criação do Checkpoint (2026-11-13)

| Portão | Comando | Resultado observado |
|---|---|---|
| Suíte automatizada | `npm test` | **134/134 aprovados** (`0` falhas, `0` pulados) |
| Lint estrito Conversa | `npx eslint src/features/conversa api/conversa-nlu.ts` | **Exit 0** (`0` erros / `0` warnings) |
| Build de produção | `npm run build` (`vite build`) | **Exit 0** (`dist/index.html` e `dist/conversa.html` gerados) |
| Verificação TS completa | `npm run type-check` (`tsc -b`) | **Exit 2** (erros estritos pré-existentes no legado em `src/App.tsx`, `src/components/*` e `src/services/*`, mais 4 checagens de estreitamento em `src/features/conversa/__tests__/conversaFlow.test.ts` — código preservado sem alterações) |

## 3. Ajuste Pontual Registrado no Banco de Dados (Supabase `pevstuyzlewvjidjkmea`)

- Executado em `2026-11-13` (diretamente no BD, sem alterar arquivos do repositório):
  - **Tabela**: `workbook_parts` (`week_id = '2026-11-30'`)
  - **Registro**: `id = 58369c96-f099-4e49-a0f3-3ee2b7ddb15a` (`seq = 18`, `tipo_parte = 'Evento Especial'`, `status = 'DESIGNADA'` preservado)
  - **Alteração**: `resolved_publisher_id` atualizado de `'21'` para `'19'` (única linha modificada dentre as 23 da semana; `special_events` inalterado).

## 4. Como Restaurar em Caso de Rollback

```powershell
git fetch origin --tags
git checkout checkpoint-conversa-ui-2026-11-13
```

## 5. Evolução Pós-Checkpoint (2026-11-13 23:30 BRT) — Abertura Local 1-Comando Sem Fricção

1. **Comando único `npm run conversa`** (`scripts/conversa-dev.mjs` + `package.json`):
   - Detecta se já há instância Vite ativa servindo `/conversa.html` com middleware local (`5173`/`5174`/`5175`) e abre `http://localhost:<port>/conversa.html` direto no navegador padrão sem abrir segunda porta; caso não haja, inicia `vite --open /conversa.html`.
2. **Autenticação Local In-Place & NLU Local (`vite.config.ts`, `ConversaAuthGate.tsx`, `ConversaApp.tsx`)**:
   - Em `vite.config.ts` (`apply: 'serve'`), o middleware `/__conversa_dev_auth` (restrito a loopback `127.0.0.1`/`::1`) gera `hashed_token` (`magiclink`) do perfil admin usando a `SUPABASE_SERVICE_ROLE_KEY` local, e `/api/conversa-nlu` executa `api/conversa-nlu.ts` diretamente no Vite (com `bypass` no proxy `/api`).
   - Em `ConversaAuthGate.tsx`, acessos em `localhost`/`127.0.0.1` (`import.meta.env.DEV`) autenticam automaticamente na própria aba via `supabase.auth.verifyOtp`, eliminando o redirecionamento pós-OAuth para `https://rvm-designacoes-antigravity.vercel.app/#` (e respeitando logout explícito `cv_manual_logout` em `ConversaApp.tsx`).
3. **Rotas `/conversa` e `/conversa.html` em `vercel.json` & Tipagem em `conversaFlow.test.ts`**:
   - Adicionados rewrites explícitos para `/conversa` e `/conversa.html` antes de `/(.*) -> /index.html` em `vercel.json`.
   - Concluído o estreitamento de tipos em `src/features/conversa/__tests__/conversaFlow.test.ts` (zero erros TS e zero erros ESLint em `src/features/conversa/**`).
4. **Repositório Dedicado GitHub Pages `EliezerRosa/conversa-rvm` (`npm run deploy:conversa`) & Ponte SSO Cross-Origin**:
   - Criado `scripts/deploy-conversa-pages.mjs` para publicar a UI Conversa RVM diretamente em `https://github.com/EliezerRosa/conversa-rvm` com GitHub Pages ativo em `https://eliezerrosa.github.io/conversa-rvm/` (`index.html`, `conversa.html` e `404.html` apontando para o bundle de Conversa, sem `sw.js` legado), além de blindar `.github/workflows/deploy.yml` (Node 22 + `/conversa/index.html`), `public/sw.js` (`rvm-pwa-v2`) e ponte SSO/OAuth cross-origin (`?oauth_return_to=...` / `#conversa_sso=...` entre `eliezerrosa.github.io` e `rvm-designacoes-antigravity.vercel.app`) em `conversa.html`, `index.html` e `ConversaAuthGate.tsx`.



