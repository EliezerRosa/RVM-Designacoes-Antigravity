# Copilot — Instruções do Projeto RVM Designações

## AXIOMA: Memória persistente é obrigatória

A cada conversa neste workspace você DEVE:

1. **No início** — Listar `/memories/`, `/memories/session/` e `/memories/repo/` e ler os arquivos relevantes ao tópico antes de agir.
2. **Durante** — Manter uma nota viva em `/memories/session/<assunto>.md` com objetivo, decisões, arquivos tocados (links workspace-relative) e próximos passos. Atualizar a cada marco real.
3. **Ao final de blocos significativos** — Promover aprendizados para:
   - `/memories/repo/<tema>-YYYY-MM-DD.md` se é específico deste workspace,
   - `/memories/<tema>.md` se é preferência transversal do usuário.
4. **Nunca esperar comando explícito** ("salve", "memorize") para gravar. O default é gravar.
5. **A cada bloco lógico fechado, salvar ANTES de prosseguir** — reduz janela de perda por shutdown/crash.
6. **Antes de criar arquivo novo** — Listar primeiro para evitar duplicatas; preferir atualizar.

### O que MERECE memória
- Decisões arquiteturais, restrições descobertas.
- Comandos/paths/configs não-óbvios.
- Erros + soluções (para não repetir).
- Convenções de build/deploy/encoding.
- Gaps e backlog acordados.

### O que NÃO vira memória
- Conversa social/trivial.
- Conteúdo já no código (basta apontar caminho).

## Convenções do repo (referência rápida)

- Path do workspace: `c:\Antigravity - RVM Designações\rvm-designacoes-unified`
- Branch padrão: `main`
- Deploy canônico: https://rvm-designacoes-antigravity.vercel.app
- Encoding: workspace tem `ç` e `ã` no path — usar `&` em comandos Python.
- PowerShell: NUNCA `&&`, sempre `;` para encadear.
- Auditoria: `auditService.logAction` aceita SOMENTE `operation: 'AGENT_INTENT' | 'MANUAL_OVERRIDE' | 'SCRIPT_EXEC'`.
- Cases novos no dispatcher seguem padrão `MANAGE_LOCAL_NEEDS` (subAction string).
- Slash commands usam `requiredAction: AgentActionType` para filtragem via `canExecute()`.
