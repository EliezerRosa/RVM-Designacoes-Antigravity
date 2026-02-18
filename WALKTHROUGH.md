# Walkthrough — RVM Designações Unificado

## Arquitetura Atual (Fev/2026)

### Fonte da Verdade
- **Dados**: Supabase (PostgreSQL) — tabela `workbook_parts` como entidade central.
- **Publicadores**: Tabela `publishers` no Supabase.
- **Histórico**: Derivado de partes concluídas via `historyAdapter.ts` (sem tabela separada).

### Abas do Sistema

| Aba | Componente | Função |
|---|---|---|
| 📖 Apostila | `WorkbookManager.tsx` | Importação, visualização, edição e geração |
| ✅ Aprovações | `ApprovalPanel.tsx` | Fluxo de revisão por anciãos |
| 👥 Publicadores | `PublisherList.tsx` | Cadastro e gestão |
| 💾 Backup | `BackupRestore.tsx` | Exportação/importação completa |
| 📊 Admin | `AdminDashboard.tsx` | Monitoramento de custos e saúde |
| 🤖 Agente | `PowerfulAgentTab.tsx` | Chat IA + S-140 + Painel de Controle |

### Fluxo de Dados
1. **Importação**: Excel → `WorkbookPart` (status: `PENDENTE`).
2. **Geração**: Motor (`generationService.ts`) → `resolvedPublisherName` (status: `PROPOSTA`).
3. **Aprovação**: Ancião confirma → status: `APROVADA`/`DESIGNADA`.
4. **Histórico**: Derivado de `workbook_parts` concluídas via `historyAdapter.ts`.

### Componentes-Chave

| Módulo | Responsabilidade |
|---|---|
| `App.tsx` | Estado global, realtime sync, roteamento de abas |
| `workbookService.ts` | CRUD de partes + paginação Supabase |
| `generationService.ts` | Motor de designação (rodízio + elegibilidade) |
| `mappings.ts` | Constantes centralizadas (tipos, modalidades, filtros) |
| `s140GeneratorUnified.ts` | Geração de S-140 Room B A4 |
| `cooldownService.ts` | Lógica de rodízio baseada em histórico |

### Agente RVM (PowerfulAgentTab)
Layout de 3 colunas:
1. **S-140 Preview** (`S140PreviewCarousel.tsx`) — Navegação visual por semana.
2. **Chat Temporal** (`TemporalChat.tsx`) — IA com contexto de publicadores, partes e histórico.
3. **Painel de Controle** (`ActionControlPanel.tsx`) — Scores, explicações e ações.

### Deploy
- **Hospedagem**: GitHub Pages.
- **CI/CD**: GitHub Actions (`deploy.yml`) — build + deploy automático no push para `main`.
- **API IA**: Serverless Function protegendo a chave Gemini.
