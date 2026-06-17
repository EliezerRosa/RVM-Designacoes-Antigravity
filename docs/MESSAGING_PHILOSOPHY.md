# Filosofia de Mensagens RVM — Análise Profissional e Proposta de Enriquecimento

> Documento gerado em 17/06/2026 como análise pré-implantação.
> Status: **RASCUNHO / NÃO IMPLANTADO**

---

## 1. Diagnóstico do Estado Atual

### 1.1 O que existe hoje
O Cron (`cron-whatsapp-reminders`) é um motor simples de lembretes baseado em dias:
- Busca partes com status `DESIGNADA`
- Calcula a distância até a reunião
- Dispara em D-7 e D-2 (D-1 removido a pedido)
- Registra no `zapi_dispatch_log` para idempotência

**Registro de uso real (banco de dados):**
| Tipo | Sucesso | Erro |
|---|---|---|
| LEMBRETE_D1 | 14 | 2 |
| LEMBRETE_D2 | 12 | 4 |

O D-7 ainda não foi disparado em produção (implementado mas nunca ativado no passado). D-1 gerou 14 envios antes de ser desativado.

### 1.2 Problemas Identificados
1. **Bug de tabela corrigido**: O cron lia `settings` mas o dado real ficava em `app_settings`. Corrigido em 17/06/2026.
2. **Sem filtro de partes automáticas**: O Cron hoje dispara lembretes para Oração Inicial, Cânticos, Elogios e Conselhos — partes que não são designações pessoais significativas e geram ruído.
3. **Sem noção de "S-89 já enviado"**: O Cron manda D-7 mesmo que o publicador nunca tenha recebido o S-89 (convocação inicial), quebrando a sequência lógica.
4. **Mensagem genérica e impessoal**: Sem gênero, sem saudação por hora do dia, sem contexto da parte (se é titular ou ajudante, se tem ensaio).
5. **Sem relatório de operação**: O SRVM não sabe o que foi enviado no dia.
6. **Sem cobrança de não-respondentes**: Se o irmão recebeu o S-89 e não confirmou nem recusou, o sistema fica silencioso.

---

## 2. Filosofia da RVM — Alinhamento Contextual

A Reunião Vida e Ministério tem características únicas que precisam guiar toda a camada de mensagens:

### Hierarquia de Papéis Real (extraída do banco)
| Função | Peso de Autoridade |
|---|---|
| Coordenador do Corpo de Anciãos | Máximo |
| Superintendente da RVM (SRVM) | Gestor direto das partes |
| Ajudante do SRVM | Co-gestor |
| Superintendente de Serviço | Apoio |
| Secretário | Administrativo |
| Ancião / Servo Ministerial (via `privileges`) | Aquiescência tácita |
| Publicador Comum | Confirmação obrigatória |

### Tipos de Partes e Sua Natureza
Extraído do banco (`workbook_parts.tipo_parte`):

**Partes Designáveis com S-89 (recebem lembretes):**
- Leitura da Bíblia, Joias Espirituais, Discurso Tesouros
- Iniciando Conversas, Explicando Suas Crenças, Cultivando o Interesse, Fazendo Discípulos (e respectivos Ajudantes)
- Discurso de Estudante, Necessidades Locais, Parte Vida Cristã
- Leitor EBC, Dirigente EBC

**Partes do Presidente (auto-derivadas — NÃO recebem lembretes):**
- Presidente, Oração Inicial, Oração Final, Comentários Iniciais, Comentários Finais, Elogios e Conselhos

**Partes sem designação pessoal (NÃO recebem lembretes):**
- Cântico, Cântico Inicial, Cântico do Meio, Cântico Final, Boletim, Evento Especial

### A Lógica da Aquiescência
Na RVM, Anciãos e Servos Ministeriais (`canPreside = true` ou `funcao IN ('Coordenador', 'Secretário', 'Superintendente...')`) são convocados por função. O silêncio deles é culturalmente interpretado como aceite. Forçá-los a confirmar formalmente é desnecessário e desrespeitoso à dinâmica eclesiástica. O sistema deve honrar esse protocolo.

