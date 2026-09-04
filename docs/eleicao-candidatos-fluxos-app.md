# Eleicao de Candidatos - Fluxos Tecnicos do App

## 1) Objetivo
Este documento descreve, no nivel de codigo, os fluxos de eleicao de candidatos para designacoes de partes no app. O foco e:
- caminhos de execucao por superficie (motor, UI manual, painel de controle, agente),
- pontos de convergencia (mesmo nucleo de decisao),
- pontos de divergencia (ordem, bloqueios, fallbacks),
- regras aplicadas em cada ponto de decisao.

## 2) Escopo de codigo analisado
- Nucleo de elegibilidade:
  - [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L294)
- Nucleo de score/ranking:
  - [src/services/unifiedRotationService.ts](../src/services/unifiedRotationService.ts#L1)
- Nucleo de cooldown:
  - [src/services/cooldownService.ts](../src/services/cooldownService.ts#L1)
- Motor de geracao automatica:
  - [src/services/generationService.ts](../src/services/generationService.ts#L1)
- Eleicao manual (dropdown):
  - [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L58)
- Painel de explicacao/controle:
  - [src/components/ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx#L153)
- Acoes do agente (CHECK_SCORE/EXPLAIN_*):
  - [src/services/agentActionService.ts](../src/services/agentActionService.ts#L199)
- Mapeamento de modalidade e auto-atribuicao:
  - [src/constants/mappings.ts](../src/constants/mappings.ts#L13)

## 3) Nucleo canonico (convergencia principal)
Todos os fluxos de eleicao passam, direta ou indiretamente, por 3 blocos comuns:

1. Contexto da parte:
- `buildEligibilityContext(...)` em [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L56)
- Resolve: presidente da semana, flags de oracao inicial/final, genero do titular para ajudante, vinculos familiares.

2. Gate binario de elegibilidade:
- `checkEligibility(...)` em [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L287)
- Saida: `eligible=true/false` + motivo de bloqueio.

3. Ordenacao deterministica:
- `getRankedCandidates(...)` em [src/services/unifiedRotationService.ts](../src/services/unifiedRotationService.ts#L326)
- Baseado em `calculateScore(...)` em [src/services/unifiedRotationService.ts](../src/services/unifiedRotationService.ts#L111)
- Critica: desempate deterministico (weeksSinceLast, lastAnyDate, totalCount, alfabetico).

## 4) Fluxo A - Motor automatico (GenerationService)
Entrada principal: `generateDesignations(...)` em [src/services/generationService.ts](../src/services/generationService.ts#L34).

### 4.1 Pre-filtro de partes
- Exclui semanas passadas: [src/services/generationService.ts](../src/services/generationService.ts#L59)
- Tria partes nao designaveis (`isNonDesignatablePart`): [src/services/generationService.ts](../src/services/generationService.ts#L62)
- Ignora `CONCLUIDA/CANCELADA`: [src/services/generationService.ts](../src/services/generationService.ts#L68)
- Inclui `PROPOSTA/DESIGNADA` se atribuicao atual estiver invalida por elegibilidade: [src/services/generationService.ts](../src/services/generationService.ts#L183)

Regras aplicadas aqui:
- R-GEN-01: nao gerar passado.
- R-GEN-02: limpar residuos em partes nao designaveis (cascata/limpeza).
- R-GEN-03: revalidar atribuicoes existentes para saneamento.

### 4.2 Fase 0 / 0.5
- Fase 0 (cleanup): marca `CLEANUP` para limpar nomes indevidos: [src/services/generationService.ts](../src/services/generationService.ts#L170)
- Fase 0.5 (sanity): remove atribuicao invalida e abre vaga para reeleicao: [src/services/generationService.ts](../src/services/generationService.ts#L174)

### 4.3 Fase 1 - Presidente
- Seleciona partes de presidente: [src/services/generationService.ts](../src/services/generationService.ts#L202)
- Filtro: `checkEligibility(PRESIDENCIA)` + disponibilidade.
- Ranking: `getRankedCandidates(..., 'Presidente', ...)`: [src/services/generationService.ts](../src/services/generationService.ts#L231)
- Escolha final: primeiro nao bloqueado por `isBlocked`: [src/services/generationService.ts](../src/services/generationService.ts#L235)

### 4.4 Fase 1.5 - Auto-chairman
- Auto-atribui partes do presidente (comentarios, elogios, oracao inicial): [src/services/generationService.ts](../src/services/generationService.ts#L294)
- Requer `chairmanId` valido para persistir.

### 4.5 Fase 2 - Ensino
- Tipos de ensino dedicados: [src/services/generationService.ts](../src/services/generationService.ts#L326)
- Regra especial Leitor EBC: prioridade brothers -> SM -> elder: [src/services/generationService.ts](../src/services/generationService.ts#L378)
- Sempre usa gate de elegibilidade + ranking + skip de bloqueados.

### 4.6 Fase 3 - Estudante
- Detecta se e demonstracao: [src/services/generationService.ts](../src/services/generationService.ts#L436)
- Demonstracao prioriza sisters -> brothers -> SM -> elder: [src/services/generationService.ts](../src/services/generationService.ts#L451)

### 4.7 Fase 4 - Demais + ajudante + oracao final
- Branch ajudante: [src/services/generationService.ts](../src/services/generationService.ts#L526)
- Usa contexto do titular (ou fallback) e regras de helper no checkEligibility.
- Branch oracao final: [src/services/generationService.ts](../src/services/generationService.ts#L605)
  - Grupo 1: livres e nao-presidente: [src/services/generationService.ts](../src/services/generationService.ts#L630)
  - Grupo 2: ocupados e nao-presidente
  - Grupo 3: presidente fallback: [src/services/generationService.ts](../src/services/generationService.ts#L659)

### 4.8 Persistencia
- Injeta historico sintetico intra-batch para evitar repeticao no mesmo lote.
- Commit final com auditoria de snapshot do motor (config + versao): [src/services/generationService.ts](../src/services/generationService.ts#L772)

## 5) Fluxo B - Eleicao manual (PublisherSelect)
Entrada principal de calculo: `sortedOptions` em [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L58).

### 5.1 Pipeline
1. Resolve modalidade da parte (`getModalidadeFromTipo`).
2. Constroi contexto (`buildEligibilityContext`).
3. Para cada publicador:
- `checkEligibility(...)`: [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L85)
- Se ja designado na semana, torna inelegivel hard: [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L94)
- Calcula score (`calculateScore`): [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L108)
- Obtem cooldown visual (`getBlockInfo`): [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L114)
4. Ordena por score e desempates.
5. Mostra apenas elegiveis em `visibleOptions`: [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L155)

### 5.2 Regras de decisao locais
- R-UI-01: duplicidade na mesma semana e bloqueio hard no dropdown.
- R-UI-02: cooldown nao bloqueia opcao; aparece como sinalizacao/tooltip.
- R-UI-03: se nome atual selecionado estiver inelegivel, mantem visivel como opcao desabilitada (preserva contexto de edicao).
- R-UI-04: avisos adicionais de multiplas designacoes via `checkMultipleAssignments`: [src/components/PublisherSelect.tsx](../src/components/PublisherSelect.tsx#L277)

## 6) Fluxo C - Painel de controle (ActionControlPanel)
Entrada: parte selecionada no painel.

### 6.1 Pipeline de recomendacao
- Lista elegiveis via `checkEligibility`: [src/components/ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx#L153)
- Remove historico da semana atual para evitar loop: [src/components/ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx#L161)
- Ranking deterministico: [src/components/ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx#L162)
- Melhor candidato: primeiro nao bloqueado (`rankedNonBlocked`): [src/components/ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx#L163)

### 6.2 Divergencia interna importante
- `bestCandidate` exclui bloqueados.
- `topCandidates` usa `ranked.slice(0,4)` e pode incluir bloqueados: [src/components/ActionControlPanel.tsx](../src/components/ActionControlPanel.tsx#L168)

Impacto:
- A recomendacao principal pode divergir visualmente da lista Top 4 (se houver bloqueados no topo por score bruto).

## 7) Fluxo D - Agente (CHECK_SCORE / EXPLAIN_PART / EXPLAIN_RANKING)
Entradas principais:
- `CHECK_SCORE`: [src/services/agentActionService.ts](../src/services/agentActionService.ts#L199)
- `EXPLAIN_PART`: [src/services/agentActionService.ts](../src/services/agentActionService.ts#L497)
- `EXPLAIN_RANKING`: [src/services/agentActionService.ts](../src/services/agentActionService.ts#L590)

### 7.1 Pipeline
- Resolve parte alvo + aliases.
- Constroi contexto com `buildEligibilityContext`.
- Filtra elegiveis com `checkEligibility`: [src/services/agentActionService.ts](../src/services/agentActionService.ts#L275)
- Rankeia via `getRankedCandidates`: [src/services/agentActionService.ts](../src/services/agentActionService.ts#L303)
- Reordena output para mostrar nao bloqueados primeiro, depois bloqueados com tag: [src/services/agentActionService.ts](../src/services/agentActionService.ts#L308)

### 7.2 Regras locais do agente
- R-AG-01: trata aliases para robustez semantica (nome informal -> modalidade resolvida).
- R-AG-02: usa historico sem a semana corrente (consistencia com painel/motor).
- R-AG-03: designacao na mesma semana nao e bloqueio hard; recebe tag de alerta no texto.

## 8) Fluxo E - Curador de IA e Selecao Semantica Hibrida (SemanticDraggableGenerator)
Entrada principal: `getRankedEligibleForPart(...)` e `calculateSemanticScore(...)` em [src/services/semanticRulesService.ts](../src/services/semanticRulesService.ts#L180), orquestrado via [src/components/ui/SemanticDraggableGenerator.tsx](../src/components/ui/SemanticDraggableGenerator.tsx#L1).

### 8.1 Pipeline
1. Identifica a semana em foco e as partes ativas.
2. Pré-filtro rígido: consome exclusivamente os candidatos retornados como elegíveis desbloqueados para a parte (`checkEligibility` + regras de cooldown e privilégio).
3. Ponto de partida determinístico: se o publicador possui a tag do perfil da parte em `publisher.syntheticProfiles`, recebe +300 pontos de afinidade e badge `💎 Perfil Atribuído no Cadastro`.
4. Ranqueamento contextual por afinidade: o Curador avalia histórico de funções, adequação ao tema (ex: livros bíblicos da semana inferidos pelo Agente Especialista) e traços desejáveis, atribuindo scores aos demais candidatos elegíveis.
5. Seleção individual por parte: o usuário visualiza as recomendações no modal e escolhe o candidato para a parte específica; o callback `onAssign(part.id, publisherId)` atualiza o estado da parte.
6. Isolamento estrito: Zero impacto no motor "Gerar" de lote (`generationService.ts`), atuando puramente como ferramenta de apoio visual ao designador.

### 8.2 Regras locais do Curador
- R-CUR-01: Restrito aos elegíveis desbloqueados na semana em foco para cada parte individualmente.
- R-CUR-02: Bônus determinístico de +300 pts para quem possui o perfil pré-atribuído no cadastro.
- R-CUR-03: Não oculta nem descarta os demais elegíveis da semana, mantendo flexibilidade total de escolha.
- R-CUR-04: Enriquecimento contínuo de perfis e insights via `curatorBatchSpecialistAgent.ts` e base relacional no Supabase (`curator_profiles`, `curator_batch_insights`).

## 9) Arvore de regras de elegibilidade (checkEligibility)
Pontos de decisao (ordem real):

1. Filtros globais
- `isServing`: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L313)
- `isNotQualified`: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L318)
- `requestedNoParticipation`: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L323)
- disponibilidade semanal (se nao passado): [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L330)
- `isHelperOnly` fora de ajudante: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L335)

2. Secao e regras textuais
- privilegios por secao: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L340)
- restricoes textuais (genero, condicao, funcao, batismo): [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L354)

3. Branch de ajudante
- funcao ajudante: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L735)
- bloqueia sem titularGender: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L744)
- bypass casal/familia e regra de mesmo genero: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L760)

4. Branch por modalidade
- Presidencia: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L391)
- Oracao (inclui inicial/final): [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L401)
- Discurso Ensino: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L428)
- Leitura Estudante: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L448)
- Demonstracao: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L455)
- Discurso Estudante: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L460)
- Dirigente EBC: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L472)
- Leitor EBC: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L482)
- Necessidades Locais: [src/services/eligibilityService.ts](../src/services/eligibilityService.ts#L495)

## 10) Convergencias vs divergencias (resumo tecnico)

### 10.1 Convergencias fortes
1. Gate unico de elegibilidade: todas as superficies criticas usam `checkEligibility`.
2. Contexto unico de parte: `buildEligibilityContext` e base comum para regras sensiveis.
3. Ranking unico: `getRankedCandidates` para motor, painel e agente.
4. Cooldown com mesma semantica de proximidade (`isBlocked/getBlockInfo`).

### 9.2 Divergencias relevantes
1. Aplicacao do cooldown:
- Motor: influencia escolha final (pula bloqueados).
- Dropdown: apenas sinaliza visualmente.
- Agente: ordena nao bloqueados primeiro, mas mostra bloqueados com tag.

2. Duplicidade na semana:
- Dropdown aplica bloqueio hard local (`Ja tem designacao nesta semana`).
- Agente/painel tratam mais como sinalizacao contextual.

3. Top list vs melhor candidato no painel:
- Melhor candidato exclui bloqueados.
- Top 4 pode conter bloqueados.

4. Mapeamento de modalidade fora do centro:
- Existe mapeamento local no painel de aprovacao (risco de drift): [src/components/ApprovalPanel.tsx](../src/components/ApprovalPanel.tsx#L576)
- Fonte central oficial: [src/constants/mappings.ts](../src/constants/mappings.ts#L13)

## 11) Catalogo de regras por ponto de decisao
| ID | Regra | Onde decide | Fluxos que usam |
|---|---|---|---|
| R-EL-01 | Publicador deve estar atuante | eligibility global filter | Motor, UI manual, Painel, Agente, Curador |
| R-EL-02 | Desqualificado / no-participation bloqueia | eligibility global filter | Motor, UI manual, Painel, Agente, Curador |
| R-EL-03 | Disponibilidade por semana (nao passado) | eligibility global filter | Motor, UI manual, Painel, Agente, Curador |
| R-EL-04 | Helper-only so em funcao ajudante | eligibility global filter | Motor, UI manual, Painel, Agente, Curador |
| R-EL-05 | Privilegios por secao | eligibility secao filter | Motor, UI manual, Painel, Agente, Curador |
| R-EL-06 | Restricao textual da parte (genero/condicao/funcao/batismo) | eligibility textual parser | Motor, UI manual, Painel, Agente, Curador |
| R-EL-07 | Ajudante requer contexto do titular e regra de mesmo genero (com bypass familia) | canBeHelper | Motor, UI manual, Painel, Agente, Curador |
| R-EL-08 | Regras por modalidade (Presidencia, Oracao, Ensino, EBC etc.) | switch modalidade | Motor, UI manual, Painel, Agente, Curador |
| R-ROT-01 | Score deterministico (time, frequency, heavy proximity, bonus) | calculateScore | Motor, UI manual, Painel, Agente |
| R-ROT-02 | Ordenacao deterministica com desempates | getRankedCandidates | Motor, Painel, Agente |
| R-CD-01 | Cooldown proximidade (visual/ordem/escolha) | isBlocked/getBlockInfo | Motor, UI manual, Painel, Agente |
| R-UI-01 | Duplicidade na mesma semana bloqueia no dropdown | PublisherSelect local rule | UI manual |
| R-GEN-01 | Partes nao designaveis entram em cleanup se houver residuo | generation phase 0 | Motor |
| R-GEN-02 | Oracao final com 3 grupos de fallback | generation phase 4 | Motor |
| R-CUR-01 | Foco estrito na semana ativa e partes individuais com elegíveis desbloqueados | getRankedEligibleForPart | Curador |
| R-CUR-02 | Ponto de partida determinístico via `syntheticProfiles` (+300 pts) | calculateSemanticScore | Curador |
| R-CUR-03 | Flexibilidade total com ranqueamento semântico de todos os elegíveis | calculateSemanticScore | Curador |
| R-CUR-04 | Base de conhecimento e especialização contínua de lotes pós-importação | curatorBatchSpecialistAgent | Curador |

## 12) Grafos gerados
1. Visao geral de convergencia/divergencia:
- [docs/graphs/eleicao-candidatos-overview.mmd](graphs/eleicao-candidatos-overview.mmd)

2. Fluxo detalhado do motor de geracao:
- [docs/graphs/eleicao-candidatos-generation-flow.mmd](graphs/eleicao-candidatos-generation-flow.mmd)

3. Comparativo UI manual vs painel vs agente:
- [docs/graphs/eleicao-candidatos-ui-agent-comparison.mmd](graphs/eleicao-candidatos-ui-agent-comparison.mmd)

4. Arvore de decisao de elegibilidade:
- [docs/graphs/eleicao-candidatos-eligibility-decision-tree.mmd](graphs/eleicao-candidatos-eligibility-decision-tree.mmd)

## 13) Observacao tecnica final
A arquitetura atual ja tem um nucleo convergente forte para eleicao de candidatos. O novo Curador Semântico de IA opera como uma extensão ergonômica desse núcleo, reutilizando integralmente o gate de elegibilidade semântica e introduzindo uma base de conhecimento relacional de perfis sintéticos cadastrais que orientam a decisão humana com agilidade e inteligência.

