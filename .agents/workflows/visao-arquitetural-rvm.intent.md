---
description: "Declaração de Intenção Final e Visão Arquitetural do RVM Designações — fonte canônica de longo alcance"
authorization: per-step
invariants:
  - "NUNCA alterar esta declaração de visão sem decisão explícita do Eliezer (Responsável Epistêmico)"
  - "O núcleo do RVM (MER, serviços, ações DAV e capabilities) permanece 100% agnóstico e livre de dialetos de sistemas externos"
  - "Pontes externas de sincronização são sempre opcionais, desacopladas e atuam apenas como Camada Anticorrupção (ACL)"
  - "As 3 UIs (Console de Governança, Conversa RVM e UI Celular Android) compartilham o mesmo núcleo determinístico e o mesmo modelo de capabilities"
  - "Capabilities de governança técnica (governance.*) nunca são concedidas automaticamente por responsabilidades congregacionais ou sincronizações externas"
---

# Declaração de Intenção Final — Visão Arquitetural do RVM (2026-11-27)

> **Documento canônico de intenção (Paradigma IDD).** Ratificado pelo Responsável Epistêmico (Eliezer Rosa) em 2026-11-27.
> Em caso de conflito de rumo arquitetural, esta visão prevalece sobre atalhos locais de implementação.

---

## V-1. Cobertura Funcional Completa da Gestão Congregacional
- O RVM tem como destino dar suporte nativo a **todas** as funcionalidades operacionais de gestão congregacional, incluindo:
  - Reunião de Meio de Semana (apostila, motor determinístico `M-0…M-12`, S-89/S-140, confirmações e substituições);
  - Reunião de Fim de Semana (presidente, leitor de A Sentinela, oradores locais/visitantes, esboços e discursos fora);
  - Relatórios Mensais de Campo e Assistência (S-4, S-1, S-21, S-10, S-88 e fechamento mensal);
  - Territórios com ciclo de vida completo (retirada, devolução, prazos, pedidos e S-13);
  - Escalas de apoio e rotina congregacional (áudio/vídeo, indicadores, microfones, limpeza, serviço de campo, testemunho público, quadro de avisos e escalas personalizadas);
  - **Integração com calendários** (exportação/assinatura `.ics`, interoperabilidade com calendários pessoais, ausências por intervalo `[start_at, end_at]` com fuso horário e eventos congregacionais).

## V-2. Pontes Externas Opcionais e Desacoplamento Total (Anti-Corruption Layer)
- Qualquer ponte externa de sincronização com sistemas terceiros deve permanecer **100% desacoplada do núcleo do RVM**, coesa em si mesma e **opcional** para qualquer congregação que adote o RVM no futuro.
- O núcleo do RVM **não depende** de nenhum sistema externo para operar e **não adota** nomes, formatos ou semânticas proprietárias de terceiros em seu modelo de domínio.
- Toda tradução entre sistemas externos e o RVM ocorre estritamente na borda do adaptador externo, gravando e lendo exclusivamente através do **Contrato Canônico Neutro do RVM** (`src/contracts/canonicalPublisherContract.ts` e futuras tabelas M0–M2 com `external_identities` e `congregation_id`).

## V-3. UI 1 — Console Clássico de Governança e Crises
- A interface clássica (abas, botões, tabelas e formulários tradicionais) destina-se **exclusivamente a usuários experientes** (desenvolvedores, administradores técnicos e operações de contingência/governança em crises).
- Novas funcionalidades de negócio não devem investir em telas complexas na UI 1; o esforço de experiência do usuário concentra-se nas UIs 2 e 3.
- A aba **Agente** legada e o **botão flutuante de IA** pertencem ao escopo da UI 1 e serão saneados futuramente em favor da UI 2 (`Conversa RVM`).

## V-4. UI 2 — Conversa RVM (Interação Orientada a Intenções + DAV)
- Interface conversacional (já iniciada em `src/features/conversa/`) onde intenções em linguagem natural são discernidas por camada determinística L0 + Chat-IA-LLM, executando **exclusivamente ações determinísticas de código duro (DAV)** sujeitas às permissões do usuário, com confirmação humana antes de mutações e modais/relatórios de saída flexível (visual, PDF, imagem S-n, compartilhamento).

## V-5. UI 3 — Experiência "Celular Android" (Próxima Frente)
- Interface desenhada com padrão visual e ergonômico análogo à tela de um smartphone Android (grade de mini-apps filtrada por capabilities do usuário, drawers rápidos, cartões de toque direto), voltada ao uso cotidiano e acessível para todos os publicadores e responsáveis da congregação.
- A UI 3 consome **exatamente o mesmo núcleo de serviços, contratos e ações DAV** da UI 2 — nunca duplica regras de negócio nem acessa tabelas diretamente fora das portas de domínio.

## V-6. Núcleo Único, Capabilities de Domínio e Evolução Incremental (Sem Big-Bang)
- **Arquitetura Hexagonal:** UI 1, UI 2, UI 3, canais de mensageria (WhatsApp/Web Push) e pontes externas opcionais são adaptadores sobre um único núcleo (MER tipado + Serviços Determinísticos + Ações DAV + Capabilities).
- **Capabilities Unificadas:** permissões evoluem de listas de abas da UI 1 para **capabilities de domínio** que governam simultaneamente: (a) ferramentas visíveis na UI 1, (b) ações DAV autorizadas na UI 2 e (c) mini-apps exibidos na tela inicial da UI 3.
- **Isolamento Estrito de Governança Técnica:** capabilities `governance.*` (acesso à UI 1 de crise, administração de banco, credenciais, webhooks e overrides) são sempre concedidas por ato explícito do Administrador Técnico e **jamais** derivadas automaticamente de funções congregacionais (preservando a invariante do CCA) ou de sincronizações externas.
- **Multi-congregação desde a raiz:** novas entidades do MER já nascem preparadas para `congregation_id` (default da congregação ativa), viabilizando uso futuro por outras congregações sem reescrita de esquema.
- **Migração em Fatias Verticais (M0–M7):** priorizar o alicerce comum (M0–M2: cadastro único de publicadores, catálogo de privilégios, papéis congregacionais, capabilities e vínculos externos) e ativar os demais módulos apenas em fatias verticais completas (schema + ação DAV + interface UI 2/UI 3 + testes), evitando tabelas vazias sem consumidor.
