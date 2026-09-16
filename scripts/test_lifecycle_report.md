# 📋 Relatório de Teste Integrado — Ciclo de Vida da Designação

**Data de execução:** 2026-09-12T22:14:39.458Z
**Parte testada:** Presidente (semana 2026-10-12)
**Publicador:** Eliezer Rosa (id=3, tel=27992035302)
**CC:** Fictício Teste (tel=27981470002)

---

## ETAPA 1: Publicação S-89

### Snapshots do Banco

**ANTES da Etapa 1 (Publicação S-89)**
- Part status: `PROPOSTA`
- Dispatches: 0
- Tokens: 0
- Interactions: 10

**DEPOIS da Etapa 1 (Publicação S-89)**
- Part status: `PROPOSTA`
- Dispatches: 1
- Tokens: 1
- Interactions: 10

### Mensagens Enviadas

**→ 27992035302**  
- Success: `true`
- Message ID: `3EB09A7A3A79D547E1D899`
- Provider: `z-api`

```
Boa noite, Irmão Eliezer Rosa!

Você recebeu uma designação para a reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

Por favor, confirme se poderá participar clicando no link abaixo:
👉 https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=943824ae-ad53-4a1b-8bdb-3020d569e98f

Se não puder, use o mesmo link para nos avisar. Contamos com você! 🙏
```

**→ 27981470002** (Cópia CC) 
- Success: `true`
- Message ID: `3EB0FC40871FEADBD4A6F6`
- Provider: `z-api`

```
[TESTE CC - PUBLICAÇÃO S-89]
Boa noite, Irmão Eliezer Rosa!

Você recebeu uma designação para a reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

Por favor, confirme se poderá participar clicando no link abaixo:
👉 https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=943824ae-ad53-4a1b-8bdb-3020d569e98f

Se não puder, use o mesmo link para nos avisar. Contamos com você! 🙏
```

### Respostas Z-API (raw)

```json
{
  "success": true,
  "messageId": "3EB09A7A3A79D547E1D899",
  "provider": "z-api"
}
```

---

## ETAPA 2: Simulação de 72h sem resposta

---

## ETAPA 3: Cobrança 72h (Ciclo Contínuo)

### Mensagens Enviadas

**→ 27992035302**  
- Success: `true`
- Message ID: `3EB04F5DE0857582C70F6D`
- Provider: `z-api`
- Cenário: `REPLY_CITACAO`

```
Olá, Irmão Eliezer Rosa! Este é um lembrete automático. Ainda não recebemos sua confirmação para a designação acima. Por favor, veja a msg referida aqui e retorne para nos avisar!
```

**Options/Botões:**
```json
{
  "referenceMessageId": "3EB09A7A3A79D547E1D899"
}
```

**→ 27981470002** (CC) 
- Success: `true`
- Message ID: `3EB02E77D0059727286BF5`
- Provider: `z-api`

```
[TESTE CC - COBRANÇA 72H - cenário: REPLY]
Olá, Irmão Eliezer Rosa! Este é um lembrete automático. Ainda não recebemos sua confirmação para a designação acima. Por favor, veja a msg referida aqui e retorne para nos avisar!
```

### Respostas Z-API (raw)

```json
{
  "success": true,
  "messageId": "3EB04F5DE0857582C70F6D",
  "provider": "z-api"
}
```

---

## ETAPA 4: Aceite do Publicador

### Mensagens Enviadas

**→ 27981470002**  
- Success: `true`
- Message ID: `3EB0450F1B8A13E7199822`
- Provider: `z-api`

```
✅ *[TESTE] Confirmação recebida!*

Irmão Eliezer Rosa confirmou a designação de *Presidente* para a reunião de 15 de outubro.

Status: PROPOSTA → DESIGNADA

A partir de agora:
• Sai do ciclo de cobranças 72h
• Entra nos lembretes D-9, D-7, D-2 (com botões)
```

---

## ETAPA 5: Lembretes D-9, D-7, D-2

### Mensagens Enviadas

**→ 27992035302**  [D-9]
- Success: `true`
- Message ID: `3EB066FA9D4D0986D9A613`
- Provider: `z-api`

```
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam 9 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
```

**Options/Botões:**
```json
{
  "action": "send-button-actions",
  "buttonActions": [
    {
      "id": "btn_reject_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "REPLY",
      "label": "Não poderei"
    },
    {
      "id": "btn_avail_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "URL",
      "label": "Ajustar Disponibilidade",
      "url": "https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=4a9baff5-9ef8-4495-b222-c12201e62aaf"
    }
  ]
}
```

