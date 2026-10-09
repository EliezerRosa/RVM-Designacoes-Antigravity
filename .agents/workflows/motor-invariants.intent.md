---
description: "Invariantes do Motor de Designações (eleição e rotação) — fonte canônica de verdade"
authorization: per-step
invariants:
  - "NUNCA alterar estas regras sem decisão explícita do Eliezer (comando epistêmico)"
  - "Toda alteração em eligibilityService/rankedEligibleService/unifiedRotationService/generationService exige bump de ELIGIBILITY_RULES_VERSION e de RULES_TEXT_VERSION (contextBuilder) + teste em node --test"
  - "A ordem lexicográfica e as faixas (buckets) são a ÚNICA fonte de decisão; não reintroduzir score aditivo"
---

# Motor de Designações — Invariantes (2026-10-09, versão de regras 2026-10-09.05)

> Documento canônico. Em caso de conflito, a regra aqui prevalece sobre o código.
> Decisões registradas do Eliezer em 2026-10-09 (itens 3.1–3.7 do parecer do motor).

---

## M-0. Modelo de decisão
- **Não existe score numérico.** A escolha é: FAIXA (bucket, menor primeiro) e, dentro da faixa, ordem ESTRITA
  proximidade MAIN ±4 sem › carga ±12 sem › frescor nesta parte › mais esquecido › menos partes no ano › nome.
- `explanation` e toda superfície (UI, agente) descrevem estas chaves — nunca uma fórmula.
- Gates relaxáveis em cascata (nunca deixam parte vazia): Q2/Q3 + mesma-parte + seção → Q2/Q3 + mesma-parte → Q2/Q3 → nenhum.
- Gates absolutos: elegibilidade estrutural, disponibilidade, uma parte por semana (exceto Oração Final).

## M-1. Presidência é fila cíclica (3.1/decisão 2026-10-09 = ciclo (a))
- Faixa do Presidente = nº de presidências na janela ±`PRESIDENCY_CYCLE_WINDOW_WEEKS` (52).
- Ninguém recebe a (k+1)-ésima presidência enquanto houver elegível **disponível** com k.
- Presidências manuais contam. Disponibilidade (modo `never`/exceções) restringe o pool da semana, não a fila.

## M-2. Presidência é escolhida antes de todas as outras partes (3.4 = a)
- F1 roda para TODAS as semanas do batch antes de F2/F3/F4. A presidência tem precedência sobre todo outro uso de anciãos.
- Com M-1 em vigor, essa precedência não concentra presidências.

## M-3. Garantia de parte de estudante para anciãos e SMs (decisão 2026-10-09)
- Ancião/SM sem NENHUMA parte de estudante (leitura, demonstração, discurso de estudante; **titular ou ajudante**)
  em ±`STUDENT_PART_GUARANTEE_WEEKS` (13) → faixa 0 (antes das irmãs) em qualquer modalidade de estudante elegível.
- Teto `STUDENT_GUARANTEE_MAX_PER_WEEK` (2) titulares ancião/SM por semana — equilíbrio com o ensino.
- Fora da seca: demonstração irmãs 1 › irmãos 2 › SM 3 › anciãos 4; leitura/discurso de estudante publicador 1 › SM 2 › ancião 3.
- Removida a antiga promoção condicionada a cobertura Tesouros+Vida Cristã.

## M-4. Irmãs têm faixa absoluta em demonstrações (3.3 = a)
- Fora da seca de M-3, toda irmã elegível vem antes de qualquer irmão em demonstração, independentemente de proximidade/carga.
- É política declarada, não rotação. Não converter em desempate sem nova decisão.

## M-5. Ensino ordenado por escassez real (3.5 = b)
- Dentro da semana, as partes de ensino (Discurso de Ensino, Dirigente EBC, Leitor EBC) são processadas
  da MENOR para a MAIOR quantidade de candidatos elegíveis naquele momento (`countEligibleCandidates`), desempate por `seq`.
- Não existe lista fixa de prioridade entre tipos de ensino.

## M-6. Toda parte com publicador em status VIVO é participação (3.6 = a, restrito em .05)
- PROPOSTA, DESIGNADA, APROVADA e CONCLUIDA pesam igual no histórico (carga, proximidade, fila).
- CANCELADA e REJEITADA **não são participação**, mesmo com nome na linha (o nome fica só para avisos/S-140).
  Fonte única: `historyAdapter` (`DEAD_PARTICIPATION_STATUSES`, `partsToHistoryRecords`).
- Higiene de propostas recusadas/expiradas é responsabilidade do ciclo de vida, não do motor.

## M-7. Gate de seção só compara partes da mesma classe
- Tesouros: Discurso Tesouros ↔ Joias. Vida Cristã: Parte Vida Cristã ↔ Dirigente EBC.
- Leitura da Bíblia e Leitor EBC NÃO entram na dívida de seção (caso Israel Vieira).

## M-8. Semânticas de partes especiais
- Oração Final: isenta de proximidade; não conta como carga ao avaliar OUTRAS partes; conta ao avaliar a própria; pode ser 2ª parte da semana; nunca o presidente.
- Derivadas do presidente (oração inicial, comentários, elogios) e cânticos: nunca rodam, nunca contam.
- Necessidades Locais: conta como MAIN; pré-designações da fila são honradas.
- Ajudante conta como MAIN para proximidade e como "participação de estudante" para M-3.

## M-9. Restrição textual de gênero só em modalidades mistas
- "irmã/irmão" no texto da apostila restringe gênero apenas em demonstração e ajudante; em modalidades já exclusivas de irmãos é conteúdo, não restrição.

## M-10. Fidelidade do histórico
- Regeneração remove do histórico as próprias partes em regeneração (sem ghost history).
- Histórico sintético intra-batch: um registro por parte, com `resolvedPublisherId`.
- Sanity-check refaz designações inválidas; sem substituto → `PENDENTE` (nunca `CONCLUIDA` vazia).
- Identidade casa por id quando há id; nome só para legado.

## M-11. Operador > motor
- Na UI manual (`applyEngineRules=false`) não há texto da apostila, Q2/Q3 nem gates de parte/seção — só elegibilidade estrutural.
- Propostas manuais (`is_manual_override`) e partes DESIGNADA/APROVADA não são regeneradas sem pedido explícito.

## M-12. Memória de Recusa é semanal e vale para toda a semana (decisão 2026-10-09)
- Quem **recusou** (`refusal_logs` da semana: portal, Z-API, agente) ou **foi substituído** (`substituted_publisher_name`
  em qualquer parte da semana) fica inelegível para QUALQUER parte daquela semana — motor, dropdown, painel, reatribuição e sugestão de substituto.
- Fora da semana a recusa é neutra: nem crédito (M-6) nem penalidade.
- Aplicação: `getRankedEligibleForPart` lê substituições de `allWeekParts` e recebe recusas via `excludedPublisherNames` (`refusalMemoryService`).
- Troca manual em semana NÃO publicada não grava `substituted_publisher_name` (é remanejo, não ausência) — não gera exclusão.
