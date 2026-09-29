# Anatomia de Integrações do WhatsApp no Ecossistema RVM

*Este documento foi gerado a partir de uma varredura clínica e rigorosa em todo o código-fonte (arquivos `.ts`, `.tsx`, `.js`, `.yml`), abstraindo documentações antigas ou comentários e analisando pura e simplesmente o comportamento em execução (rotas de API, Invocations, Fetches).*

Todo envio de WhatsApp (seja texto, S-89, S-140 ou Notificações de Segurança) passa **obrigatoriamente** pela Edge Function `send-whatsapp`. A aplicação RVM atira nela através de 10 caminhos (Gatilhos) distintos, separados por três categorias de orquestração.

---

## 1. Gatilhos Automáticos (Baseados em Cron)
Estes gatilhos ocorrem sozinhos, guiados por relógios virtuais.

### 1.1 Lembretes Diários
*   **Onde no código:** `supabase/functions/cron-whatsapp-reminders/index.ts`
*   **Gatilho Origem:** Cronjob Externo batendo na URL via HTTP (`x-cron-secret`).
*   **Ação Tática:** Analisa e enfileira lembretes de D-9, D-7, D-2 e pings de 72h em uma fila de banco de dados (`whatsapp_queue`). Em seguida, avisa a API do GitHub para ligar o Motor Headless.

### 1.2 Status PDF Diário (Painel Gerencial)
*   **Onde no código:** `scripts/status-pdf-bot.ts`
*   **Gatilho Origem:** Cron do GitHub Actions (`.github/workflows/status-pdf-bot.yml`).
*   **Ação Tática:** Roda às 09h e 19h. Abre o Puppeteer invisível em `/?portal=status-pdf-print`, fotografa a tela e injeta via base64 no WhatsApp da liderança.

### 1.3 Central de Alertas Técnicos
*   **Onde no código:** `supabase/functions/cron-alert-notifications/index.ts`
*   **Gatilho Origem:** Cronjob Externo batendo na Edge Function.
*   **Ação Tática:** Varredura do banco atrás de anomalias/erros do sistema, notificando o administrador via WhatsApp.

---

## 2. Gatilhos Reativos (Event-Driven Webhooks)
Estes motores acionam em milissegundos reagindo a inputs do usuário real.

### 2.1 Feedback Interativo Imediato
*   **Onde no código:** `supabase/functions/zapi-smart-webhook/index.ts`
*   **Gatilho Origem:** Servidor Externo (Z-API/Evolution) disparando um webhook POST.
*   **Ação Tática:** Ao detectar que um irmão apertou um botão do Z-API (ex: ✅ Confirmar), manda uma requisição na mesma hora avisando: *"Obrigado! Sua designação foi confirmada."*

### 2.2 Consumidor Headless de Fila (Fila de Envios Cadenciados)
*   **Onde no código:** `scripts/whatsapp-queue-consumer.ts`
*   **Gatilho Origem:** Webhook Interno (`repository_dispatch` emitido pela Edge Function de Lembretes).
*   **Ação Tática:** O GitHub Actions entra num loop processando os envios enfileirados 1 a 1, com `sleep(3000)` entre eles, garantindo que o número não sofra bloqueio por Spam.

### 2.3 Curador de Substituições (Auto-Reassign Bot)
*   **Onde no código:** `src/services/replacementOrchestratorService.ts`
*   **Gatilho Origem:** Webhook Interno (`repository_dispatch: trigger-auto-reassign` emitido na recusa do usuário).
*   **Ação Tática:** Altera o dono da parte, sobe o Puppeteer, gera um novo S-89 dinâmico e atira no colo do Substituto. Notifica também a Liderança que uma troca foi feita de forma autônoma.

---

## 3. Gatilhos Manuais (Intervenções via Interface Front-end)
Aqui, o humano força a mão (cliques na interface hospedada na Vercel).

### 3.1 Autenticação de 2FA via WhatsApp
*   **Onde no código:** `src/context/AuthContext.tsx` e `whatsappAutoService.ts`
*   **Gatilho Origem:** Clique do usuário na tela de Login do Front-end.
*   **Ação Tática:** Aciona uma RPC e atira o Token de 6 dígitos no WhatsApp do publicador para liberação de sessão.

### 3.2 Sincronizador de Grupo Z-API (Onboarding)
*   **Onde no código:** `src/services/zapiGroupSyncService.ts`
*   **Gatilho Origem:** Clique do Administrador no painel (ZApiGroupSyncModal).
*   **Ação Tática:** A Edge Function atua passivamente. Ela varre os contatos dentro do grupo oficial do WhatsApp. O sistema então compara por Distância de Levenshtein os nomes e telefones com o banco RVM, identificando discrepâncias e efetuando Pré-Aprovação em massa do acesso 2FA (por estarem num grupo oficial).

### 3.3 Publicação em Lote S-140/S-89
*   **Onde no código:** `src/services/weekPublishService.ts` e `s140PackageService.ts`
*   **Gatilho Origem:** Clique do Admin em "Publicar Semana" (ou por cron em D-21).
*   **Ação Tática:** Roda por todo o leque de publicadores elegíveis da semana selecionada, gerando S-89 e botões via base64, além de pacotes de avisos públicos no Grupo.

### 3.4 Reenvios Individuais e Baixas na CS
*   **Onde no código:** `S89SelectionModal.tsx` e `CSClearanceModal.tsx`
*   **Gatilho Origem:** Cliques do Admin nos modais internos do sistema.
*   **Ação Tática:** Invocam a Edge Function bypassando a fila (fila expressa) para reenviar um S-89 a um irmão que perdeu, ou notificar os 3 Anciãos da Comissão de Serviço com URLs administrativas contendo os status e bloqueios dos publicadores da semana.

---

## Identificação Sistemática de Grupos (JID Oficial)
Em vez de depender do "Nome Visual" do grupo (ex: *Congregação Parque Jacaraípe*), o sistema blinda a comunicação utilizando o identificador criptográfico bruto interno do WhatsApp.

Seja via Z-API, Evolution API ou Baileys, o padrão detectado no Front-end (`whatsappAutoService.ts`, linha 109) e processado pela limpeza na Edge Function (`send-whatsapp`, linha 169) impõe a seguinte taxonomia restrita:
- **`@g.us`** (Group User): Sufixo anexado a um identificador de 18 dígitos, assinalando grupos autênticos (ex: `120363045612345678@g.us`).
- **`@broadcast` / `-group`**: Identificam Listas de Transmissão.
- Qualquer número limpo que entre contendo `@g.us` sofre recorte pela Edge Function para repassar à API Z-API estritamente a raíz numérica. Modificar o nome comercial do grupo não quebra o sistema.
