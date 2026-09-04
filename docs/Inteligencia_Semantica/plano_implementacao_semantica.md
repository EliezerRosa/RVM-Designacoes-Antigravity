# Proposta de Arquitetura: Motor Semântico Totalmente Desacoplado (YAML + UI Isolada)

Esta revisão do plano visa **exagerar** o nível de isolamento, garantindo que o novo sistema não toque nem no motor de elegibilidade atual e **nem no componente de Dropdown** existente.

## 1. O Benefício de Criar e Alimentar Regras em YAML

Armazenar o aprendizado do Agente Especialista em arquivos estruturados como **YAML** (em vez de uma tabela rígida de banco de dados como `workbook_semantic_rules`) traz vantagens massivas de desacoplamento e flexibilidade:

1. **Leitura e Edição Humana (Transparência Total):** O YAML é projetado para ser lido por humanos. Um administrador pode facilmente abrir o arquivo e ajustar uma regra que a IA deduziu incorretamente, sem precisar entender sintaxe JSON ou escrever comandos SQL.
2. **Desacoplamento do Banco de Dados:** Não precisamos alterar o esquema do Supabase, rodar migrações, nem arriscar a integridade do banco. Os arquivos YAML podem ser salvos no *Storage Bucket* ou gerados estaticamente.
3. **Controle de Versão Fiel:** Como é baseado em linhas e indentação simples, acompanhar o que a IA está "aprendendo" ao longo do tempo (via *git diff* ou histórico) é muito mais claro.
4. **Alimentação Direta do Agente de Critérios:** O frontend pode simplesmente carregar o arquivo `.yml` global na inicialização e consultá-lo sempre que necessário, sem sobrecarregar o banco de dados com requisições por parte.

**Exemplo do YAML gerado pelo Agente Aprendiz:**
```yaml
semana_46_2026:
  parte_7_donativos:
    criterio_exato: "ancião"
    tom: "financeiro"
    sugestao: "Recomendado alguém maduro para falar de donativos."

semana_48_2026:
  parte_6_discurso_idosos:
    demografia_alvo: "idosos"
    boost_tags: [ "experiente", "mais_velho" ]
```

---

## 2. O "Agente Especialista Aprendiz" (YAML Generator)

* **O Gatilho:** Quando a apostila entra no sistema, um Worker/Edge Function entra em ação.
* **A Missão:** Um modelo LLM (ou parser avançado) lê a apostila inteira e **escreve um arquivo `.yaml`** contendo os critérios abstratos deduzidos para aquela semana.
* **Isolamento:** Ele não interage com nenhuma tabela vital do banco. O YAML é gravado em um Storage/Bucket (ex: `semantic-rules/2026-outubro.yml`).

---

## 3. Desacoplamento Extremo da UI (Nada de Dropdown)

O motor atual gera o Dropdown. **Não tocaremos no Dropdown.**

* **A Interface do "Agente de Critérios" (Sidecar/Painel Flutuante):** 
  Em vez de injetar badgets ou reordenar a lista original de candidatos no Select, criaremos um componente 100% autônomo, como um **"Assistente Inteligente (Side Panel)"** ou um botão de **"💡 Consultar Especialista"**.
* **Como Funciona na Prática:**
  1. O usuário clica na parte de "Idosos" e abre o Dropdown padrão (que exibe a lista matemática bruta do motor atual).
  2. Ao lado, o **Painel do Agente** (que assinou o contexto global ou reagiu à parte selecionada) exibe uma notificação suave: *"Encontrei critérios semânticos para esta parte"*.
  3. O Painel lê o arquivo YAML correspondente e cruza com os publicadores da congregação.
  4. O Painel exibe: *"Recomendo o Irmão João, pois o tema foca em idosos e ele tem perfil maduro."*
  5. O painel pode ter um botão [Aceitar Sugestão], que ao ser clicado, apenas despacha uma ação (via dispatch) que preenche o valor do Dropdown, como se o usuário tivesse clicado.

---

## Benefícios Desta Abordagem

* **Isolamento Total de Código:** O código do "Agente de Critérios" não compartilha variáveis nem lida com o estado do motor antigo. Ele é um observador que emite recomendações.
* **Risco Absolutamente Zero de Regressão:** Se a IA enlouquecer e sugerir a pessoa errada, a UI e o motor de designações originais continuam intactos e perfeitos. O usuário simplesmente ignora a recomendação ou escolhe outro elegível.

---

## Resolução das Decisões de Arquitetura (Consolidação em Produção — Fase 7)

1. **Armazenamento (Decisão: Supabase Relacional vs YAML)**:
   - Em vez de arquivos YAML em storage bucket, a arquitetura evoluiu para tabelas relacionais no Supabase (`curator_profiles` e `curator_batch_insights`). Isso garantiu suporte a queries reativas, integridade referencial, cache local transparente e associação direta com o campo `syntheticProfiles` dos publicadores, mantendo o isolamento 100% preservado.
2. **Interface Visual (Decisão: Botão Flutuante Retrátil no Rodapé Esquerdo)**:
   - Foi adotado o componente `SemanticDraggableGenerator.tsx`, que atraca automaticamente no canto inferior esquerdo do rodapé ao entrar na semana. É retrátil por padrão, arrastável suavemente pelo usuário e abre o modal de curadoria sob demanda, sem competir com a tabela principal da reunião.

