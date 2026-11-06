# Sessão — Reengenharia reversa do Hourglass → especificação alvo do RVM (2026-11-06)

> Pedido do Eliezer: **somente documentação, nenhum código alterado**. Produzir MER/UML detalhados,
> especificação de requisitos de um app de gerência congregacional, plano de IA econômica/determinística
> (Jev/TypeSafe via OpenRouter, agentes do GitHub) e diretrizes de ergonomia/acessibilidade WhatsApp-first.
> Dica dele: usar a imagem exata dos formulários S-n (como já feito no RM com S-4/S-1).

## Objetivo
Consolidar tudo que existe sobre o HG (docs 2026-10-09/11 em `docs-local/hourglass/`, API shape, DOM,
sessões de sync) + fontes públicas (S-38, Organizados, jw.org, comunidades) em um pacote único de
engenharia reversa + alvo RVM, pronto para ser "absorvido via UI-chat-agente".

## Onde está o pacote
`rvm-designacoes-unified/docs-local/hourglass/reengenharia-2026-11-06/` (gitignored — material de terceiros,
sem dados pessoais):
- `00-indice-e-parecer.md` — sumário executivo, parecer, decisões pendentes consolidadas.
- `01-engenharia-reversa-hg.md` — modelo HG consolidado (domínios, estados, fluxos, API, UI, mensageria).
- `02-mer-alvo-rvm.md` (+ `diagramas/*.mmd`) — MER alvo.
- `03-uml-alvo-rvm.md` (+ `diagramas/*.mmd|puml`) — classes, casos de uso, máquinas de estado, sequências.
- `04-especificacao-requisitos.md` — RF/RNF rastreáveis a S-38/Organizados/S-n.
- `05-plano-ia-economica-deterministica.md` — camadas determinístico→cache→Jev→LLM pequeno→escalada.
- `06-ergonomia-acessibilidade-whatsapp.md` — idosos, 1 toque, S-n fiel, Z-API.

## Decisões / achados desta sessão
- Jev 1.14 (TypeSafe) via OpenRouter: **US$ 0,042 / 1M tokens de entrada, saída grátis** (não é ":free",
  mas custo ≈ zero no volume do RVM). Contexto 64k/req, 32k/pergunta (262k com header "danger zone").
  Tipos: noul / choice / score / box. Aceita imagens PNG/JPEG.
- OpenRouter modelos `:free`: 20 req/min; 50 req/dia (conta sem US$ 10 de crédito vitalício) ou 1.000 req/dia
  (após comprar US$ 10 uma vez). Saldo negativo → 402 inclusive nos free.
- GitHub Copilot: Pro US$ 10 (US$ 15 créditos/mês), Pro+ US$ 39 (US$ 70 créditos/mês), coding agent com
  model picker, self-review, security scan, custom agents, CLI handoff (blog 2026-02-26).
- Pesquisas delegadas (agentes `research`): S-38/Organizados (892afe18…) e Hourglass/comunidade (e64c0845…).

## Arquivos tocados
Apenas novos arquivos em `docs-local/hourglass/reengenharia-2026-11-06/` e memórias.

## Progresso (atualizado a cada marco)
- ✅ `01-engenharia-reversa-hg.md`, `02-mer-alvo-rvm.md`, `03-uml-alvo-rvm.md` escritos.
- ✅ 13 diagramas Mermaid renderizados com `mmdc` (`diagramas/02a–02d`, `03a–03i` .mmd + .svg).
  Armadilhas Mermaid encontradas: `;` dentro de mensagem de sequenceDiagram quebra o parser (usar `,` ou `+`);
  `<id>`/`<data>` em texto de mensagem vira tag HTML (usar `[id]`); subgraph com título acentuado precisa de
  `id["Título"]`; membros de classDiagram não aceitam espaço no nome (`-l0Rules()`, não `-L0 rules()`).
