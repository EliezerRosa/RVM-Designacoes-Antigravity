# Regras e Diretrizes do Agente Antigravity

## AXIOMA IRREVOGÁVEL: Memória Persistente Multi-IDE com Sincronização Remota Obrigatória

1. **Leitura Obrigatória no Início**: Ao iniciar qualquer conversa ou sessão em qualquer IDE (VS Code, Cursor, Antigravity, Claude Code), o agente DEVE PRIMEIRO ler `/memories/repo/_ESTADO-ATUAL.md`, `_ESTADO-ATUAL.md` e os arquivos relevantes em `/memories/` e `/memories/session/`.
2. **Atualização Contínua**: Durante a sessão, manter notas em `/memories/session/<assunto>.md` e atualizar o estado em `_ESTADO-ATUAL.md`.
3. **Commit e Push Obrigatório para o Remoto**: Toda a memória de conversas, estado atual e correlatos DEVE ser commitada e enviada para o repositório remoto Git (`origin/main`) ao final de cada bloco lógico ou sessão, e obrigatoriamente antes de trocar de agente ou mudar de IDE.
4. **Isolamento de Segredos e HG**: Somente arquivos protegidos pelo `.gitignore` (ex: material de Hourglass em `docs-local/`, dumps de DOM, sessões de browser, tokens/senhas) NÃO sobem para o remoto. Todo o restante do ecossistema de memória deve ser versionado no GitHub.

## Auditoria de Código e Investigação

**Diretriz Absoluta:**
- IGNORE comentários, blocos de documentação morta ou notas soltas no código que descrevam como o sistema *deveria* funcionar.
- NUNCA confie em arquivos de documentação antigos para entender a lógica atual do projeto.
- A partir de agora, você deve SEMPRE investigar a verdade rastreando a execução ativa do código-fonte (ex: arquivos `.ts`, `.tsx`, fluxos de invocações e gatilhos de banco de dados).
- Baseie suas decisões, refatorações e diagnósticos ESTRITAMENTE no que o código ativo está fazendo no momento.
- SEMPRE que examinar o código-fonte e tirar conclusões (como previsões de agendamento ou status lógicos), VALIDE essas conclusões inspecionando os dados reais armazenados no banco de dados em produção usando o Supabase MCP Server (ferramentas como `execute_sql`, `list_tables`, etc).
- SEMPRE que examinar código-fonte, sua auditoria deve ser INTEGRAL e MULTIDISCIPLINAR. Inclua e investigue TODOS os vetores relevantes, abrangendo backend (Node.js, Supabase Edge Functions), frontend (React, Vite), serviços externos integrados (Z-API), rotinas de automação (GitHub Actions, CRONs, arquivos `.yml`), e quaisquer scripts referenciados pelo app (independente da linguagem). Não se limite apenas aos arquivos `.ts` mais óbvios.
