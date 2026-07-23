# Memorando Persistente de Atualizações — Checkpoint (23 de Julho de 2026)

Este memorando consolida todas as alterações, arquiteturas e melhorias implementadas no repositório desde o último checkpoint estável.

---

## 1. Módulo Z-API & Sincronização em Lote por Grupo

### 1.1 Sincronização de Contatos e 2FA em Lote (`ZApiGroupSyncModal.tsx` & `zapiGroupSyncService.ts`)
- **Visualização & Reconciliação**: Criado o modal no painel administrativo para buscar membros de qualquer grupo do WhatsApp (ex: "Congregação Parque Jacaraípe") via Z-API.
- **Matching Inteligente**: Reconcilia os números de telefone do WhatsApp com o cadastro de publicadores e perfis do RVM (matching por telefone normalizado e por similaridade NFD de nome).
- **Aprovação de 2FA em Lote**: Permite atualizar telefones e aprovar o status de verificação de WhatsApp (`whatsapp_verified = true`) em lote para publicadores selecionados com 1 clique.

### 1.2 Persistência e Resolução Dinâmica de Credenciais Z-API
- **Suporte a `app_settings`**: As chaves Z-API (`zapi_instance_id`, `zapi_instance_token`, `zapi_client_token`) podem ser lidas tanto do arquivo de variáveis de ambiente `.env` (`VITE_ZAPI_*`) quanto da tabela `app_settings` no Supabase.
- **Configuração no Modal**: Adicionada opção visual no modal para preenchimento e salvamento direto das chaves de instância com timestamp `updated_at`.
- **Limpeza de Instanciações Redundantes**: Refatoração no `zapiGroupSyncService.ts` e `whatsappAutoService.ts` evitando instâncias duplicadas de provedores.

---

## 2. Autenticação, Biometria & Primeiro Acesso

### 2.1 Login por Biometria/PIN (WebAuthn / Passkeys)
- **Painel de Configuração**: Adicionado suporte no Admin para registro e gestão de credenciais biométricas (Touch ID / Face ID / Fingerprint / PIN do aparelho).
- **Auto-Bind no Primeiro Acesso**: No primeiro acesso em dispositivos móveis, o vínculo de e-mail e biometria é realizado automaticamente no login sem necessidade de digitação repetida de e-mail.

### 2.2 Sincronização Global do Modo de Autenticação (`auth_system_mode`)
- Sincronização em tempo real do modo de autenticação do sistema (`auth_system_mode` em `app_settings`) para todos os dispositivos ativos, com fallback seguro no componente `LoginPage.tsx`.
- Simplificação do fluxo de primeiro acesso via Google OAuth com 1 toque.

---

## 3. PWA (Progressive Web App) & Service Worker

- **Configuração Completa de PWA**: Implementado `manifest.json`, Service Worker em `public/sw.js` com suporte a offline caching e estratégias de fallback.
- **Banner de Instalação Proativa**: Adicionado componente de prompt de instalação do app nativo para dispositivos Android, iOS e Desktop.

---

## 4. Estabilidade & Padrões TypeScript

- **`verbatimModuleSyntax` em `zapiOrchestrator.ts`**: Corrigida a importação da interface `WorkbookPart` utilizando a sintaxe estrita `import type { WorkbookPart }`, garantindo compilação 100% limpa com `npx tsc --noEmit`.

---

## 5. Próximos Passos (Backlog Alinhado)
- **Integração Backend da Consulta de Grupos Z-API**: Delegar a leitura de metadados do grupo (`group-metadata`) inteiramente para a Edge Function `send-whatsapp` para eliminar a necessidade de inserir credenciais no cliente web.

---
*Documento mantido no repositório em `docs/CHECKPOINT_MEMO_2026-07-23.md`.*
