# Verificação obrigatória com Jev antes de aplicar código

Toda alteração em arquivos de código passa antes pelo verificador Jev
(`node scripts/jev-check.mjs .tmp/jev/proposta.patch`). O Jev NÃO gera
código nem texto: devolve decisões tipadas; a decisão de aplicar é do agente.

## Fluxo obrigatório
1. NÃO aplique ainda. Monte o diff proposto e salve em `.tmp/jev/proposta.patch`
   (crie a pasta se preciso).
2. Execute: `node scripts/jev-check.mjs .tmp/jev/proposta.patch`
3. Aprovado (exit 0): pode aplicar. Reprovado (exit 1): revise o ponto indicado
   por `violacao.choice` e volte ao passo 1.
4. Limite de 3 iterações; persistindo, PARE e peça orientação ao usuário.
5. No resumo final informe: iterações, `conforme.noul`, `violacao.choice`, `risco.score`.

## Nunca
- Aplicar código sem rodar a verificação.
- Ler, imprimir ou incluir no diff o conteúdo de `.env.local`, `supabase/.env`
  ou qualquer segredo (referencie variáveis pelo NOME).
- `git commit` / `git push` / `git reset --hard` sem autorização explícita.
