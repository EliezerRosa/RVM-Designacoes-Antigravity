---
description: "Build + push + deploy + smoke test pós-feature"
authorization: just-do-it
invariants:
  - "tsc --noEmit DEVE passar (zero erros) antes do push"
  - "npm run build DEVE passar antes do deploy"
  - "NUNCA usar --force no push"
  - "NUNCA usar --no-verify no commit"
  - "Mensagem de commit em snake_case sem parênteses/chaves"
rollback: "git revert HEAD; npm run deploy"
---

## WHY
Garantir que cada entrega chega ao GH Pages em estado verde,
com mensagem de commit rastreável ao intent que o originou.

## WHAT
- Build TypeScript sem erros
- Push para origin/main
- Deploy GH Pages (npm run deploy)
- Confirmar URL publicada

## PHASES
1. tsc --noEmit (parar se erros)
2. git add arquivos relevantes
3. git commit -m "tipo: descrição concisa"
4. git push origin main
5. npm run deploy
6. Confirmar: "Published" no stdout

## ADAPTERS
- shell: git, npm, tsc
- github: push para EliezerRosa/RVM-Designacoes-Antigravity main

## NOTES
- push escreve no stderr mas EXIT=0 = sucesso (ver "x..y main -> main")
- deploy usa gh-pages -d dist (gitignored .vscode não vai no push)
