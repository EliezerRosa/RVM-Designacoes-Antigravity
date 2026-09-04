# Walkthrough — RVM Designações Unificado

## Arquitetura Atual (Fev/2026)

### Fonte da Verdade

- **Dados**: Supabase (PostgreSQL) — tabela `workbook_parts` como entidade central.
- **Publicadores**: Tabela `publishers` no Supabase.
- **Histórico**: Derivado de partes concluídas via `historyAdapter.ts` (sem tabela separada).

### Abas do Sistema

| Aba | Componente | Função |
| --- | --- | --- |
| 📖 Apostila | `WorkbookManager.tsx` | Importação, visualização, edição e geração |
| ✅ Aprovações | `ApprovalPanel.tsx` | Fluxo de revisão por anciãos |
| 👥 Publicadores | `PublisherList.tsx` | Cadastro e gestão |
| 💾 Backup | `BackupRestore.tsx` | Exportação/importação completa |
| 📊 Admin | `AdminDashboard.tsx` | Monitoramento de custos e saúde |
| 🤖 Agente | `PowerfulAgentTab.tsx` | Chat IA + Painel de Controle + Scores |
| 💬 Comunicação | `CommunicationTab.tsx` | Hub de histórico e envio de mensagens |

### Fluxo de Dados

1. **Importação**: Excel → `WorkbookPart` (status: `PENDENTE`).
2. **Geração**: Motor (`generationService.ts`) → `resolvedPublisherName` (status: `PROPOSTA`).
3. **Aprovação**: Ancião confirma → status: `APROVADA`/`DESIGNADA`.
4. **Comunicação**: Agente ou Humano → `SEND_S140`/`S89` → `notifications` (Supabase).
5. **Histórico**: Derivado de `workbook_parts` concluídas via `historyAdapter.ts`.

### Componentes-Chave

| Módulo | Responsabilidade |
| --- | --- |
| `App.tsx` | Estado global, realtime sync, roteamento de abas |
| `workbookService.ts` | Runtime base da apostila consumido pelos boundaries de leitura/escrita |
| `communicationService.ts` | Registro e preparação de mensagens (Zap) |
| `generationService.ts` | Motor de designação (rodízio + elegibilidade) |
| `agentActionService.ts` | Tradução de intenções do Agente em comandos (v10) |

### Agente RVM (Fase 3 — Comunicação Contextual 3.1)

O fluxo de comunicação foi refatorado para ser totalmente contextual no Modal "Zap":

- **`SEND_S140` / `SEND_S89`**: Agora abrem um modal de edição por linha diretamente no Agente.
- **Filtragem Inteligente**: Inclui a parte do **Presidente** e **Oração Final**, mas oculta **Elogios e Conselhos** e cânticos.
- **Saudações Personalizadas**: As mensagens aplicam automaticamente "Prezado irmão" ou "Prezada irmã" com base no gênero do publicador.
- **Integração de Parceiros**: Mensagens para Titular informam o telefone do Ajudante (e vice-versa) com incentivo ao contato.
- **Rastreio de Status**: O modal exibe "Enviado em [Data/Hora]" para evitar envios duplicados, além de tooltip com o histórico da mensagem.

### Infraestrutura Necessária (SQL)

Caso a tabela de notificações não exista, execute este SQL no editor do Supabase:

```sql
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    type TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT,
    title TEXT,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PREPARED',
    metadata JSONB DEFAULT '{}'::jsonb,
    action_url TEXT
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Políticas para anon e authenticated (Frontend usa anon_key)
CREATE POLICY "Permitir leitura para todos"
ON public.notifications FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Permitir inserção para todos"
ON public.notifications FOR INSERT
TO anon, authenticated
WITH CHECK (true);

GRANT ALL ON public.notifications TO anon, authenticated;
```

### Deploy

- **Hospedagem**: Vercel.
- **CI/CD**: GitHub Actions — build + deploy automático no push para `main`.
- **Dica de Build**: Se o build falhar com "Unexpected character" ou "Stream error", limpe o cache (`rm -rf node_modules/.vite`) e verifique se os arquivos de serviço estão salvos como UTF-8 sem BOM.

---

## Versão 4.0 - Expansão de Visão e Ação (DBA Power)

Nesta versão, o Agente recebeu autonomia estruturada para gerenciar dados em nível de engenharia, garantindo transparência total via auditoria.

### 1. Visão Total via `FETCH_DATA`

O Agente agora possui uma ferramenta de consulta genérica que permite explorar qualquer sub-contexto do banco Supabase que não esteja no resumo inicial do app.

