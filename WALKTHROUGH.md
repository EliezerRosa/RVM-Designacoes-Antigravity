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

-   **Sincronização de Prompt**: O Agente agora conhece e usa corretamente os comandos `FETCH_DATA` e `UPDATE_PUBLISHER` através de um System Prompt recalibrado.
-   **Robustez de Parâmetros**: O motor de ações (`agentActionService.ts`) agora aceita parâmetros simplificados, tratando falhas onde o Agente enviava dados sem a estrutura de objeto aninhada.
-   **Estabilidade de Build**: Reescrita técnica dos serviços de Agente para eliminar erros de stream/caracteres corrompidos que impediam o deploy no Windows e CI/CD.
-   **Deploy OK**: Build de produção gerado e publicado via GitHub Pages e Vercel com sucesso.
