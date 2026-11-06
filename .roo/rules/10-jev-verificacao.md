# Diretriz sobre o Verificador Jev (Projeto `idd-ide`)

> **Status no RVM Designações (2026-11-05)**: **SUSPENSO / NÃO USAR POR ORA.**

## Esclarecimento Canônico
- O uso do verificador **Jev da TypeSafe** (`typesafe/jev-1.14` via `scripts/jev-check.mjs`) como gate de pré-aplicação de diffs foi idealizado como parte do projeto **`idd-ide`**.
- Somente quando a extensão do **`idd-ide`** estiver operacional e instalada na IDE como política de Governança é que essa verificação passará a valer efetivamente.
- **Por ora, NÃO utilize o `scripts/jev-check.mjs` com este propósito aqui no projeto RVM Designações.**

## Regras permanentes mantidas no RVM Designações
- Validar alterações de código com as ferramentas nativas do projeto (`npm test`, `npm run type-check`, `npm run lint`, `npm run build`).
- Nunca ler, imprimir ou incluir em commits/diffs o conteúdo de `.env`, `.env.local`, `supabase/.env` ou qualquer segredo.