- **Contextos mapeados**: Pessoas, Programação, Comunicação, Territórios e Auditoria.
- **Uso**: Consultas dinâmicas via `dataDiscoveryService.ts`.

### 2. Infraestrutura de Auditoria de Agente

Implementamos um rastro de auditoria padronizado para todas as ações do Agente.

- **`audit_log`**: Nova tabela no Supabase que registra `AGENT_INTENT`.
- **Rastreabilidade**: Toda alteração de privilégios, disponibilidades ou regras do motor feita pelo Agente é documentada com a descrição da intenção.

### 3. Nível 3: Scripts Empoderados

Estabelecemos o uso de scripts TypeScript (`scripts/*.ts`) que rodam com privilégios de `Service Role` para operações de manutenção pesada, como limpezas de logs e configurações de gatilhos SQL.

---

## Versão 4.1 - Sincronização e Robustez do Agente (Fix de Produção)

Esta atualização corrige os erros de build e as falhas de comando do Agente In-App identificadas após a expansão da v4.0.

- **Sincronização de Prompt**: O Agente agora conhece e usa corretamente os comandos `FETCH_DATA` e `UPDATE_PUBLISHER` através de um System Prompt recalibrado.
- **Robustez de Parâmetros**: O motor de ações (`agentActionService.ts`) agora aceita parâmetros simplificados, tratando falhas onde o Agente enviava dados sem a estrutura de objeto aninhada.
- **Estabilidade de Build**: Reescrita técnica dos serviços de Agente para eliminar erros de stream/caracteres corrompidos que impediam o deploy no Windows e CI/CD.
- **Deploy OK**: Build de produção gerado e publicado via GitHub Pages e Vercel com sucesso.

---

## Versão 4.2 - Tuning Cognitivo (Visibilidade e Resiliência)

Esta atualização foca na experiência de chat e na consistência das respostas do Agente.

- **Visibilidade Forçada**: O Agente agora está proibido de recusar listar dados. Ele usará tabelas Markdown para listar publicadores e resultados de busca, paginando se necessário.
- **Precedência de Ação**: Resolvido o conflito onde o Agente duvidava de suas próprias ações devido ao cache do sistema. Ele agora prioriza o sucesso imediato da ferramenta sobre o contexto textual.
- **Mensagens Descritivas**: O motor de ações retorna detalhes mais claros (ex: "[APTO]" ou "[INAPTO]"), ajudando o Agente a manter a coerência no turno seguinte.
- **Sanitização de Código**: Removidos caracteres não-ASCII que causavam instabilidade no `esbuild` em ambientes Windows.

---

## Fase 5 — Arquitetura de Múltiplos Impactos (Eventos Especiais)

A Fase 5 refatorou profundamente a forma como os Eventos Especiais afetam a programação (Pauta), transitando de uma relação 1:1 (um evento = uma ação) para suportar Múltiplos Impactos através do uso da coluna JSONB `impacts` no Supabase.

### 1. Modelo de Dados (`JSONB`)

O banco de dados foi atualizado para armazenar um array flexível de impactos em cada evento especial. Isso garante compatibilidade retroativa com campos legados (`affectedPartIds`, `targetPartId`, `overrideAction`) enquanto abre o caminho para N-Impactos simultâneos (ex: Reduzir tempo da parte X e Cancelar a parte Y).

### 2. Interface de Usuário (`SpecialEventsManager.tsx`)

O formulário de eventos agora renderiza um painel dinâmico, permitindo ao secretário adicionar várias "Ações" ao mesmo evento. Além disso, o suporte a _Fallback_ assegura a visualização ininterrupta de eventos velhos do BD.

### 3. Mecanismo de Aplicação (`specialEventService.ts`)

As funções-chave (`markPendingImpact` e `applyEventImpact`) foram submetidas a loops no lado do servidor para varrer o array `event.impacts`. O motor entende quais partes reduzir, focar, ou cancelar interativamente.

### 4. Notificações Dinâmicas (`communicationService.ts`)

O preparador do WhatsApp (S-89) agora decifra o JSONB e agrupa as observações de impacto. Ao enviar o cartão a um irmão, ele será avisado assertivamente se a sua parte em específico sofreu redução de tempo ou modificações drásticas baseadas nos múltiplos impactos da semana.

---

## Fase 5.b — Enriquecimento de Eventos Especiais

A Fase 5.b expandiu a arquitetura N-N dos Eventos Especiais para permitir maior especificidade e flexibilidade.

