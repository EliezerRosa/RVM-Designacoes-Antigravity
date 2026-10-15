# Plano de Ajuste nos Botões Z-API de Lembretes (Manual / Robô)

> **Data**: 2026-10-15  
> **Responsável**: Eliezer Rosa  
> **Status**: 📋 Planejado e Analisado (NÃO implementado nesta etapa, sob instrução expressa)  
> **Arquivos Alvo Mapeados**:
> - `supabase/functions/cron-whatsapp-reminders/index.ts`
> - `src/services/zapiOrchestrator.ts`

---

## 1. Motivação e Invariantes do Usuário

O usuário estabeleceu 6 invariantes para a exibição de botões interativos nativos do WhatsApp via Z-API em mensagens de lembretes e S-89:

1. **Invariante 1**: Quando o destinatário ainda **NÃO CONFIRMOU** o aceite (`part.status === 'PROPOSTA'`).
2. **Invariante 2**: Neste caso (invariante 1), e **somente neste caso**, o botão "Confirmar" é exibido. (Se já confirmou, o botão NÃO deve ser exibido).
3. **Invariante 3**: O botão **"Confirmar" DEVE ser exibido sempre** quando sob a invariante 1.
4. **Invariante 4**: Se Z-API/Meta não permite 4 botões, no caso da invariante 1, **omitir "Ativar Notificações"** dos botões interativos rápidos (mantendo o link de contingência no rodapé do texto).
5. **Invariante 5**: No caso de 4 botões permitidos no futuro, sob invariantes 1–2, vale a invariante 3 imperativa (todos coexistiriam).
6. **Invariante 6**: Senão (como a Meta impõe limite estrito de $\le 3$ botões rápidos hoje), **vale a invariante 4 imperativa**.

---

## 2. Diagnóstico do Código Atual

1. **`cron-whatsapp-reminders/index.ts` (Robô)**:
   - Em `runRemindersCycle` (linhas 745–772), para os lembretes `LEMBRETE_D9`, `LEMBRETE_D7` e `LEMBRETE_D2`:
     - O array `buttonActions` recebia: `[ ❌ Não poderei ]`, `[ 📅 Ajustar Disponibilidade ]` e `[ 🔔 Ativar Notificações ]`.
     - **Problema**: O botão `[ ✅ Confirmar ]` **NUNCA** era incluído, mesmo para partes com status `PROPOSTA`.
   - Em `runContinuousReminderCycle` (`COBRANCA_72H`):
     - Mensagem enviada por reply de texto sem botões interativos no payload.

2. **`zapiOrchestrator.ts` (Manual e Reenvios)**:
   - Em `sendS89Direct` (linhas 650–698):
     - Montava `CONFIRMAR` + `RECUSAR` + `DISPONIBILIDADE` (3 botões).
     - Tentava injetar o 4º botão: `PUSH_ONBOARDING`.
     - **Problema**: A Meta rejeita mais de 3 botões rápidos em `/send-button-actions`, gerando erro HTTP 400 e forçando o fallback para lista ou texto puro.
     - Além disso, não verificava se a parte já havia sido confirmada para ocultar o botão "Confirmar".

---

## 3. Matriz de Decisão Arquitetural Planejada

| Cenário de Disparo | Status da Parte | Botões Rápidos Nativos WhatsApp (Máx. 3) | Botão Push Onboarding nos Botões |
| :--- | :--- | :--- | :--- |
| **Lembretes Robô (D-9, D-7, D-2) ou Cobrança 72h** | `PROPOSTA` (Não confirmou) | 1. `[ ✅ Confirmar ]`<br>2. `[ ❌ Não poderei ]`<br>3. `[ 📅 Ajustar Disponibilidade ]` | ❌ Omitido dos botões rápidos (fica no rodapé do texto) |
| **Lembretes Robô (D-7, D-2 de Proximidade)** | `DESIGNADA` (Já confirmou) | 1. `[ ❌ Não poderei ]`<br>2. `[ 📅 Ajustar Disponibilidade ]`<br>3. `[ 🔔 Ativar Notificações ]` *(se não tiver push ativo)* | ✅ Exibido no 3º slot (se elegível) |
| **Envio Manual S-89 / Reenvio** | `PROPOSTA` (Não confirmou) | 1. `[ ✅ Confirmar ]`<br>2. `[ ❌ Não Poderei ]`<br>3. `[ 📅 Disponibilidade ]` | ❌ Omitido dos botões (evita erro 400 da Meta) |
| **Envio Manual S-89 / Reenvio** | `DESIGNADA` (Já confirmou) | 1. `[ ❌ Não Poderei ]`<br>2. `[ 📅 Disponibilidade ]`<br>3. `[ 🔔 Ativar Notificações ]` *(se não tiver push)* | ✅ Exibido no 3º slot |

---

## 4. Impactos Prováveis Relatados

1. **Taxa de Confirmação**: Aumento sensível das confirmações com 1 toque (*one-tap confirmation*) logo no primeiro lembrete (D-9 ou 72h).
2. **Estabilidade Z-API**: 100% de eliminação dos erros HTTP 400 por excesso de botões na Meta, erradicando o fallback indesejado para listas em telas mobile/desktop.
3. **Clareza Teocrática**: Publicadores que já confirmaram não recebem botão "Confirmar" repetido, eliminando dúvidas se a confirmação anterior foi registrada.
4. **Webhook**: Zero impacto negativo. O webhook `zapi-smart-webhook` já suporta `CONFIRMAR:<partId>` plenamente e atualiza o banco com auditoria completa.
5. **Web Push Onboarding**: O convite de push permanece acessível via link de rodapé na primeira mensagem e passa a ser exibido nos botões rápidos assim que a designação for confirmada.