- ✅ `04-especificacao-requisitos.md` (RF/RNF, catálogo N-01…N-43, +26 ações de chat) e `05-plano-ia-economica-deterministica.md` (L0–L5, Jev, FinOps OpenRouter, agentes GitHub, orçamento ≈ US$ 0,15–0,60/mês) escritos.
- ✅ Agente S-38/Organizados concluiu (76 min): edição vigente **S-38-T 8/26, 28 parágrafos** (WOL doc 1201038). Confirmados: presidente §25; Tesouros §3; Joias §4; Leitura §5 (homens); Faça seu melhor §6–§12 (§9 "O que você diria?"; ajudante mesmo sexo/família §7/§8/§11; discurso só homens §11/§12); Necessidades locais só anciãos §16; EBC §17 (rodízio semanal recomendado); conselho §19/§25 (1 min; th, "Ame as pessoas", be); 1h45 §20; SC §21 (discurso de serviço 30 min; sem sala adicional); assembleia §22; Celebração §23 (sem RVM se dia de semana); **antecedência 3 semanas + S-89 + bimestral §24**; conselheiro assistente §26; salas adicionais §27; pré-requisito estudante §1→od 8§8. od: cap.5 superintendentes (§25–35), cap.6 SM, cap.7 reuniões, cap.8 ministros (S-4 §23–29; não batizado §8–10), cap.9 territórios (**4 meses** §30–34), cap.10 pioneiros (§12–14). LGPD: página oficial "Tratamento de Dados Pessoais – Brasil" (13/08/2024). NÃO CONFIRMADO publicamente: S-140, S-12, S-13 em pt-BR, critério numérico de "irregular", S-4 binário pós-2023 (confirmado só pelo template S-4-T 11/23 do repo), horas de pioneiro pós-2023, presidente/leitor do fim de semana, catálogo de esboços.
- ✅ `06-ergonomia-acessibilidade-whatsapp.md` (10 princípios, 9 personas, gramática Z-API ≤3 botões + fallback "1/2/3", cadência D-7/D-2 · D+3/D+7, 15 fluxos F1–F15, pipeline `FormRenderer` com `render_hash` para imagem exata dos S-n, acessibilidade RNF-ACE, impressão, métricas, backlog A/B/C).
- ✅ `07-fontes-publicas.md` (mapa S-38-T 8/26 §1–§28 → N-xx; od cap.5–10 → N-xx; LGPD; catálogo S-n com disponibilidade pública; lista V1–V12 de NÃO CONFIRMADOS para validar com anciãos; fontes F1–F20; limitações). **Parte E (HG/comunidade) ficou pendente** — preencher quando o agente e64c0845… concluir (87 min / 406 chamadas no último check).
- ✅ Agente HG/comunidade (e64c0845…) concluiu (90 min / 406 chamadas), mas a resposta chegou **truncada no início** (faltam Parte A = HG em si e B.1–B.3 = concorrentes). Recebido e já incorporado em `07 §5.1–§5.3` + F21–F29: estrutura da apostila no WOL (`/wol/meetings/r5/lp-t/{ano}/{semana-ISO}`, `data-pid`, ícones por seção, sem JSON-LD), `GETPUBMEDIALINKS` (JSON público não documentado; `langwritten` obrigatório; cânticos `pub=sjjm`), esboços de discursos **não públicos**, ecossistema open source (NWS incumbente; `.jwpub`; `programa-vmc`; `mtdvlpr-org/jw-api`). Pedido reenvio compacto via `write_agent` (em andamento) → inserir como `07 §5.5–§5.7` + F30+.
- ✅ `00-indice-e-parecer.md` (índice, resumo em 10 linhas, parecer, decisões R1–R12 + herdadas E/G/D/T, roadmap integrado semanas 1–23+, riscos, próximo passo).
- ✅ Memória: §36 no `_ESTADO-ATUAL.md` canônico + pendência 7; espelhos `memories/repo/_ESTADO-ATUAL.md` (repo) e `memories/repo/_ESTADO-ATUAL.md` (raiz, estava defasado desde 14/10) sincronizados (hash igual); fatos duráveis em `memories/repo/reengenharia-hg-2026-11-06.md`.
- ✅ Reenvio do agente HG recebido e incorporado em `07 §5.4` (HG público: módulos, papéis/Delegado, fluxos push-no-app, sem API pública, ToS/DPA, reclamações) e `07 §5.5` (10 concorrentes) + fontes F30–F53. Divergência registrada: módulos Manutenção/Personalizado/Celebração ausentes do site público mas **confirmados pelo DOM local** → 01 mantido.
- ✅ Pacote completo: 00–07 + 13 diagramas. Memórias atualizadas (canônico §36, espelhos, `memories/repo/reengenharia-hg-2026-11-06.md`).
- ⬜ Pedir autorização de `git commit` das memórias (docs-local fica local).

## Próximos passos
- Fechar os 7 documentos; renderizar Mermaid (mmdc) sem dados pessoais.
- Atualizar `_ESTADO-ATUAL.md` (repo e raiz) com §36; pedir autorização para commit/push das memórias.
