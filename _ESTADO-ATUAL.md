# Status Atual do Projeto — RVM Designações

> **Última Atualização**: 2026-08-29 17:15 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável e Operacional em Produção

---

## 1. Infraestrutura & Deploys

- **Vercel CLI / Deploy**: 🟢 **Ativo & Autenticado**
  - Autenticação permanente configurada via `VERCEL_TOKEN` nas variáveis de ambiente do sistema Windows.
  - Deploys e automações via CLI/MCP acontecem 100% em segundo plano sem solicitações de login no navegador ou 2FA.
- **Ambiente de Produção**: `https://rvm-designacoes-antigravity.vercel.app`
- **Banco de Dados (Supabase)**: Projeto `pevstuyzlewvjidjkmea` (Chave Publishable + Service Role ativas).

---

## 2. Últimas Correções e Evoluções (2026-08-29)

### 📌 Melhorias no Agente Curador IA (Fase 6)
- **Mapeamento Exato de Partes**: A IA (Gemini) foi instruída a retornar o `part_id` exato de cada parte, substituindo a lógica frágil de Fuzzy Matching. 
- **Injeção Temática para Presidente**: O prompt agora avalia o tema central da semana (Leitura da Bíblia, primeiro Tesouros e primeiro Vida Cristã) para definir o perfil sintético do Presidente da Reunião (ex: "Apologista Maduro").
- **Liberação de Tokens**: "Cânticos" e "Orações" foram retirados da análise, evitando cortes de limite de tamanho nas últimas partes da reunião (o bug das partes "Sempre Parando na 8").
- **Fix de Regras Não Renderizadas (Bug Silencioso)**: 
  - **Componente:** `SemanticDraggableGenerator.tsx` e `semanticAgentService.ts`
  - **Causa:** A UI tentava acionar a geração de regras antes das partes da apostila carregarem, enviando uma lista vazia e salvando regras vazias no Supabase. Além disso, a IA às vezes omitia partes "genéricas" (como Leitura da Bíblia), o que fazia a UI ocultá-las.
  - **Solução:** 
    - Trava no `useEffect` aguardando as `parts` estarem populadas.
    - Omissões da IA agora renderizam com uma regra fallback (`Sem restrições da IA. Usando compatibilidade histórica e função.`).
    - Adicionado no Prompt de Sistema da IA a `REGRA DE OURO` forçando a emissão de 1 regra por parte.
    - Implementados os *Empty States* na interface para permitir Forçar Regeneração caso os dados no banco já estivessem corrompidos (vazios).
  - **Resultado**: Recomendações voltaram a ser populadas instantaneamente.

### 📌 Fase 6b — Diagnóstico Profundo e Blindagem do Pipeline do Curador IA
- **Diagnóstico**: O proxy multi-provider (`api/chat.ts`) faz fallback para Mistral/DeepSeek quando o Gemini está em 429, mas esses providers **ignoram `responseSchema`** (exclusivo do Gemini). O resultado é prosa livre que não parseia como JSON, e o erro era engolido silenciosamente.
- **4 Etapas Implementadas**:
  1. **Instrumentação Completa**: 12+ `console.log` estratégicos em todo o pipeline (partes filtradas → modelo usado → resposta bruta → regras parseadas → dict final → salvamento DB → renderização UI).
  2. **Validação Pós-Proxy**: Se a IA retornar 0 regras (ex: provider não-Gemini sem suporte a schema), o sistema **rejeita** a resposta e lança erro explicativo em vez de salvar lixo no banco.
  3. **`hasRules` Robusto**: `checkAndGenerate()` agora verifica `Object.keys(weekData).length > 0` em vez de `!!rules[weekKey]`, evitando que dicionários vazios `{}` sejam aceitos como "já tem regras".
  4. **`thinking_level: 'LOW'`**: Payload do Curador agora força o proxy a priorizar o Gemini Flash (único provider que suporta `responseSchema`).

### 📌 Resolução da Desconexão de Publicadores (Caso Patrick - 2026-08-11)
- **Problema Solucionado**: Sessões sendo derrubadas por hash OAuth obsoletos na URL.
- **Mecanismo da Correção**: `window.history.replaceState` em `src/lib/supabase.ts` e otimização do `TOKEN_REFRESHED`.

---

## 3. Estado do Banco & Módulo RM

- **Publicadores Cadastrados**: 192 publicadores (129 `is_congregated=true`, 63 `false`).
- **Relatórios Mensais**: 2.442+ relatórios no schema `rm.*` (set/2023–jun/2026).
- **Status do Serviço de Campo**: Regras `rm_status_rules_v3` ativas (ATIVO=6/6, IRREGULAR=1-5/6, INATIVO=0/6, RECÉM-CONGREGADO).

---

## 4. Próximos Passos Imediatos

1. Manter monitoramento do acesso dos publicadores via portal e links Z-API.
2. Re-importar `Relatórios Glide.xlsx` quando houver novos dados para sincronização.

---

## 5. Desenvolvimento em Progresso (2026-08-31)

### 📌 Flag: Pausa por Tempo Indeterminado
- **Status:** Em desenvolvimento (Checkpoint criado).
- **Objetivo:** Permitir que o Admin marque um publicador como "Pausado por tempo indeterminado".
- **Comportamento:** O publicador deixa de ser elegível para designações, mas nenhuma flag pré-existente (`requestedNoParticipation`, etc.) é afetada (dados intocados). O publicador não será notificado sobre a ativação desta flag.
- **Automação:** Todo sábado, o robô (Cron) enviará um lembrete apenas para o Admin listando quem está pausado.