---

## 3. Proposta de Enriquecimento — Novas Possibilidades

### PROPOSTA A: Mensagem Personalizada por Tipo de Parte

**Hoje:** Mensagem única genérica para todas as partes.

**Proposta:** Templates específicos por categoria:

```
🎤 [Para partes de ministério — Iniciando Conversas, etc.]
"Olá, Irmã Josyane! Sua demonstração de *Iniciando Conversas* é na sexta-feira, 20 de junho.
Lembre-se de ensaiar com seu ajudante. Você precisa de contato com alguém para ensaiar?"

📖 [Para Leitura da Bíblia]
"Olá, Irmão João! Sua leitura da Bíblia é na sexta, 20 de junho.
A referência é: Mateus 5:1-12. Bons estudos! ✨"

🎓 [Para Discurso / Tesouros]
"Olá, Irmão Carlos! Seu discurso de tesouros está marcado para sexta, 20 de junho.
Garanta que seu esboço S-89 está bem marcado. 💪"
```

**Viabilidade:** Alta. Já temos `tipo_parte` e `part_title` em todos os registros.

---

### PROPOSTA B: Humanização por Gênero e Horário

**Hoje:** "Olá, {nome}!" — neutro.

**Proposta:**
- Saudação dinâmica: "Bom dia" / "Boa tarde" / "Boa noite" pelo horário de Brasília ao rodar o Cron.
- Pronome de gênero: "Irmão" / "Irmã" baseado no campo `data->>'gender'` do publicador (já existe no banco: `brother` / `sister`).

```
"Boa tarde, Irmã Josyane! ☀️"
vs atual:
"Olá, Josyane Vieira!"
```

**Viabilidade:** Alta. O campo `gender` já existe e está populado.

---

### PROPOSTA C: Notificação de Parceiro de Ensaio

**Hoje:** Cada designado recebe seu aviso de forma isolada.

**Proposta:** Quando existir um par Titular/Ajudante na mesma parte, o lembrete D-7 menciona o parceiro e inclui o contato (se ambos tiverem telefone).

```
"📖 Sua parte: *Iniciando Conversas* (Titular)
👥 Seu ajudante: Irmão Renato Silva — 27 99xxx-xxxx
Sugerimos combinar o ensaio até quarta-feira!"
```

**Viabilidade:** Alta. A query já pode fazer JOIN entre partes da mesma semana com mesmo `tipo_parte` mas `funcao` diferente.

---

### PROPOSTA D: Alerta de Partes Sem Telefone (Relatório ao SRVM)

**Hoje:** Partes sem telefone cadastrado são silenciosamente ignoradas.

**Proposta:** Ao fim do Cron, o relatório enviado ao SRVM e Ajudante inclui uma seção de **pendências**:

```
⚠️ *Partes sem contato cadastrado:*
• Joias Espirituais — Pedro Henrique (sem telefone)
• Leitura da Bíblia — Ana Flávia (sem telefone)

Por favor, atualize os contatos no sistema.
```

**Viabilidade:** Alta. O Cron já detecta esse caso (linha 158: `!phone → continue`). Basta agregar e reportar.

---

### PROPOSTA E: Cobrança Inteligente D-9 (para PROPOSTA não respondidos)

**Hoje:** Não existe.

**Proposta:** Em D-9, o Cron busca partes com status `PROPOSTA` (publicadores que receberam o S-89 mas ainda não confirmaram). Envia mensagem de cobrança com o Link Mágico de confirmação embutido.

```
"⏰ Irmã Josyane, ainda não recebemos sua confirmação para a parte de 
*Iniciando Conversas* na sexta, 20 de junho.

Por favor, confirme ou recuse pelo link:
👉 https://rvm.app/?portal=confirm&partId=...&token=...

Precisamos saber para organizar a reunião. Obrigado! 🙏"
```

