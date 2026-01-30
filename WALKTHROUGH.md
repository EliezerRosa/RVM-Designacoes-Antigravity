# Walkthrough - RVM Designações Unificado

## Status Atual: Arquitetura Limpa (v2.0)
Após uma refatoração profunda em **30/12/2025**, o sistema foi simplificado radicalmente. Funcionalidades legadas, códigos duplicados e interfaces não utilizadas foram removidos.

### O que foi removido?
- **Dashboard Legado:** Removido (foco na gestão direta).
- **Relatórios:** Removidos (dados descentralizados).
- **Abas de Designação/S-89:** Removidas.
- **Sistema de Participações (Legacy):** Interface `Participation`, tabela `participations` (no código) e serviços CRUD relacionados foram extirpados.
- **Duplicidade de Dados:** O sistema agora opera EXCLUSIVAMENTE sobre `WorkbookPart` como fonte da verdade.

### Arquitetura Atual
O aplicativo foca em TRÊS pilares principais:

1.  **Apostila (`WorkbookManager`):**
    *   Importação de Excel/PDF.
    *   Visualização e edição de partes.
    *   Processo de designação usando o Motor.
    *   **Fonte da Verdade:** Tabela `workbook_parts` no Supabase.

2.  **Aprovações (`ApprovalPanel`):**
    *   Anciãos revisam propostas feitas pelo motor ou outros usuários.

3.  **Publicadores (`PublisherList`):**
    *   Gestão de cadastro e privilégios.

### Fluxo de Dados
1.  **Importação:** Arquivo Excel -> `WorkbookPart` (status: PENDENTE).
2.  **Designação:** Usuário/Motor -> `resolvedPublisherName` (status: PROPOSTA).
3.  **Aprovação:** Ancião confirma -> (status: APROVADA/DESIGNADA).
4.  **Histórico:** O histórico é derivado DIRETAMENTE das partes concluídas/designadas (`workbook_parts`). Não existe mais tabela separada de histórico.

### Componentes Chave
- `App.tsx`: Gerenciador de estado simplificado.
- `api.ts`: Camada fina para `publishers` e settings.
- `workbookService.ts`: Lógica pesada de designação.
- `cooldownService.ts`: Lógica de rodízio baseada em `HistoryRecord` (adaptado de `WorkbookPart`).

### Agente Poderoso (Agente RVM)
Implementado em **Jan/2026**, o Agente RVM agora é uma "Aba Poderosa" integrada:
- **Chat Temporal:** Mantém histórico de 14 dias persistente no navegador.
- **Contexto Rico:** O agente "vê" quem são os publicadores, regras e estatísticas.
- **Segurança (Vercel):** As chamadas API agora passam por uma *Serverless Function* (`api/chat.ts`), protegendo a chave do Gemini em produção.
- **Ações Ativas:** O agente pode **SIMULAR** designações. Ao pedir "Simule que o irmão X fará a parte Y", o sistema:
    1.  Detecta a intenção.
    2.  Executa a lógica em memória em `agentActionService.ts`.
    3.  Atualiza o carrossel de visualização com um badge "Simulação Ativa".
    4.  Navega automaticamente para a semana relevante.

### Correções Recentes
1.  **Tela Branca Local:** Corrigido `vite.config.ts` para detectar modo de desenvolvimento (`npm run dev`) e servir na raiz, evitando conflito de base path.
2.  **Erro de Tipos:** Corrigido erro de importação em `agentActionService.ts` (`import type` para interfaces), resolvendo crash do navegador.
3.  **Deploy Vercel:** Configurado para funcionar na raiz, mas **Requer Configuração de Variável de Ambiente** (`GEMINI_API_KEY`) no painel da Vercel para funcionar (erro 500 atual).

### Próximos Passos
- Validar simulação em produção após configuração da chave.
- Implementar "Confirmar" ação (efetivar no banco).
- Testar geração de PDF.

### Fase 6: Ferramentas do Agente & Inspetor UI (Jan/2026)
Implementado sistema de transparência total ("X-Ray") e capacidades analíticas para o Agente.

#### 1. Ferramentas do Agente (`CHECK_SCORE`)
O Agente agora possui uma "Tool" real conexa ao cérebro do sistema:
- **Fluxo:** Usuário pergunta "Quem é o melhor para Leitor?" -> Agente invoca `CHECK_SCORE` -> Sistema roda `getRankedCandidates` com histórico completo -> Agente recebe relatório detalhado e responde.
- **Diferencial:** O Agente não "alucina" mais baseando-se apenas no contexto curto; ele consulta o motor matemático.

#### 2. Inspetor UI ("Raio-X")
Na aba "Agente Poderoso", ao clicar em uma parte, o painel de controle agora exibe:
- **Pontuação Científica:** Mostra os componentes exatos do cálculo (Base, Bônus de Tempo Exponencial, Penalidade de Frequência).
- **Feedback Visual:** Explica POR QUE um irmão tem aquela pontuação, eliminando a "caixa preta" do algoritmo.

#### 3. Unificação
- Removidos serviços legados (`linearRotationService`, `fairRotationService`).
- O sistema agora usa exclusivamente `generationService` e `unifiedRotationService`.
