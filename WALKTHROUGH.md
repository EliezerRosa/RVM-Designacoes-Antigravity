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

### Próximos Passos
- Implementar geração de PDF (S-140) direto do `WorkbookManager`.
- Refinar lógica de Eventos Especiais.
