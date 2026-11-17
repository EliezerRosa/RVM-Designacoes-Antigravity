# Nota de Sessão — Importação Nativa JW.ORG na Apostila e Auditoria de Crons

- **Data/Hora**: 2026-11-17 07:05 (BRT)
- **Responsável Epistêmico**: Eliezer Rosa
- **Escopo**:
  1. Diagnóstico da ausência da semana de 14–20/12/2026.
  2. Implementação do botão nativo `📥 Importar JW.ORG` na barra de ferramentas da Aba Apostila.
  3. Auditoria do comportamento das rotinas de Cron (GitHub Actions e Supabase).
  4. Sincronização canônica e prontidão total para transição de agentes/IDEs.

---

## 1. Diagnóstico da Semana de 14–20/12/2026
- **Investigação Fática no Supabase**:
  - `workbook_batches` continha lotes importados em 01/11/2026 com intervalo de 27s entre a semana de 07/12 e a de 21/12, comprovando que 14/12 havia sido pulada na seleção e nunca fora gravada no banco.
  - A UI da Aba Apostila apenas refletia o banco (`workbook_parts`), não se tratando de bug de exibição.
- **Identificação do Gap de UX**:
  - O modal de busca e extração no JW.ORG (`WorkbookImportModal.tsx`) já existia, mas estava plugado unicamente ao orquestrador de modais do Agente (`AgentModalHost.tsx`).
  - Ao tentar abrir via chat do Agente, uma falha de autorização (`HTTP 403` na rota `/api/chat` na Vercel) impedia o acesso ao modal.

---

## 2. Implementação do Botão Nativo (Opção 3.1)
- **Modificações Cirúrgicas**:
  - `src/components/WorkbookToolbar.tsx`: Adicionada prop `onOpenImportModal?: () => void;` e o botão `📥 Importar JW.ORG` posicionado ao lado de `📊 Carregar Excel`.
  - `src/components/WorkbookManager.tsx`: Gerenciamento do estado `isImportModalOpen`, integração com `WorkbookImportModal` e recarregamento automático das partes com filtros.
- **Validações**:
  - `npm run build`: Compilação de produção com Vite bem-sucedida.
  - `npm test`: 144/144 testes unitários aprovados (`pass 144, fail 0`).
  - Deploy publicado no GitHub Pages (`gh-pages -d dist`).

---

## 3. Estado Atual das Semanas de Dezembro/2026
- **Semana 14–20 de Dezembro (`2026-12-14`)**:
  - Importada com sucesso às 23:44:55 UTC (22 partes cadastradas no JW.ORG, 100% `PENDENTE`, sem designados).
- **Semana 21–27 de Dezembro (`2026-12-21`)**:
  - Resetada e limpa às 23:47:14 UTC (24 partes cadastradas, 100% `PENDENTE`, sem designados).
- **Harmonia Temporal**:
  - Ambas as semanas prontas para a geração do motor de designações em ordem cronológica (14/12 -> 21/12), com histórico sintético ativando regras de cooldown e impedindo repetições consecutivas.

---

## 4. Perspectiva dos Crons (GitHub Actions e Supabase)
- **GitHub Actions (`headless-bot.yml` às 09:30 BRT)**:
  - `diffDays` de 14/12 (~28 dias) e 21/12 (~35 dias) enquadram-se na janela D-30 (22 a 35 dias).
  - Como ambas estão vazias (`PENDENTE`), o bot executará a **Geração Antecipada Automática (D-30)** gerando rascunhos em status `PROPOSTA` e notificará a liderança (Admin, SRVM e Ajudantes) no WhatsApp.
  - Publicação automática (D-21) só ocorrerá a partir de 23/11 (14/12) e 30/11 (21/12).
- **Supabase (`cron-whatsapp-reminders` às 09:00 BRT)**:
  - Ignora semanas não publicadas. Zero cobranças ou lembretes serão enviados antes da publicação oficial.
- **Boletim PDF (`status-pdf-bot.yml`)**:
  - Ignora semanas não publicadas.

---

## 5. Prontidão para Transição
- Repositório local e remoto sincronizados (`origin/main`).
- Árvore de trabalho 100% limpa.
