# Regras e Diretrizes do Agente Antigravity

## AXIOMA ABSOLUTO E IRREVERSÍVEL: Sempre Deixe Tudo Pronto para Qualquer Transição de Agente ou IDE

1. **Prontidão Imediata**: Antes de encerrar qualquer turno, bloco de trabalho ou sessão, ou antes de alternar de agente ou IDE, o agente DEVE deixar o ambiente 100% pronto, documentado, commitado e autossuficiente para que qualquer outro agente ou IDE possa assumir imediatamente sem perda de contexto ou ambiguidade.
2. **Leitura Obrigatória no Início**: Ao iniciar qualquer conversa ou sessão em qualquer IDE (VS Code, Cursor, Antigravity, Claude Code), o agente DEVE PRIMEIRO ler `/memories/repo/_ESTADO-ATUAL.md`, `_ESTADO-ATUAL.md` e os arquivos relevantes em `/memories/` e `/memories/session/`.
3. **Atualização Contínua**: Durante a sessão, manter notas em `/memories/session/<assunto>.md` e atualizar o estado em `_ESTADO-ATUAL.md`.
4. **Commit e Push Obrigatório para o Remoto**: Toda a memória de conversas, estado atual e correlatos DEVE ser commitada e enviada para o repositório remoto Git (`origin/main`) ao final de cada bloco lógico ou sessão, e obrigatoriamente antes de trocar de agente ou mudar de IDE. A árvore de trabalho deve ficar limpa.
5. **Isolamento de Segredos e da integração externa HG (regra inflexível, 2026-11-07)**: arquivos protegidos pelo `.gitignore` NÃO sobem para o remoto — e **tudo** o que diz respeito à integração externa HG (código, scripts, documentação, memórias, dados, sessões de browser, tokens/senhas) DEVE estar no `.gitignore` (ver o bloco "HG" do `.gitignore`). Memória sobre esse tema fica apenas em arquivos locais (`docs-local/_ESTADO-LOCAL.md`, `README-HG-RVM.md`, memórias com `hg` no nome). Todo o restante do ecossistema de memória deve ser versionado no GitHub.

## Auditoria de Código e Investigação

**Diretriz Absoluta:**
- IGNORE comentários, blocos de documentação morta ou notas soltas no código que descrevam como o sistema *deveria* funcionar.
- NUNCA confie em arquivos de documentação antigos para entender a lógica atual do projeto.
- A partir de agora, você deve SEMPRE investigar a verdade rastreando a execução ativa do código-fonte (ex: arquivos `.ts`, `.tsx`, fluxos de invocações e gatilhos de banco de dados).
- Baseie suas decisões, refatorações e diagnósticos ESTRITAMENTE no que o código ativo está fazendo no momento.
- SEMPRE que examinar o código-fonte e tirar conclusões (como previsões de agendamento ou status lógicos), VALIDE essas conclusões inspecionando os dados reais armazenados no banco de dados em produção usando o Supabase MCP Server (ferramentas como `execute_sql`, `list_tables`, etc).
- SEMPRE que examinar código-fonte, sua auditoria deve ser INTEGRAL e MULTIDISCIPLINAR. Inclua e investigue TODOS os vetores relevantes, abrangendo backend (Node.js, Supabase Edge Functions), frontend (React, Vite), serviços externos integrados (Z-API), rotinas de automação (GitHub Actions, CRONs, arquivos `.yml`), e quaisquer scripts referenciados pelo app (independente da linguagem). Não se limite apenas aos arquivos `.ts` mais óbvios.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.