- **Múltiplas Partes por Impacto de Tempo**: A UI e o Backend agora usam `targetPartIds` (Array), permitindo que um único impacto de `REDUCE_VIDA_CRISTA_TIME` atinja N partes simultaneamente com o uso de checkboxes.
- **Validação Cruzada Múltipla**: Partes canceladas por impacto principal (`REPLACE_PART`) na UI agora ficam imediatamente inativas (rasuradas) para os selectores secundários de redução de tempo dentro do mesmo evento.
- **Impacto Neutro / Invisível**: A opção informativa "Nenhum Impacto" foi otimizada para ser a principal de _templates_ como Anúncios e Notificações, preenchendo as comunicações, mas ignorando alterações nos blocos reais da apostila.
- **Campo `Observações`**: Uma propriedade formal de notas de rodapé opcional, injetada em S-89/S-140 via geradores do `communicationService`.

---

## Fase 6 — Melhorias no Agente Curador IA (Analista Semântico)

As correções no Agente Curador IA (Analista Semântico) foram implementadas e enviadas para produção. Abaixo está o resumo das entregas e como elas afetam o funcionamento do sistema:

### 1. Problema das Partes "Sempre Parando na 8" Resolvido
O "buraco negro" que engolia as últimas partes da reunião ou criava blocos em branco foi corrigido substituindo a lógica frágil de "Fuzzy Matching" de títulos por um mapeamento exato usando `part_id`.

- **O que mudou**: A IA agora é instruída a ler o `ID` exato de cada parte e retornar esse `ID` no JSON de recomendação. 
- **Como a UI reage**: O frontend no `SemanticDraggableGenerator` agora primeiro busca a regra pelo ID exato da parte (`weekRules[part.id]`), garantindo que não importa quão genérico seja o título retornado pela IA, ela sempre vai preencher o card correto.
- **Performance**: Retiramos os "Cânticos" da análise, o que libera tokens (espaço de texto) para a IA processar partes mais úteis, evitando que ela "corte" a resposta por limite de tamanho nas últimas partes.

### 2. Injeção Temática para o "Presidente"
O "Presidente" agora será analisado sob a perspectiva do *tema da semana*, em vez de ser lido como uma função cega.

- **O que mudou**: Antes de enviar as partes para a IA, o sistema varre a semana e captura os títulos da **Leitura da Bíblia**, do primeiro **Discurso de Tesouros** e da primeira **Parte de Nossa Vida Cristã**.
- **Como a IA usa isso**: O sistema injeta um bloco `TEMÁTICA GERAL DA REUNIÃO` no prompt, e instrui a IA explicitamente: *"Para a parte de 'Presidente da Reunião', analise a TEMÁTICA GERAL da reunião e defina um perfil_sintetico e foco alinhados ao tema."*
- **Resultado Prático**: Você começará a ver a IA sugerindo presidentes com o perfil "Conselheiro Experiente" se o tema da reunião for família, ou "Apologista Maduro" se for defesa da fé, embasado nos temas dos discursos daquela semana.

### 3. Blindagem contra Alucinações de Perfis Sintéticos (Fase 6c)
Quando a API principal (Gemini) falha por limite de cota, o orquestrador (`api/chat.ts`) redireciona o prompt para modelos de fallback (como o Mistral). Como o Mistral possui um parsing mais flexível das instruções, ele ocasionalmente inventa `perfis_sinteticos` que não estão mapeados no sistema (ex: `pesquisador_entusiasta`, `apoio_organizado`).

- **O Problema**: A UI e o motor recebiam esse perfil desconhecido, e como não havia lógica para ele, a pontuação retornada para os publicadores era `0`. Com todos os publicadores zerados, a UI não exibia nenhuma sugestão (lista vazia).
- **A Solução**: O motor (`semanticRulesService.ts`) agora intercepta "perfis alucinados". Se ele detectar um nome não oficial no schema, em vez de retornar zero, ele aplica um bônus dinâmico de mitigação (fallback genérico).
- **Resultado Prático**: A IA continuará gerando designações robustas mesmo nos cenários em que inventa parâmetros devido a fallbacks de proxy, garantindo que o secretário sempre receba sugestões válidas na UI e o Card não fique sem resultados.

---

## Fase 7 — Agente Curador de IA, Base de Conhecimento Permanente & Casting Semântico Híbrido

A Fase 7 estabeleceu uma evolução arquitetural profunda no processo de curadoria de designações, introduzindo agentes especializados contínuos, persistência relacional de inteligência semântica e interface ergonômica não-intrusiva:

