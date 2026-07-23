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

## 5. Arquitetura Definitiva (Plano Atualizado Jun/2026)
Uma expansão completa do motor foi projetada (com implementação pendente) para suportar o fluxo definitivo de publicações e recusas:

### 5.1 A Carga Oficial (Auto-Publicação D-15)
O envio de mensagens passa a ser governado pelo tempo.
- **Liberação vs Publicação:** O painel "Publicar Semana" agora deve apenas "Liberar" a semana.
- **O Despachante:** O Cron, ao rodar diariamente, verifica semanas liberadas. Quando a distância da semana for igual ou menor que 15 dias (D-15), ele dispara a "Mensagem Matriz" (S-89) com o Link Mágico de Confirmação e marca a semana como oficialmente publicada.
- **Relatório de Carga:** Um aviso de lote concluído é enviado para o SRVM.

### 5.2 O Trabalhador Autônomo (Lembretes e Cobranças)
- **Bloqueio Mestre:** Lembretes (D-7, D-2) agora só atuam em semanas oficialmente processadas pelo D-15. (O aviso de D-1 foi desativado a pedido da liderança).
- **Cobrança D-9:** Uma cobrança pró-ativa para quem ignorou o S-89 original, focada em arrancar um "Sim" ou "Não".
- **Regra de Aquiescência:** Partes de Anciãos e Servos (com status PROPOSTA) são tratadas como aceitas tacitamente; as demais não recebem lembretes sem confirmação explícita.
- **Importante (Bug Fix):** O Cron consulta o dia da reunião semanal da tabela correta `app_settings` (onde o modal de fato salva a key `s89_meeting_day_by_week`), e não `settings`, garantindo cálculos temporais precisos (ex: sexta-feira em vez do fallback para quinta). A mensagem do Cron foi atualizada para incluir textualmente o dia da reunião (ex: "reunião de sexta-feira, 20 de junho") prevenindo ambiguidades.

### 5.3 O Sistema de Recusa Rápida (Portal de Substituição)
- **Desacoplamento:** O fluxo principal da UI legada não é alterado.
- **Portal Mobile-first:** A recusa via Z-API encaminhará o alerta não mais para a rota admin padrão, mas para a rota `/?portal=replace&partId=...`.
- **Top 3 ao Vivo:** Este portal renderizará a parte e 3 sugestões de substitutos calculadas on-the-fly pelo `unifiedRotationService`, permitindo que o SRVM e seus ajudantes aprovem a troca com um clique pelo celular.
- **Autenticação Direcionada:** O painel exige login do Google apenas para verificar se o e-mail logado possui a `funcao` de Superintendente RVM ou Ajudante RVM no banco de dados, sem exigir flag genérica de "admin" na tabela `profiles`.

## 6. Sincronização por Grupo & Reconciliação 2FA em Lote (Julho/2026)
- **Modal `ZApiGroupSyncModal.tsx`**: Interface administrativa para busca dinâmica de contatos em qualquer grupo Z-API (ex: "Congregação Parque Jacaraípe").
- **Matching por Telefone e Nome**: Algoritmo de reconciliação no `zapiGroupSyncService.ts` que relaciona contatos do grupo WhatsApp com publicadores RVM e perfis cadastrados.
- **Liberação 2FA em Lote**: Permite atualizar telefones e validar o status `whatsapp_verified = true` em massa com 1 clique.
- **Persistência de Credenciais em `app_settings`**: Suporte para salvar e recuperar `zapi_instance_id`, `zapi_instance_token` e `zapi_client_token` diretamente no banco Supabase com marcação de `updated_at`.

## Como Testar ou Manter
1. Para debugar mensagens, verifique a tabela `zapi_dispatch_log` no Supabase. Lá consta o status e telefone.
2. A kill-switch `zapi_automation_active` desativa todos os envios autônomos sem impactar funcionalidades vitais da RVM.
3. Edge Function Logs: Podem ser acompanhados no painel do Supabase -> Edge Functions -> `cron-whatsapp-reminders`.