**→ 27981470002** (CC) [D-9]
- Success: `true`
- Message ID: `3EB02B73CE41E41B190934`
- Provider: `z-api`

```
[TESTE CC - D-9]
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam 9 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
```

**→ 27992035302**  [D-7]
- Success: `true`
- Message ID: `3EB00523622F1D40965A40`
- Provider: `z-api`

```
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam apenas 7 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
```

**Options/Botões:**
```json
{
  "action": "send-button-actions",
  "buttonActions": [
    {
      "id": "btn_reject_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "REPLY",
      "label": "Não poderei"
    },
    {
      "id": "btn_avail_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "URL",
      "label": "Ajustar Disponibilidade",
      "url": "https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=4a9baff5-9ef8-4495-b222-c12201e62aaf"
    }
  ]
}
```

**→ 27981470002** (CC) [D-7]
- Success: `true`
- Message ID: `3EB0C5E25AEA9F554BCD70`
- Provider: `z-api`

```
[TESTE CC - D-7]
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam apenas 7 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
```

**→ 27992035302**  [D-2]
- Success: `true`
- Message ID: `3EB0AD425AF5B608258D7D`
- Provider: `z-api`

```
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam 2 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
```

**Options/Botões:**
```json
{
  "action": "send-button-actions",
  "buttonActions": [
    {
      "id": "btn_reject_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "REPLY",
      "label": "Não poderei"
    },
    {
      "id": "btn_avail_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "URL",
      "label": "Ajustar Disponibilidade",
      "url": "https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=4a9baff5-9ef8-4495-b222-c12201e62aaf"
    }
  ]
}
```

**→ 27981470002** (CC) [D-2]
- Success: `true`
- Message ID: `3EB0E7D304D2BA84E82E72`
- Provider: `z-api`

```
[TESTE CC - D-2]
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam 2 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
```

### Respostas Z-API (raw)

```json
{
  "lembrete": "D-9",
  "resposta": {
    "success": true,
    "messageId": "3EB066FA9D4D0986D9A613",
    "provider": "z-api"
  }
}
```

```json
{
  "lembrete": "D-7",
  "resposta": {
    "success": true,
    "messageId": "3EB00523622F1D40965A40",
    "provider": "z-api"
  }
}
```

```json
{
  "lembrete": "D-2",
  "resposta": {
    "success": true,
    "messageId": "3EB0AD425AF5B608258D7D",
    "provider": "z-api"
  }
}
```

---

## ETAPA 6: Cleanup

### Snapshots do Banco

**ANTES da Etapa 6 (Cleanup)**
- Part status: `DESIGNADA`
- Dispatches: 5
- Tokens: 2
- Interactions: 10

**DEPOIS da Etapa 6 (Cleanup)**
- Part status: `PROPOSTA`
- Dispatches: 0
- Tokens: 0
- Interactions: 10

---

## Log Cronológico Completo

