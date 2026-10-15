# Memória de Sessão: Blindagem Bidirecional de Gênero e Parentesco no Motor de Elegibilidade

> **Data**: 2026-10-15 17:05 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Tema**: Blindagem Bidirecional no Motor para Impedir Reincidências (Gênero e Parentesco em Partes de Estudante FSM)  
> **Status**: 🟢 Implementado, Testado (110/110 testes ok), Build Validado e Documentado sem Alteração no BD.  

---

## 1. Contexto e Motivação

Durante a auto-reatribuição decorrente da recusa da irmã Raquel Rocha (Raquel Oliveira) na semana de 26/10/2026, o robô automático (`headless-auto-reassign.yml`) escolheu o irmão Felipe de Oliveira para substituí-la na parte *4. Iniciando conversas*.
Ajudante dessa parte já era a irmã Rosa (idosa). Felipe de Oliveira é um jovem adulto varão.
Essa atribuição ocorreu porque:
1. O motor anterior (`2026-10-09.05`) verificava o gênero do Titular apenas quando o candidato estava sendo avaliado para a função de **Ajudante** (`funcao === 'Ajudante'`).
2. Quando a vaga em aberto era de **Titular** e o **Ajudante** já estava definido, o motor não realizava a verificação simétrica de compatibilidade de gênero.
3. Felipe de Oliveira estava em "seca" de partes de estudante há mais de 13 semanas (`isElderOrMSInStudentDrought` = Faixa 0), o que o colocou no topo dos candidatos na ausência da restrição.

---

## 2. Invariantes Mantidas e Decisões

1. **Restrição Absoluta do BD**: Nenhuma alteração retroativa foi realizada no banco de dados. Os registros da semana 26/10/2026 permaneceram intactos conforme determinação expressa do usuário.
2. **Manutenção Integral das Exceções de Parentesco (Bidirecional)**:
   - **Cônjuges**: Marido e esposa (`spouseId` correspondente) podem formar dupla de demonstração em qualquer direção (varão titular + esposa ajudante, ou irmã titular + marido ajudante).
   - **Pais e Filhos**: Pai/mãe com filho/filha (`parentIds` / `childIds` correspondentes) podem formar dupla em qualquer direção (pai com filha, mãe com filho, filho com mãe, filha com pai).
3. **Bloqueio Inexorável de Sexos Opostos Sem Parentesco**:
   - Irmão Titular com Irmã Ajudante sem parentesco -> **BLOQUEADO**.
   - Irmã Titular com Irmão Ajudante sem parentesco -> **BLOQUEADO**.
   - Irmão Ajudante com Irmã Titular sem parentesco -> **BLOQUEADO**.
   - Irmã Ajudante com Irmão Titular sem parentesco -> **BLOQUEADO**.
   - Pares do mesmo sexo (irmão + irmão, irmã + irmã) -> **PERMITIDOS**.

---

## 3. Alterações Técnicas Implementadas

1. **`src/services/eligibilityService.ts`**:
   - Bump de versão: `ELIGIBILITY_RULES_VERSION = '2026-10-15.01'`.
   - Adicionados campos à interface `EligibilityContext`: `assistantGender`, `assistantPublisherId`, `assistantSpouseId`, `assistantParentIds`, `assistantChildIds`.
   - Em `buildEligibilityContext`: implementada a busca reversa do ajudante quando `funcao === 'Titular'` (por `seq`, por número de parte `4.`, por título base, e por `seq + 1`).
   - Em `checkEligibility` (`EnumModalidade.DEMONSTRACAO`): adicionada a verificação do `assistantGender` com bypass de cônjuge e bypass de pai/filho.
   - Em `canBeHelper`: adicionada a checagem complementar do `context.titularPublisherId` dentro de `publisher.parentIds`.
2. **`src/services/contextBuilder.ts`**:
   - Sincronizado `RULES_TEXT_VERSION = '2026-10-15.01'` para paridade com `AdminDashboard.tsx`.
   - Atualizado o texto da Regra A no prompt para documentar a blindagem bidirecional.
3. **`src/services/eligibilityService.test.ts`**:
   - Adicionados 11 novos testes cobrindo todos os cenários da blindagem bidirecional (bloqueios, permissões, bypass de cônjuge, bypass de pais/filhos e extração do contexto).

---

## 4. Resultados da Validação

- **Testes Unitários**: 110 testes executados, 110 aprovados com 0 falhas (`npm test`).
- **Build de Produção**: `npm run build` compilado com sucesso em 26.16s sem erros de tipagem.
- **Memórias Atualizadas**: `_ESTADO-ATUAL.md`, `memories/repo/_ESTADO-ATUAL.md` e esta sessão.