### 1. Ergonomia do Botão Flutuante e Retrátil (`SemanticDraggableGenerator.tsx`)
- **Docking no Rodapé Esquerdo**: Ao entrar em qualquer semana na apostila, o botão do Curador IA é acoplado automaticamente no canto inferior esquerdo da tela.
- **Visual Retrátil**: Exibe um badge minimalista e elegante com a contagem de regras ativas (`X partes mapeadas`). Permanece recolhido para não disputar atenção com a tabela da reunião, expandindo o modal apenas sob demanda/clique.
- **Arrasto Suave (Drag & Drop)**: O usuário pode arrastar o botão livremente para qualquer canto da tela de acordo com seu fluxo de trabalho. Ao mudar de semana, o botão reinicializa suavemente na posição padrão (rodapé esquerdo).

### 2. Filtro de Desbloqueio e Elegibilidade Canônica
- **Semana em Foco & Avaliação Individual**: A curadoria de casting é executada estritamente semana a semana, avaliando cada parte da reunião de forma individual.
- **Elegíveis Desbloqueados**: A lista de candidatos apresentada pelo Curador é alimentada exclusivamente por `getRankedEligibleForPart()`. Isso garante que todas as restrições canônicas do motor (privilégios, gênero, cooldown rotacional, disponibilidade, restrições e exclusões) já venham rigorosamente aplicadas. Nenhum irmão inelegível pode ser sugerido.

### 3. Agente Especialista de Lote (`curatorBatchSpecialistAgent.ts`)
- **Meta-Análise Automática**: Ao importar um novo lote de apostilas via `WorkbookManager.tsx` (ou sob demanda pelo botão "Especializar Lote"), um agente dedicado analisa todo o conjunto de semanas usando Gemini Flash (com fallback resiliente).
- **Descoberta Temática**: Identifica temas bíblicos dominantes (ex: o ciclo profético de Jeremias nos meses de Setembro e Outubro de 2026, com foco em coragem perante oposição, integridade e obediência).
- **Enriquecimento Contínuo**: O agente gera novos perfis quando necessário ou enriquece perfis existentes com *insights* contextuais e práticos da congregação.

### 4. Base de Conhecimento Permanente de Perfis (Supabase)
- **Tabela `curator_profiles`**: 16+ perfis típicos canônicos (ex: *Instrutor Bíblico Eloquente, Conselheiro Amoroso, Jovem Exemplar, Pioneiro Zeloso, Orador Dinâmico*) armazenados com traços ideais, traços a evitar, palavras-chave e insights práticos.
- **Tabela `curator_batch_insights`**: Histórico permanente de análises temáticas por lote de apostilas importado.
- **Serviço Centralizado**: [`curatorKnowledgeBaseService.ts`](file:///src/services/curatorKnowledgeBaseService.ts) realiza o carregamento dinâmico e caching em memória, permitindo que a congregação evolua seu vocabulário de casting continuamente.

### 5. Multi-Select (+1) no Cadastro de Publicadores (`PublisherForm.tsx`)
- **Atribuição Qualitativa**: O formulário de publicador agora possui um seletor dinâmico em grade de chips/tags conectado diretamente à Base de Conhecimento.
- **Múltiplos Perfis**: O secretário/ancião pode associar 1, 2 ou mais perfis sintéticos a cada irmão (ex: associar "Instrutor Bíblico Eloquente" e "Conselheiro Amoroso" a um mesmo ancião experiente).
- **Persistência em JSONB**: Os IDs dos perfis são persistidos com segurança no campo `syntheticProfiles?: string[]` dentro do payload serializado do publicador no Supabase.

### 6. Curador Híbrido: Ponto de Partida Determinístico + Flexibilidade Contextual
- **Ponto de Partida Determinístico**: Quando a regra semântica de uma parte demanda um perfil específico e um publicador elegível possui esse perfil atribuído em seu cadastro, o motor semântico (`semanticRulesService.ts`) concede um bônus expressivo (+300 pontos) e exibe o badge `💎 Perfil Atribuído no Cadastro`.
- **Flexibilidade Humana Preservada**: O Curador **NÃO** oculta nem bloqueia os demais elegíveis da semana. Todos os irmãos aptos para a parte continuam ranqueados e acessíveis para escolha, combinando a precisão do perfil cadastrado com a sensibilidade de quem está designando.
- **Isolamento Absoluto do Motor "Gerar"**: O motor principal de rodízio automático (`unifiedRotationService.ts`) permaneceu 100% inalterado. O Curador opera como uma camada de assessoria analítica, sem jamais gerar efeitos colaterais na rotação automática de fundo.

