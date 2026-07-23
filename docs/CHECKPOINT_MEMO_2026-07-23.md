# Memorando Persistente de Atualizações — Checkpoint (23 de Julho de 2026)

Este memorando consolida todas as alterações, arquiteturas e melhorias implementadas no repositório desde o último checkpoint estável.

---

## 1. Módulo Z-API & Sincronização em Lote por Grupo

### 1.1 Sincronização de Contatos e 2FA em Lote (`ZApiGroupSyncModal.tsx` & `zapiGroupSyncService.ts`)
- **Visualização & Reconciliação**: Criado o modal no painel administrativo para buscar membros de qualquer grupo do WhatsApp (ex: "Congregação Parque Jacaraípe") via Z-API.
- **Matching Inteligente**: Reconcilia os números de telefone do WhatsApp com o cadastro de publicadores e perfis do RVM (matching por telefone normalizado e por similaridade NFD de nome).
- **Aprovação de 2FA em Lote**: Permite atualizar telefones e aprovar o status de verificação de WhatsApp (`whatsapp_verified = true`) em lote para publicadores selecionados com 1 clique.

### 1.2 Delegação Backend da Consulta de Grupos (`send-whatsapp` Edge Function)
- **Consulta via Backend Autônomo**: A consulta de metadados e membros de grupos do Z-API foi inteiramente delegada para o backend via Supabase Edge Function `send-whatsapp` (ação `fetch-group-metadata`).
- **Resolução de Segredos no Servidor**: A Edge Function consome diretamente as Secrets configuradas no Supabase Cloud (`ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN` e `WHATSAPP_PROVIDER=z-api`) com fallback para a tabela `app_settings`, eliminando a necessidade de o usuário inserir credenciais no navegador web.

### 1.3 Sinalização Visual de Resposta prévia a Links de Confirmação (S-89)
- **Rastreamento de Interações**: Adicionado o campo `hasRespondedLink` na reconciliação de membros do grupo. O sistema consulta dinamicamente se o publicador/telefone já respondeu a um link de confirmação no portal (`confirmation_portal_responses`, `confirmation_portal_tokens` usados, `workbook_parts` confirmadas/recusadas e `zapi_dispatch_log` de recibos).
- **Indicador no Modal**: Exibição da tag destacada `✨ Já respondeu Link S-89` em roxo no item da lista e adição do contador `✨ Respondeu Link: X` no cabeçalho estatístico do modal.
- **Políticas RLS & Cast de Tipos**: Habilitadas políticas RLS `SELECT` nas tabelas `confirmation_portal_responses` e `confirmation_portal_tokens` para a role `authenticated`, e aplicado conversão explícita de tipos de `publisher_id` (suportando IDs numéricos e UUIDs), garantindo a contabilização precisa de todos os publicadores com interações prévias.

### 1.4 Persistência e Resolução Dinâmica de Credenciais Z-API
- **Suporte a `app_settings`**: As chaves Z-API (`zapi_instance_id`, `zapi_instance_token`, `zapi_client_token`) podem ser lidas tanto das variáveis de ambiente `.env` (`VITE_ZAPI_*`) quanto da tabela `app_settings` no Supabase com timestamp `updated_at`.
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
*Documento mantido e atualizado no repositório em `docs/CHECKPOINT_MEMO_2026-07-23.md`.*
