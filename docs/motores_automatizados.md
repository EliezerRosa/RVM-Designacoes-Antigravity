# Arquitetura de Motores Automatizados (Crons & Webhooks)

Este documento sumariza os 4 motores automatizados que orquestram o backend da aplicação, operando por meio de execuções agendadas (crons) e disparos reativos (event-driven).

## 1. Motor de Lembretes Diários Z-API (Edge Function)
*   **Localização:** `supabase/functions/cron-whatsapp-reminders/index.ts`
*   **Gatilho:** Cronjob externo (ex: cron-job.org) batendo na Edge Function diariamente às 09:00 BRT.
*   **O que faz:**
    *   **Limpeza (Auto-Complete):** Inicia marcando partes de reuniões passadas automaticamente como `CONCLUIDA`.
    *   **Filtro Inteligente:** Descarta envios para "Partes de Ruído" (Cânticos e orações) para não causar spam.
    *   **Aquiescência Tácita:** Avalia cargos institucionais (Anciãos e Servos recebem a notificação, mas não são forçados a confirmar a parte).
    *   **Ciclo de Pendências (72H):** Cobra continuamente (pings) os irmãos que receberam a notificação mas ficaram mudos, exigindo uma resposta sob pena de perder a parte.
    *   **O Ciclo Diário de Lembretes (Baseado em D-9, D-7 e D-2):**
        *   **LEMBRETE_D9:** Disparado quando faltam entre 9 e 10 dias. O texto indica *"faltam cerca de 9 dias"*.
        *   **LEMBRETE_D7 (Parceiro de Ensaio):** Disparado quando faltam entre 6 e 8 dias. O texto indica *"falta 1 semana"*. Neste lembrete específico, o código faz um cruzamento (`partnerInfo`) unindo o Titular ao Ajudante (e vice-versa), enviando o número de telefone um do outro para facilitar o agendamento de ensaios.
        *   **LEMBRETE_D2:** Disparado quando faltam entre 1 e 3 dias. O texto indica *"faltam apenas alguns dias"*.
        *   *(Aviso: O código não envia lembrete de D-1).*
    *   **Relatórios da Liderança (Morning Run):** Se o script for executado no período da manhã (08h às 09h), ele roda rotinas de inspeção pesadas, como "Verificação de Ghosting", "Alertas de Buracos (Draft/Refusals)", Auto-reparos do Z-API e compila relatórios Gerenciais/Mensais que envia diretamente ao SRVM.

## 2. Robô de Status PDF (Status Board Gerencial)
*   **Localização:** `.github/workflows/status-pdf-bot.yml` e `scripts/status-pdf-bot.ts`
*   **Gatilho:** Cron do GitHub Actions às 09:00 e 19:00 BRT (12:00 e 22:00 UTC), além de disparos por evento via `repository_dispatch: types: [trigger-status-pdf]`.
*   **O que faz:**
    *   Consulta a tabela `status_pdf_queue` (a fila de partes que tiveram alteração de status).
    *   Aplica um **Debounce de 2 minutos** para evitar múltiplos disparos se o administrador estiver fazendo um lote de alterações em sequência.
    *   Inicia um navegador invisível (Puppeteer), acessa a rota silenciosa da aplicação React (`/?portal=status-pdf-print`), gera um PDF espelhando a tela, injeta no Z-API e despacha exclusivamente para o time de operações (Superintendentes e Ajudantes Lembretes).
    *   Registra o disparo no `zapi_dispatch_log` como `STATUS_BOARD`.

## 3. Motor D-21 S-140 (Automation Headless S-140 Modo 1)
*   **Localização:** `.github/workflows/headless-bot.yml` e `scripts/headless-bot.js`
*   **Gatilho:** Cron Diário do GitHub Actions às 09:30 BRT (12:30 UTC).
*   **O que faz:**
    *   Sobe um Puppeteer Headless e acessa a URL secreta do Worker (`WORKER_URL`).
    *   Engatilha o componente front-end `AutomationWorker.tsx`, que procura ativamente pela semana "D-21" ainda não publicada.
    *   Quando encontra a semana correta, resolve e trava os nomes elegíveis, consolida e fecha o S-140 (Modo 1), distribuindo a grade oficial para a congregação (Grupos e Quadro).

## 4. O Curador de Substituições (Auto-Reassign Bot)
*   **Localização:** `.github/workflows/headless-auto-reassign.yml` e `scripts/auto-reassign-bot.ts`
*   **Gatilho:** Puramente reativo. Acionado por webhook (`repository_dispatch: types: [trigger-auto-reassign]`).
*   **O que faz:**
    *   O gatilho ocorre milissegundos após um publicador clicar no botão nativo ❌ *"Não Poderei"* no WhatsApp. O webhook mancha a parte afetada com a flag `needs_reassignment=true` e engatilha este robô informando o `part_id`.
    *   O script inicia o Puppeteer passando o ID da parte, o qual executa o motor algorítmico interno de rodízio (`getRankedEligiblePublishers`).
    *   Identifica o próximo irmão qualificado, disponível e com menos choque de agenda, designando a parte para ele de forma autônoma (alterando o status da nova parte para "PROPOSTA"). Essa alteração de status eventualmente retroalimenta o Robô de Status PDF.
