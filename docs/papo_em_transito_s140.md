# Papo em Trânsito: Arquitetura de Despacho S-140

*Data do registro: 26 de Setembro de 2026*

Este documento consolida a nossa discussão arquitetural sobre como o **Pacote de Designações (S-140)** é orquestrado no sistema unificado. Ele documenta a mudança de um modelo baseado em cronograma (agendamento fixo) para um modelo 100% **Orientado a Eventos**.

## 1. Os Três Modos do S-140 (`s140PackageService.ts`)

A engine de geração e envio de PDF/Imagens possui 3 facetas:

*   **Modo 1 (Conceitual/Legado): Envio Regular de Segunda-feira (08:00 BRT)**
    *   *Realidade:* O conceito de "cron de segunda-feira" está morto no código. A lógica pesada do Modo 1 (comparação de snapshots de banco, cálculo de novas semanas, montagem do PDF) foi envelopada e agora serve puramente como o "motor interno" que o robô de D-21 usa. Não há cronograma fixo independente batendo aqui.
*   **Modo 2 (Emergência/Cirúrgico): Ajuste na Semana em Curso**
    *   *Como age:* Não manda PDF pesado. Corta, renderiza e envia apenas Imagens PNG. Possui texto de alerta vermelho (`⚠️ Aviso de Ajuste de Última Hora`).
    *   *Alvo extra:* Além do Grupo da Liderança e do Quadro de Anúncios, localiza e notifica individualmente o **Presidente da Reunião** daquela semana.
*   **Modo 3 (Sob Demanda / Fechamento de Lote): Disparo Incidental**
    *   *Como age:* Executa a engine do Modo 1 forçando o envio do PDF unificado com meses de programação (changelog + semanas ativas).

## 2. Atores no Gatilho (Quem dispara o S-140)

O Webhook (onde o usuário aperta ❌ "Não Poderei") **NUNCA** dispara o S-140. Ele apenas mancha a parte com a flag `needs_reassignment=true`. Existem apenas 3 atores com o dedo no gatilho para gerar documentos oficiais:

1.  **O Administrador (Humano):** Clicando no botão despachar (Modo 3) OU ao finalizar e aprovar uma troca de emergência no Painel de Troca (dispara o gancho do Modo 2 silenciosamente).
2.  **Robô Temporal D-21 (Agente Agendado):** Roda via GitHub Actions (`headless-bot.yml`) todo dia às 09:30 BRT. Quando publica uma semana no D-21, aciona o "Acionamento Automático do Fechamento de Lote S-140" (Modo 3).
3.  **Motor de Auto-Healing (Agente Reativo):** Quando a IA de realocação arruma uma parte pendente sozinha (sem intervenção humana), ela consolida o banco e dispara o Modo 2 (emergência) para avisar os envolvidos e atualizar o Quadro.

## 3. Pendências Arquiteturais (Backlog)

*   [ ] **Log Canônico para o S-140:** Consolidar e auditar internamente os logs canônicos na geração e envio dos pacotes (como destacado no `AutomationWorker.tsx`: `[Plugin S-140] PDFs roteados com sucesso (Logs canônicos gerados internamente).`), para garantir observabilidade caso a Z-API falhe em pacotes em lote.
*   [ ] **Diagrama Visual:** Refletir a diferença entre Webhook de Rejeição vs Atores de Consolidação (Humano/Bot D21/Auto-Healing) no Excalidraw, se necessário no futuro.
