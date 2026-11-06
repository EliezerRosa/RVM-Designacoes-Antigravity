# HG-Sync — Estado e Memória Persistente (2026-11-06)

> Módulo desacoplado em `rvm-designacoes-unified/hg-sync/` (painel `http://localhost:4610`). Sincroniza RVM ⇄ Hourglass (HG).
> Atualizado em 2026-11-06 13:40 (BRT): **REST API Nativa Mapeada + Retenção Cirúrgica de `hg_id` no Supabase + Invariante "RVM Prevalece Sempre" no Código Duro** implementada e testada (`14/14` testes unitários passando em `hg-sync`).

## 1. Requisitos e Invariantes Inegociáveis
- **100% Automático e Contínuo**:
  - **Meio de semana (`RVM ➡️ HG`)**: monitora continuamente o RVM (detector rápido de hash a cada 60s + ciclo completo de 5 min) e grava automaticamente no HG todas as partes (`core` + `cbs` + `tgw` + `fm` titular/ajudante + `lac`) das semanas publicadas da semana atual em diante.
  - **Invariante no Código Duro ("RVM Prevalece Sempre")**:
    - O RVM é a fonte única e absoluta da verdade (`midweek/reconcile.ts`).
    - Se houver diferença entre RVM e HG: RVM sobrescreve (`action: 'update'`).
    - Se o RVM tiver nova designação e HG estiver vazio: RVM preenche (`action: 'insert'`).
    - Se a parte foi esvaziada no RVM: o HG é esvaziado (`action: 'clear'`, `assignee: 0`, motivo: `'Removido no RVM (RVM prevalece)'`).
    - Salvaguarda: nomes externos sem `hg_id` numérico (oradores visitantes ou SC) são preservados no HG sem apagar.
  - **Downloads (`Downloads ➡️ HG`)**: monitora `C:\Users\Eliez\Downloads` (`fs.watch` com debounce de 3s + hash `SHA-256` em `data/processed-files.json`) e sincroniza automaticamente em background (`headless: config.headlessBrowser`) arquivos de escalas (`PRESIDENTE E LEITOR.pdf`, `INDICADORES E MICROFONE.pdf`, `DESIGNAÇÕES LIMPEZA.pdf`) sem exigir clique no painel.
  - **Auto-Recuperação de Sessão (`ensureAuthenticatedForAutoSync`)**: perfil persistente em `hg-sync/data/hourglass_session` + `hg-cookies.json`. Se desconectado, abre 1 janela do Chrome nativo (cooldown 6h), captura sessão via CDP (`9333`), fecha e retoma.
- **Desacoplamento e Escrita no Banco**:
  - Supabase do RVM é **somente leitura** (`SELECT`) para todas as tabelas de designação (`workbook_parts`, `app_settings`).
  - O Hourglass **nunca** altera partes nem grava nada de volta no RVM.
  - **Exceção única e cirúrgica permitida**: Retenção do `hg_id` do publicador na coluna `publishers.hg_id` (via RPC `public.save_publisher_hg_id`) apenas quando resolvido por fallback de nome no `mapper.ts`.
- **Governança Jev**: O uso do Jev da TypeSafe (`scripts/jev-check.mjs`) pertence ao projeto futuro **`idd-ide`** e está suspenso no RVM Designações (ver `.roo/rules/10-jev-verificacao.md`).

## 2. Entregas e Avanços Técnicos Consolidados (2026-11-06)
1. **REST Endpoints Nativos do Hourglass**:
   - `PUT /api/v0.2/scheduling/mm/schedule/{date}/core?lgroup={lgroup}` com payload `{ assignee: number, part_type: string }` para partes core (`chairman`, `openprayer`, `closeprayer`, `cbs_reader`).
   - `PUT /api/v0.2/scheduling/mm/schedule/{date}/asmt?lgroup={lgroup}` com payload `{ assignee: number, assistant: boolean, classroom: 0, part: number }` para seções (`tgw`, `fm`, `lac`, `cbs`).
   - Obtenção dinâmica dos partIds via `/api/v0.2/scheduling/mm/meeting/{start}_{end}?lgroup={lgroup}&no_subs=true`.
2. **Retenção de `hg_id` por Fallback de Nome no Supabase**:
   - Corrigida a tipagem e propriedades no `midweek/mapper.ts` (`resolved.confidence !== 'unresolved'` e `resolved.hg_id`).
   - RPC `public.save_publisher_hg_id` ativada e validada.
   - Todos os 7 publicadores chave agora possuem seus `hg_id` salvos e confirmados no banco de produção:
     - Eliezer Rosa (`id: 3`): `hg_id = 2491248`
     - Marcos Rogério (`id: 17`): `hg_id = 2489454`
     - Renato Oliveira (`id: 19`): `hg_id = 2491349`
     - Emerson França (`id: 20`): `hg_id = 3296264`
     - Israel Vieira (`id: 21`): `hg_id = 2491316`
     - Edmardo Queiroz (`id: 23`): `hg_id = 2491469`
     - Edmilson Monteiro (`id: 28`): `hg_id = 3296262`
3. **Robustez no DOM Fallback de `browser.ts`**:
   - Expressões em `page.evaluate` convertidas para strings auto-contidas, prevenindo que o transpilador `tsx/esbuild` injete o helper `__name` no contexto da página.
4. **Mapeamento da UI & Mensageria do Hourglass**:
   - **Botão Amarelo com `⚠️`**: indica estado de rascunho com pendências ou partes incompletas (designação oculta para o publicador); ao ser clicado, converte-se no aviãozinho `✈` (*"Enviar designações"*).
   - **Mensageria Real do Hourglass**: atua exclusivamente via **Push Notification no App Mobile do Hourglass** e **E-mail transacional**. O Hourglass **não possui integração com WhatsApp**.
   - **Menu `☰ ▾` da Semana**: exclusivo para exportar/imprimir o S-140 em PDF ou Word.
   - **Complementaridade do RVM**: o RVM Designações cobre a lacuna do WhatsApp entregando o S-89 oficial com botões interativos via Z-API.
