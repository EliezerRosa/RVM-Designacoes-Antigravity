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
|---|---|
| `App.tsx` | Estado global, realtime sync, roteamento de abas |
| `workbookService.ts` | CRUD de partes + paginação Supabase |
| `communicationService.ts` | Registro e preparação de mensagens (Zap) |
| `generationService.ts` | Motor de designação (rodízio + elegibilidade) |
| `agentActionService.ts` | Tradução de intenções do Agente em comandos (v10) |

### Agente RVM (Fase 3 - Habilidades Comunicativas)
O Agente agora possui "braços" para agir fora do banco de dados:
- **`SEND_S140`**: Prepara a mensagem do grupo da semana e registra no Hub.
- **`SEND_S89`**: Prepara cartões individuais e gera links diretos para o WhatsApp.
- **`UPDATE_AVAILABILITY`**: Registra datas de viagem e bloqueia o motor automaticamente.

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
CREATE POLICY "Permitir leitura para autenticados" ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir inserção para autenticados" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
```

### Deploy
- **Hospedagem**: Vercel.
- **CI/CD**: GitHub Actions — build + deploy automático no push para `main`.
- **Dica de Build**: Se o build falhar com "Unexpected character" ou "Stream error", limpe o cache (`rm -rf node_modules/.vite`) e verifique se os arquivos de serviço estão salvos como UTF-8 sem BOM.
