# Z-API Automation & Identity Resolution

Este documento descreve a infraestrutura estabelecida em Junho de 2026 para automação de comunicações via WhatsApp (Z-API) e resolução de identidade (Vínculos de Perfis).

## 1. Segurança de Identidade (Vínculos 1:1)
Para evitar que múltiplos emails fossem vinculados ao mesmo Publicador (o que gerava conflitos de ID e permissões duplicadas), implementamos um bloqueio duro a nível de banco de dados:
- **`idx_profiles_publisher_id`**: Um `UNIQUE INDEX` na tabela `profiles` sobre a coluna `publisher_id`. 
Isso significa que o banco de dados rejeitará qualquer tentativa de vincular um `publisher_id` que já esteja associado a outro `profile`.

### 1.1 Resolução em Lote de Vínculos Pendentes
Quando novos usuários (emails) acessam o sistema, eles podem solicitar vínculo a um nome de publicador. O sistema agora possui um modal de resolução inteligente no componente `AgentModalHost`, acessível pelo botão piscante na aba "Agente IA".
Isso permite ao administrador aceitar, editar ou rejeitar vínculos pendentes e propostos (match por nome) em lote.

## 2. Orquestração Z-API
Toda a automação de mensagens de WhatsApp foi isolada em um serviço central (`src/services/zapiOrchestrator.ts`) que dita o fluxo e consome a camada `whatsappAutoService`.

### 2.1 Componentes da Orquestração
- **`zapiOrchestrator.ts`**: Verifica se a automação está ativa, checa idempotência e dispara recibos (`dispatchS89Receipt`) ou alertas (`dispatchRefusalAlert`).
- **`zapi_dispatch_log`**: Tabela no banco de dados que registra envios de WhatsApp bem-sucedidos por `part_id` e `dispatch_type`, prevenindo envios duplicados caso o publicador clique várias vezes.
- **Settings (Z-API)**: A tabela `settings` armazena `zapi_automation_active` (boolean) e `zapi_group_id` (para redirecionar alertas de recusa para um grupo WhatsApp específico, em vez do número individual do superintendente).

### 2.2 Portal de Confirmação (DesignationConfirmationPortal)
O fluxo atualizado do portal público não apenas salva a resposta no banco, mas orquestra o envio de forma assíncrona:
- **Aceite (✅)**: O portal invoca o orquestrador para enviar um Recibo (S89 em texto ou imagem) informando que a confirmação foi recebida e agradecendo.
- **Recusa (❌)**: O portal invoca o orquestrador para disparar um alerta imediato com o motivo da recusa para a superintendência (ou o grupo configurado).

### 2.3 Edge Function: cron-whatsapp-reminders
Foi implantada a função Serverless `cron-whatsapp-reminders` no Supabase, responsável pelos lembretes pró-ativos.
- Ela deve ser acionada via cron-job (e.g. pg_cron ou GitHub Actions) diariamente.
- Procura partes com status `DESIGNADA`.
- Calcula os dias faltantes baseando-se na data exata de reunião (`s89_meeting_day_by_week` ou padrão quinta-feira).
- Dispara lembretes de D-7, D-2 e D-1 (Amanhã).
- Após enviar, registra no `zapi_dispatch_log` para não re-enviar.

## 3. Carga Inicial: Magic Link Onboarding (Novo - Fase 2)
Para zerar a barreira de entrada dos publicadores, foi arquitetada a estratégia "Carga Inicial Z-API".
Em vez de depender do protocolo manual de envio de código de 6 dígitos via 2FA para verificação de celular, o sistema utiliza a automação Z-API para invitar os publicadores de forma preemptiva.

### 3.1 Infraestrutura de Convites
- **Tabela `onboarding_tokens`**: Registra UUIDs aleatórios com 14 dias de validade, associados a um `publisher_id` e a um `phone`.
- **Portal VIP (`InvitePortal.tsx`)**: Uma rota de destino oculta `/?portal=invite&token=...`.
- **Auto-Vínculo (Security Definer)**: A RPC `consume_onboarding_token` tem super-poderes no PostgreSQL para, após o usuário logar no Google pelo Portal VIP, gravar `whatsapp_verified = true` no `profiles` atrelando o número de celular em que ele recebeu o convite.

### 3.2 Graduação de Disparos e Interceptação no S-89
A emissão dos convites acontece de forma progressiva e "sem sustos":
1. **Modal de Disparo Gradual**: O painel do Admin não faz envios massivos cegos, ele permite a seleção visual via checkboxes dos publicadores elegíveis (com cel, mas sem 2FA), permitindo dosar envios (ex: lotes de 10) para evitar banimento pelo Z-API.
2. **Injeção Inteligente no S-89**: A maior via orgânica de convites é através das designações. Durante o "Publicar Semana" (ou envio isolado do S-89 manual na aba agente), se o publicador alvo precisa de um Token VIP, a própria string do S-89 é modificada para carregar o link `portal=invite` em vez do tradicional `portal=confirm`. Assim, ao aceitar ou visualizar a parte mensal, o publicador é instantaneamente "onboarded" de surpresa, eliminando o degrau do 2FA para ele.

## 4. UI de Configuração
Na aba de **Admin Dashboard**, foi adicionada a sub-guia "Config. Z-API", que permite ligar/desligar a automação global de envios em background, configurar o Z-API Group ID e agora, também abriga o botão **🚀 Carga Inicial** para acionar o modal de disparos graduais de Onboarding.

## Como Testar ou Manter
1. Para debugar mensagens, verifique a tabela `zapi_dispatch_log` no Supabase. Lá consta o status e telefone.
2. A kill-switch `zapi_automation_active` desativa todos os envios autônomos sem impactar funcionalidades vitais da RVM.
3. Edge Function Logs: Podem ser acompanhados no painel do Supabase -> Edge Functions -> `cron-whatsapp-reminders`.
