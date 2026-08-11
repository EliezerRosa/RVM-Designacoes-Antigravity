# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-08-11 17:55 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app`
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).

---

## 2. Últimas Correções de Produção (2026-08-11)

### 📌 Resolução da Desconexão de Publicadores (Caso Patrick)
- **Problema Solucionado**: Publicadores (como o Patrick) tinham a sessão derrubada e retornavam à tela de login ao acessar por links/favoritos contendo `#access_token=...` antigo da autenticação Google OAuth.
- **Mecanismo da Correção**:
  - `src/lib/supabase.ts`: Higienização de URL adicionada antes de `createClient`, removendo hashes de acesso antigos (`iat > 60s` ou `isExpired`) via `window.history.replaceState`.
  - `src/context/AuthContext.tsx`: `TOKEN_REFRESHED` otimizado para atualizar a sessão silenciosamente sem re-executar buscas de perfil.
- **Resultado**: Confirmado com sucesso pelo Patrick. Acesso de publicadores 100% estabilizado.

---

## 3. Estado do Banco & Módulo RM

- **Publicadores Cadastrados**: 192 publicadores (129 `is_congregated=true`, 63 `false`).
- **Relatórios Mensais**: 2.442+ relatórios no schema `rm.*` (set/2023–jun/2026).
- **Status do Serviço de Campo**: Regras `rm_status_rules_v3` ativas (ATIVO=6/6, IRREGULAR=1-5/6, INATIVO=0/6, RECÉM-CONGREGADO).

---

## 4. Próximos Passos Imediatos

1. Manter monitoramento do acesso dos publicadores via portal e links Z-API.
2. Re-importar `Relatórios Glide.xlsx` quando houver novos dados para sincronização.