```
[2026-09-12T22:14:05.065Z] ╔══════════════════════════════════════════════════════════╗
[2026-09-12T22:14:05.066Z] ║  TESTE INTEGRADO: Ciclo de Vida Completo               ║
[2026-09-12T22:14:05.066Z] ║  Parte: Presidente — Semana 2026-10-12                 ║
[2026-09-12T22:14:05.066Z] ║  Publicador: Eliezer Rosa (27992035302)                ║
[2026-09-12T22:14:05.066Z] ║  CC: Fictício Teste (27981470002)                      ║
[2026-09-12T22:14:05.066Z] ╚══════════════════════════════════════════════════════════╝
[2026-09-12T22:14:05.066Z] 
[2026-09-12T22:14:05.066Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:05.066Z] ETAPA 1: PUBLICAÇÃO S-89 — Envio inicial da designação
[2026-09-12T22:14:05.066Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:06.744Z] 📸 Snapshot "ANTES da Etapa 1 (Publicação S-89)": part.status=PROPOSTA, dispatches=0, tokens=0, interactions=10
[2026-09-12T22:14:07.242Z] ✅ Token criado: 943824ae-ad53-4a1b-8bdb-3020d569e98f (expira: 2026-10-03T22:14:07.433002+00:00)
[2026-09-12T22:14:07.242Z] 📤 Enviando S-89 para 27992035302...
[2026-09-12T22:14:07.242Z] 📝 Conteúdo completo da mensagem:
---MSG-START---
Boa noite, Irmão Eliezer Rosa!

Você recebeu uma designação para a reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

Por favor, confirme se poderá participar clicando no link abaixo:
👉 https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=943824ae-ad53-4a1b-8bdb-3020d569e98f

Se não puder, use o mesmo link para nos avisar. Contamos com você! 🙏
---MSG-END---
[2026-09-12T22:14:07.616Z] 📬 Resposta: HTTP=200 success=true messageId=3EB09A7A3A79D547E1D899 provider=z-api
[2026-09-12T22:14:07.616Z] 📬 Resposta bruta completa: {"success":true,"messageId":"3EB09A7A3A79D547E1D899","provider":"z-api"}
[2026-09-12T22:14:08.503Z] 📋 Dispatch log gravado: {"id":"a442cb10-cae1-4c32-abd8-c4b05e0c4980","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"PUBLICACAO_S89","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-12T22:14:08.726134+00:00","message_id":"3EB09A7A3A79D547E1D899"}
[2026-09-12T22:14:08.503Z] 📤 Enviando CC para 27981470002...
[2026-09-12T22:14:08.655Z] 📬 CC Resposta: success=true messageId=3EB0FC40871FEADBD4A6F6
[2026-09-12T22:14:09.255Z] 📸 Snapshot "DEPOIS da Etapa 1 (Publicação S-89)": part.status=PROPOSTA, dispatches=1, tokens=1, interactions=10
[2026-09-12T22:14:12.258Z] 
[2026-09-12T22:14:12.258Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:12.258Z] ETAPA 2: SIMULAÇÃO DE 72H SEM RESPOSTA
[2026-09-12T22:14:12.258Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:12.746Z] 📸 Snapshot "ANTES da Etapa 2 (Simulação 72h)": part.status=PROPOSTA, dispatches=1, tokens=1, interactions=10
[2026-09-12T22:14:12.746Z] ⏰ Ajustando dispatched_at do S-89 para 2026-09-08T22:14:12.746Z (4 dias atrás)...
[2026-09-12T22:14:13.535Z] ✅ Registro atualizado: [{"id":"a442cb10-cae1-4c32-abd8-c4b05e0c4980","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"PUBLICACAO_S89","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-08T22:14:12.746+00:00","message_id":"3EB09A7A3A79D547E1D899"}]
[2026-09-12T22:14:13.535Z] 📌 Status da parte permanece PROPOSTA (sem resposta do publicador).
[2026-09-12T22:14:13.535Z] 📌 Na próxima execução do CRON, a parte será detectada como pendente >72h.
[2026-09-12T22:14:13.862Z] 📸 Snapshot "DEPOIS da Etapa 2 (Simulação 72h)": part.status=PROPOSTA, dispatches=1, tokens=1, interactions=10
[2026-09-12T22:14:14.865Z] 
[2026-09-12T22:14:14.865Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:14.865Z] ETAPA 3: COBRANÇA 72H — Ciclo contínuo de pendências
[2026-09-12T22:14:14.865Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:15.511Z] 📸 Snapshot "ANTES da Etapa 3 (Cobrança 72h)": part.status=PROPOSTA, dispatches=1, tokens=1, interactions=10
[2026-09-12T22:14:15.737Z] 🔍 Último dispatch encontrado: {"id":"a442cb10-cae1-4c32-abd8-c4b05e0c4980","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"PUBLICACAO_S89","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-08T22:14:12.746+00:00","message_id":"3EB09A7A3A79D547E1D899"}
[2026-09-12T22:14:15.738Z] 🔍 Tem message_id? SIM → Reply/Citação
[2026-09-12T22:14:15.738Z] 📎 Usando referenceMessageId: 3EB09A7A3A79D547E1D899
[2026-09-12T22:14:15.738Z] 📤 Enviando cobrança 72h para 27992035302...
[2026-09-12T22:14:15.738Z] 📝 Conteúdo completo:
---MSG-START---
Olá, Irmão Eliezer Rosa! Este é um lembrete automático. Ainda não recebemos sua confirmação para a designação acima. Por favor, veja a msg referida aqui e retorne para nos avisar!
---MSG-END---
[2026-09-12T22:14:15.738Z] 📝 Options: {"referenceMessageId":"3EB09A7A3A79D547E1D899"}
[2026-09-12T22:14:15.904Z] 📬 Resposta: HTTP=200 success=true messageId=3EB04F5DE0857582C70F6D provider=z-api
[2026-09-12T22:14:15.904Z] 📬 Resposta bruta completa: {"success":true,"messageId":"3EB04F5DE0857582C70F6D","provider":"z-api"}
[2026-09-12T22:14:16.285Z] 📋 Dispatch log gravado: {"id":"6a45838c-b8e0-4dd5-a889-a1f2ea5e8f8a","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"COBRANCA_72H","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-12T22:14:16.495997+00:00","message_id":"3EB04F5DE0857582C70F6D"}
[2026-09-12T22:14:16.783Z] 📸 Snapshot "DEPOIS da Etapa 3 (Cobrança 72h)": part.status=PROPOSTA, dispatches=2, tokens=1, interactions=10
[2026-09-12T22:14:19.786Z] 
[2026-09-12T22:14:19.787Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:19.787Z] ETAPA 4: SIMULAÇÃO DE ACEITE — Publicador confirma
[2026-09-12T22:14:19.787Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:20.070Z] 📸 Snapshot "ANTES da Etapa 4 (Aceite)": part.status=PROPOSTA, dispatches=2, tokens=1, interactions=10
[2026-09-12T22:14:20.588Z] ✅ Status alterado: [{"id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","status":"DESIGNADA","status_changed_at":"2026-09-12T22:14:20.07+00:00","updated_at":"2026-09-12T22:14:20.07+00:00"}]
[2026-09-12T22:14:20.750Z] 📤 Notificação de aceite enviada para CC: success=true
[2026-09-12T22:14:21.414Z] 📸 Snapshot "DEPOIS da Etapa 4 (Aceite)": part.status=DESIGNADA, dispatches=2, tokens=1, interactions=10
[2026-09-12T22:14:23.418Z] 
[2026-09-12T22:14:23.418Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:23.418Z] ETAPA 5: LEMBRETES D-9, D-7, D-2 (com botões de ação)
[2026-09-12T22:14:23.418Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:23.676Z] 📸 Snapshot "ANTES da Etapa 5 (Lembretes)": part.status=DESIGNADA, dispatches=2, tokens=1, interactions=10
[2026-09-12T22:14:23.954Z] 🔑 Token para botões: 4a9baff5-9ef8-4495-b222-c12201e62aaf (expira: 2026-10-03T22:14:24.1967+00:00)
[2026-09-12T22:14:23.954Z] 
── D-9: Enviando lembrete ──
[2026-09-12T22:14:23.955Z] 📝 Conteúdo completo:
---MSG-START---
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam 9 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
---MSG-END---
[2026-09-12T22:14:23.955Z] 📝 Options (botões): {
  "action": "send-button-actions",
  "buttonActions": [
    {
      "id": "btn_reject_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "REPLY",
      "label": "Não poderei"
    },
    {
      "id": "btn_avail_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "URL",
      "label": "Ajustar Disponibilidade",
      "url": "https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=4a9baff5-9ef8-4495-b222-c12201e62aaf"
    }
  ]
}
[2026-09-12T22:14:23.955Z] 📤 Enviando para 27992035302...
[2026-09-12T22:14:24.114Z] 📬 Resposta: HTTP=200 success=true messageId=3EB066FA9D4D0986D9A613 provider=z-api
[2026-09-12T22:14:24.114Z] 📬 Resposta bruta: {"success":true,"messageId":"3EB066FA9D4D0986D9A613","provider":"z-api"}
[2026-09-12T22:14:24.343Z] 📋 Dispatch: {"id":"c91a7c79-a19e-47f6-b398-8d2448f9bf62","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"LEMBRETE_D9","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-12T22:14:24.59497+00:00","message_id":"3EB066FA9D4D0986D9A613"}
[2026-09-12T22:14:28.486Z] 
── D-7: Enviando lembrete ──
[2026-09-12T22:14:28.487Z] 📝 Conteúdo completo:
---MSG-START---
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam apenas 7 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
---MSG-END---
[2026-09-12T22:14:28.487Z] 📝 Options (botões): {
  "action": "send-button-actions",
  "buttonActions": [
    {
      "id": "btn_reject_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "REPLY",
      "label": "Não poderei"
    },
    {
      "id": "btn_avail_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "URL",
      "label": "Ajustar Disponibilidade",
      "url": "https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=4a9baff5-9ef8-4495-b222-c12201e62aaf"
    }
  ]
}
[2026-09-12T22:14:28.487Z] 📤 Enviando para 27992035302...
[2026-09-12T22:14:28.696Z] 📬 Resposta: HTTP=200 success=true messageId=3EB00523622F1D40965A40 provider=z-api
[2026-09-12T22:14:28.696Z] 📬 Resposta bruta: {"success":true,"messageId":"3EB00523622F1D40965A40","provider":"z-api"}
[2026-09-12T22:14:28.927Z] 📋 Dispatch: {"id":"57ffd625-394e-47b7-a656-83c0e296ce7c","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"LEMBRETE_D7","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-12T22:14:29.181663+00:00","message_id":"3EB00523622F1D40965A40"}
[2026-09-12T22:14:33.095Z] 
── D-2: Enviando lembrete ──
[2026-09-12T22:14:33.095Z] 📝 Conteúdo completo:
---MSG-START---
Boa noite, Irmão Eliezer Rosa!
Lembrando que faltam 2 dias para sua parte na reunião de *quinta-feira, 15 de outubro*:

📖 *Presidente*

🎙️ Revise o programa da semana para conduzir a reunião com fluidez.

Por favor, garanta que seu preparo esteja em dia. ✨
---MSG-END---
[2026-09-12T22:14:33.096Z] 📝 Options (botões): {
  "action": "send-button-actions",
  "buttonActions": [
    {
      "id": "btn_reject_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "REPLY",
      "label": "Não poderei"
    },
    {
      "id": "btn_avail_1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae",
      "type": "URL",
      "label": "Ajustar Disponibilidade",
      "url": "https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/?portal=confirm&partId=1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae&publisherId=3&token=4a9baff5-9ef8-4495-b222-c12201e62aaf"
    }
  ]
}
[2026-09-12T22:14:33.096Z] 📤 Enviando para 27992035302...
[2026-09-12T22:14:33.307Z] 📬 Resposta: HTTP=200 success=true messageId=3EB0AD425AF5B608258D7D provider=z-api
[2026-09-12T22:14:33.307Z] 📬 Resposta bruta: {"success":true,"messageId":"3EB0AD425AF5B608258D7D","provider":"z-api"}
[2026-09-12T22:14:33.551Z] 📋 Dispatch: {"id":"65b64d7c-143e-43df-aa54-8058a6859f19","part_id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","dispatch_type":"LEMBRETE_D2","recipient_phone":"27992035302","status":"SUCCESS","dispatched_at":"2026-09-12T22:14:33.791462+00:00","message_id":"3EB0AD425AF5B608258D7D"}
[2026-09-12T22:14:38.000Z] 📸 Snapshot "DEPOIS da Etapa 5 (Lembretes)": part.status=DESIGNADA, dispatches=5, tokens=2, interactions=10
[2026-09-12T22:14:38.000Z] 
[2026-09-12T22:14:38.000Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:38.001Z] ETAPA 6: CLEANUP — Restaurando estado original
[2026-09-12T22:14:38.001Z] ═══════════════════════════════════════════════════════════
[2026-09-12T22:14:38.291Z] 📸 Snapshot "ANTES da Etapa 6 (Cleanup)": part.status=DESIGNADA, dispatches=5, tokens=2, interactions=10
[2026-09-12T22:14:38.522Z] ✅ Status restaurado: [{"id":"1f94dedf-4be6-4b3f-8c4e-dd3f88f1bdae","status":"PROPOSTA"}]
[2026-09-12T22:14:38.756Z] 🗑️ 5 dispatches removidos: [{"id":"6a45838c-b8e0-4dd5-a889-a1f2ea5e8f8a","dispatch_type":"COBRANCA_72H","dispatched_at":"2026-09-12T22:14:16.495997+00:00"},{"id":"65b64d7c-143e-43df-aa54-8058a6859f19","dispatch_type":"LEMBRETE_D2","dispatched_at":"2026-09-12T22:14:33.791462+00:00"},{"id":"57ffd625-394e-47b7-a656-83c0e296ce7c","dispatch_type":"LEMBRETE_D7","dispatched_at":"2026-09-12T22:14:29.181663+00:00"},{"id":"c91a7c79-a19e-47f6-b398-8d2448f9bf62","dispatch_type":"LEMBRETE_D9","dispatched_at":"2026-09-12T22:14:24.59497+00:00"},{"id":"a442cb10-cae1-4c32-abd8-c4b05e0c4980","dispatch_type":"PUBLICACAO_S89","dispatched_at":"2026-09-08T22:14:12.746+00:00"}]
[2026-09-12T22:14:38.979Z] 🗑️ 2 tokens removidos
[2026-09-12T22:14:39.457Z] 📸 Snapshot "DEPOIS da Etapa 6 (Cleanup)": part.status=PROPOSTA, dispatches=0, tokens=0, interactions=10
[2026-09-12T22:14:39.457Z] ✅ Cleanup concluído — banco restaurado ao estado original.
[2026-09-12T22:14:39.457Z] 
[2026-09-12T22:14:39.458Z] ═══ Gerando relatórios finais... ═══
```
