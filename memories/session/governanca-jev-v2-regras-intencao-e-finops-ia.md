# Registro de Sessão — Governança Jev v2, Regras de Intenção e FinOps de IA

> **Data**: 2026-10-16 / 2026-10-17  
> **Participantes**: Eliezer Rosa, Antigravity IDE (Pair Programmer), Roo Code (Executor Auxiliar)  
> **Escopo**: Calibração do Verificador de Diffs Jev, Blindagem de Regras Canônicas, Investigação Forense de Custos do OpenRouter e Governança Multi-IDE.

---

## 1. Contexto e Objetivos da Sessão
1. **Segurança e Isolamento Multi-IDE**:
   - Auditoria de visibilidade do Roo Code (extensão agêntica de VS Code / Antigravity IDE).
   - Constatou-se que o `.gitignore` protege os arquivos contra commits, mas extensões agênticas conseguem ler arquivos abertos/diretos a menos que haja um arquivo **`.rooignore`**.
   - Criado e sincronizado `.rooignore` na raiz e no projeto bloqueando `.env`, `.env.*`, `supabase/.env` e pastas sensíveis.

2. **Consolidação das Regras de Intenção (`memories/regras-intencao.md`)**:
   - Escrito e formalizado o documento de 51 linhas com todas as invariantes canônicas:
     * Motor por faixas (buckets) lexicográficos (M-0), sem pontuação aditiva.
     * Validação bidirecional de gênero e parentesco (Titular ↔ Ajudante) regras `2026-10-15.01`.
     * Primazia de irmãs em demonstrações fora da seca de anciãos/SM (M-4).
     * Módulo Relatório Mensal (RM): eixos ortogonais de membresia e campo (I-0), ano de serviço teocrático (I-1).
     * Convenções de código: TypeScript estrito sem `any`/`@ts-ignore`, suite de testes obrigatória.
     * Segurança: proibição de commits/push automáticos sem consentimento explícito.

3. **Calibração e Upgrade do Verificador Jev (`scripts/jev-check.mjs` Gate v2)**:
   - **Diagnóstico do Gate v1**:
     * Dependência de `noul >= 0.8` causava falsos positivos (reprovava diffs legítimos médios com `violacao=nenhuma`).
     * `risco < 2` era perigosamente permissivo: o patch de teste que vazava credenciais via `console.log` pontuou 1.57 a 1.67 e passaria batido.
   - **Harness de Calibração (`_jev_calibrate.mjs`)**:
     * 6 fixtures de teste (3 `ok-*`, 3 `bad-*`) executados 5 vezes cada.
     * Gate v2 obteve **30/30 acertos (100% de precisão)**.
     * Limiares calibrados: `LIMIAR_NENHUMA = 0.90` (gap de 0.88 para o pior bad) e `LIMIAR_RISCO = 1.0` (exige risco abaixo de Médio).
     * Tratamento de saída com 3 códigos: Exit 0 (Aprovado), Exit 1 (Reprovado por violação), Exit 2 (Erro de infra/HTTP/ausência de resposta).

4. **Investigação Forense do Consumo de APIs (OpenRouter / AI FinOps)**:
   - **Mapeamento no Código Duro**:
     * `supabase/functions/zapi-smart-webhook/index.ts`: Protocolo B (Jev AI) para conferência semântica de mensagens WhatsApp avulsas.
     * `scripts/jev-check.mjs`: Verificador de diffs via Decisions API (`typesafe/jev-1.14`).
     * `scripts/s38-sync-bot.ts`: Extração de perfis sintéticos do WOL via `anthropic/claude-sonnet-5.5`.
     * `src/components/S38ProfilesTab.tsx`: Catálogo de seleção de modelos.
   - **Diagnóstico Financeiro**:
     * Consumo diário de US$ 23,06 decorrente de loops de contexto pesado no Roo Code com Claude 3.5 Sonnet + calibrações sequenciais.
     * Erro HTTP 402 no OpenRouter identificado como esgotamento dos créditos pré-pagos da conta (`limit_source: "openrouter_credits"`), embora o teto da chave registrasse margem restante.

5. **Matriz de Custo-Benefício Inteligente Proposta**:
   - **Tiering de Modelos**:
     * Rotina / Código geral: `deepseek/deepseek-chat` (DeepSeek V3) ou `google/gemini-2.0-flash-001` (US$ 0,14 a US$ 0,28/M tokens — 95% mais barato).
     * Raciocínio Extremo: `anthropic/claude-3.5-sonnet` apenas sob demanda específica.
   - **Webhook WhatsApp**: Apontar `JEV_MODEL_ID` para Gemini 2.0 Flash com heurística de atalho para partes únicas.
   - **Governança no IDE**: Criar comando `npm run ai:status` para monitorar saldo e saúde dos endpoints sem depender do navegador.

---

## 2. Invariantes Mantidas
- Nenhuma alteração retroativa de banco de dados.
- Nenhuma chave ou segredo commitada no repositório.
- Suite de testes íntegra e passando.
