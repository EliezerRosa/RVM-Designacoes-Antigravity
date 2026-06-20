# Agent Context Builder - Lessons Learned & Architecture Notes

## 1. O Crash "Cannot read properties of undefined (reading 'length')"

### Contexto
Em junho de 2026, a aplicação apresentou um bug onde o agente no `TemporalChat` respondia imediatamente:
`❌ Erro: Cannot read properties of undefined (reading 'length')`
para qualquer prompt enviado. O balão de chat exibia apenas esta mensagem sem o *stack trace* (rastro do erro), dificultando o debug.

### Root Cause Analysis (Análise de Causa Raiz)
1. **O Stack Trace Oculto**: O erro aparecia sem o *stack trace* na UI porque a exceção era lançada durante a montagem prévia e capturada pelo bloco `catch (err: any)` de fallback do componente `TemporalChat.tsx`. Este bloco exibe apenas `err.message` na UI para o usuário, mas joga o rastro completo no `console.error` do navegador.
2. **O Culpado**: Ao extrair o erro minificado do console do navegador (que apontava para as funções `eO` -> `lO`), identificamos que o *crash* ocorria dentro da função `summarizePublisher` em `src/services/contextBuilder.ts`.
3. **O Gatilho de Dados Corrompidos**: A linha exata que causava o crash era:
   ```typescript
   if (!p.canPairWithNonParent && p.parentIds.length > 0) restrictions.push('ApenasComPais');
   ```
   Se um publicador estivesse salvo no banco de dados (Supabase) com a propriedade `parentIds` como `null` ou `undefined` (provavelmente devido a dados legados ou importação parcial), a tentativa de ler `p.parentIds.length` disparava um erro fatal (*TypeError*).
4. **Por que pareceu um problema de Permissão**: O erro ficou em evidência logo após uma alteração que permitiu ao nível `Ajd SRVM` visualizar a aba Apostila, forçando o processamento da lista completa de publicadores para aquele usuário. A falha, contudo, era uma bomba-relógio de dados no banco e poderia ter ocorrido a qualquer momento no passado quando a IA tentasse processar a ficha daquele publicador corrompido.

### A Correção (Commit `e35c8d1`)
Foi aplicada uma checagem defensiva de *fallback* para um array vazio:
```typescript
// Seguro contra acesso de propriedade em dados indefinidos/nulos
if (!p.canPairWithNonParent && (p.parentIds || []).length > 0) restrictions.push('ApenasComPais');
```
Todas as leituras de array no `contextBuilder.ts` e `agentService.ts` devem usar programação defensiva (`|| []` ou `?.length`) ao interagir com propriedades que vêm do banco.

### Lições e Boas Práticas para o Futuro
- **Mapeamento Defensivo de Dados**: Assuma sempre que arrays retornados do banco (colunas JSONB) podem ser `null` ou `undefined` ao invés de estarem propriamente tipados como `[]`.
- **Tratamento de Erro no Chat**: Quando o balão da IA exibir um erro sem *stack trace*, o erro sempre estará no console do navegador (F12). O `TemporalChat.tsx` limpa a visualização para o usuário, mas logs úteis ficam no painel do desenvolvedor.
- **Debugging Minificado**: Ao analisar *crashes* em produção na Vercel, utilize *builds* locais determinísticos (`npm run build`). As variáveis minificadas (como `eO` e `lO`) batem perfeitamente com os builds locais, permitindo rastrear facilmente a origem do erro no código fonte real mapeado.