**Viabilidade:** Alta. Status `PROPOSTA` já existe no banco. O token de confirmação já é gerado pelo sistema.

---

### PROPOSTA F: Feedback Pós-Reunião — "Obrigado por ter realizado"

**Hoje:** Depois que a reunião passa, o sistema fica silencioso.

**Proposta:** Em D+1 (dia seguinte à reunião), o Cron detecta partes com status `CONCLUIDA` ou `DESIGNADA` cuja data de reunião já passou, e envia uma mensagem de agradecimento e encorajamento.

```
"✅ Irmão Carlos, obrigado por ter realizado sua parte na reunião de ontem!
Que Jeová continue abençoando seu ministério. 🙏"
```

**Filtragem:** Somente para partes que efetivamente ocorreram (status `CONCLUIDA`). Partes `CANCELADA` ou `REJEITADA` ficam de fora.

**Viabilidade:** Média. Requer que o sistema marque partes como `CONCLUIDA` após a reunião (o que hoje pode ser manual).

---

### PROPOSTA G: Alerta de "Semana Próxima Sem Publicar"

**Hoje:** Não existe.

**Proposta:** O Cron, ao rodar em D-15 da semana seguinte, verifica se aquela semana ainda tem partes com status `PENDENTE` (não designadas). Se sim, alerta o SRVM:

```
"⚠️ *Atenção SRVM:* A semana de 29 de junho ainda tem partes sem designação:
• Joias Espirituais — PENDENTE
• Leitura da Bíblia — PENDENTE

O prazo para publicação automática é em 3 dias!"
```

**Viabilidade:** Alta. É uma simples query de `workbook_parts WHERE status = 'PENDENTE' AND date BETWEEN now() AND now() + 15 days`.

---

### PROPOSTA H: Confirmação Silenciosa para Anciãos (Aquiescência Automática)

**Hoje:** Anciãos com partes em `PROPOSTA` ficam presos nesse status indefinidamente.

**Proposta:** Em D-9, se a parte ainda estiver como `PROPOSTA` e o publicador tiver privilégios de Ancião/SM (`canPreside = true`), o sistema automaticamente promove o status para `DESIGNADA` sem interação humana, e registra no log: *"Status promovido por aquiescência automática (D-9)"*.

Isso resolve o problema de Anciãos que nunca confirmam por protocolo cultural, sem precisar incomodá-los.

**Viabilidade:** Alta, mas **requer aprovação explícita do usuário** antes de implementar, pois envolve mutação automática de dados sem ação humana direta.

---

## 4. Ranking de Prioridade de Implementação

| Proposta | Valor | Esforço | Prioridade |
|---|---|---|---|
| **B** — Gênero + Saudação | Alto | Baixo | ⭐⭐⭐⭐⭐ |
| **D** — Relatório de sem-telefone | Alto | Baixíssimo | ⭐⭐⭐⭐⭐ |
| **E** — Cobrança D-9 | Alto | Médio | ⭐⭐⭐⭐⭐ |
| **G** — Alerta semana sem publicar | Alto | Baixo | ⭐⭐⭐⭐ |
| **C** — Parceiro de ensaio | Alto | Médio | ⭐⭐⭐⭐ |
| **A** — Templates por tipo de parte | Médio | Médio | ⭐⭐⭐ |
| **H** — Aquiescência automática | Alto | Médio | ⭐⭐⭐ (requer aprovação) |
| **F** — Obrigado pós-reunião | Médio | Médio | ⭐⭐ |

---

## 5. Restrições e Axiomas que Preservamos

- Nenhuma das propostas toca em código legado do frontend React.
- Todo o enriquecimento vive dentro da Edge Function `cron-whatsapp-reminders/index.ts`.
- O kill-switch `zapi_automation_active` continua sendo o freio mestre de tudo.
- Idempotência via `zapi_dispatch_log` é mantida para todas as novas propostas (nenhuma mensagem será enviada duas vezes para o mesmo `partId + tipo`).
