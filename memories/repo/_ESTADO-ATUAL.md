# Estado Atual do Workspace — Antigravity / RVM Designações

> **Fonte Canônica Principal de RVM**: `_ESTADO-ATUAL.md` (na raiz do repositório `rvm-designacoes-unified/`, prevalece para regras, motor, histórico e pendências de RVM)  
> **Última Atualização**: 2026-10-14 13:30 (BRT)  
> **Responsável Epistêmico**: Eliezer Rosa  
> **Status Geral**: 🟢 Sistema Estável em Produção. Motor de Designações `2026-10-09.05`. Automação Hourglass ativa. Resumo Desacoplado de Próximas Designações Z-API ativo nos envios de S-89 e em Lembretes de Falta de Confirmação (72h / D-9). Textos e formatação de datas (DD/MM/AAAA) teocráticos e cordiais padronizados. Axioma Irrevogável de Memória Multi-IDE ativo e sincronizado.

---

## 1. Visão Geral do Workspace

O repositório unificado reside em `rvm-designacoes-unified/`:
- **Produção**: `https://rvm-designacoes-antigravity.vercel.app` (Vercel CLI autenticado com `VERCEL_TOKEN`).
- **GitHub Pages**: `https://eliezerrosa.github.io/RVM-Designacoes-Antigravity/` (`npm run deploy`).
- **Supabase**: Projeto `pevstuyzlewvjidjkmea`.
- **Último Checkpoint Git RVM**: `ae1629a` (fix: sequenciamento estrito do resumo de designacoes futuras no envio manual S-89 Z-API).

---

## 2. Invariantes Canônicos

1. **Estado Vivo**: Sempre consultar `_ESTADO-ATUAL.md` e manter este `/memories/repo/_ESTADO-ATUAL.md` atualizado in-place.
2. **Resumo Desacoplado de Próximas Designações Z-API**: Se um publicador receber S-89 (manual/lote) OU lembrete de falta de confirmação (`COBRANCA_72H` ou `LEMBRETE_D9` para partes `PROPOSTA`), e possuir $\ge 2$ designações futuras já publicadas, recebe uma mensagem extra desacoplada com o resumo de todas as suas próximas partes, com status e botões de confirmação/recusa rápidos (`send-button-actions` se $\le 3$ botões) ou Lista Interativa gaveta (`send-option-list` se $> 3$ botões), com debounce de 10 min.
3. **AXIOMA IRREVOGÁVEL (Multi-IDE e Sync Remoto)**:
   - Toda a memória de conversas (`/memories/session/`), estado atual (`_ESTADO-ATUAL.md`) e aprendizados correlatos (`/memories/`) DEVE subir para o repositório remoto Git (`git commit` + `git push`) ao final de cada bloco lógico ou sessão, e obrigatoriamente antes de trocar de agente ou IDE.
   - Qualquer agente iniciando conversa em qualquer IDE (VS Code, Cursor, Antigravity, Claude Code) DEVE primeiro ler as memórias antes de agir.
   - O que estiver no `.gitignore` (ex: material de HG em `docs-local/`, dumps de DOM, sessões de browser, tokens/chaves) NUNCA sobe para o remoto.
4. **Motor de Designações**: Regras `2026-10-09.05` em `.agents/workflows/motor-invariants.intent.md` (M-0…M-12). Modelo de decisão lexicográfico por faixas (buckets).
5. **Publicação S-89**: Apenas o SRVM publica via botão manual; Crons D-7 e D-2 exigem registro prévio `PUBLICACAO_S89` com `SUCCESS`.
6. **Isolamento de Segurança**: Pasta `docs-local/`, diretórios de sessão (`hourglass_session/`, `whatsapp_session_data/`) e credenciais nunca sobem para repositórios públicos.
7. **Faturamento BYOK**: Modelo Google com API Key própria consome créditos da Conta RVM Pro (`017DC8-83643E-7F9157`) do Google Developer Program Premium (~R$ 58/mês), preservando a cota do Copilot Pro+/Max.

---

## 3. Pendências Ativas do Projeto

0. **Destino dos arquivos não rastreados** (`scratch/`, `scripts/check_*.ts`): manter no `.gitignore` ou commitar seletivamente.
1. **Alerta de Desconexão Z-API (P10)**: Implementar monitoramento ativo de webhooks (`on-disconnected`) para alertar SRVM caso o celular da congregação fique offline.
2. **Monitor Canônico 2.0 (P2)**: Criar tabela `system_canonical_events` e consolidar observabilidade 360º.
3. **Integração Sentry (P5)**: Instalar telemetria técnica de APM.
4. **Evolução Cognitiva (A1-A6)**: Habilitar `pgvector` no Supabase e avançar para motor de perfis.
5. **Vedação de Tela Legada (`CommunicationTab.tsx`)**: Tranca de `logDispatch` vs aposentadoria do Chatbot para S-89.
6. **Log Canônico do Pacote S-140**: Implementar no `s140PackageService` o registro canônico estrito dos envios em lote (PDF) e emergenciais para os Responsáveis pelo Quadro.
