# Análise de Critérios para Designação por Adequação

Ao analisar as descrições das partes da **Reunião Vida e Ministério (24 de agosto a 30 de novembro de 2026)**, foram identificados padrões textuais claros que podem alimentar um algoritmo de **escolha de designado por adequação**. 

Estes padrões permitem cruzar as exigências da parte com os dados do perfil dos publicadores (Idade, Sexo, Privilégios, Estado Civil, etc.).

---

## 1. Funções e Cargos Pré-estabelecidos
Algumas partes exigem categoricamente que o designado possua um cargo ou privilégio específico na congregação.
* **Padrão Encontrado (24 de ago):** *"Discurso feito pelo **superintendente de serviço**."*
* **Padrão Encontrado (Semana 46, Nov):** *"Nossos donativos dão glória ao belo nome de Jeová... Consideração a ser feita por um **ancião**."*
* **Critério de Match:** 
  * O algoritmo deve realizar um *Regex* ou busca por palavras-chave em partes aplicadas à congregação.
  * Palavras-chave: `superintendente de serviço`, `coordenador`, `ancião`.
  * **Filtro:** Apenas irmãos que possuem a respectiva flag/tag em seu perfil (ex: `is_service_overseer = true` ou `is_elder = true`).

## 2. Idade e Faixa Etária (Jovens, Crianças e Idosos)
As partes de estudantes frequentemente simulam situações da vida real que são específicas de uma faixa etária.
* **Jovens (31 de ago):** *"TESTEMUNHO INFORMAL... ajudar um **colega de escola** que está chateado porque acha que um **professor** o está tratando mal."*
* **Idosos (Semana 48, Nov):** *"Discurso... Tema: **Idosos** — vocês são uma joia para a congregação."*
* **Critério de Match:**
  * Palavras-chave: `colega de escola`, `escola`, `professor`, `jovem` -> **Filtro:** Priorizar publicadores classificados como **Jovens** (ex: 10 a 18 anos).
  * Palavras-chave: `idosos`, `terceira idade` -> **Filtro:** Priorizar irmãos com idade avançada para dar o discurso (para gerar empatia) ou anciãos experientes que lidam com idosos.

## 3. Sexo (Gênero)
As diretrizes da reunião determinam que certos tipos de partes sejam feitas exclusivamente por homens ou mulheres, ou permitem flexibilidade.
* **Padrão Encontrado:** *"Discurso. (th lição...)"* ou *"Explicando suas crenças"*
* **Critério de Match:**
  * O termo **"Discurso"** na seção "Faça Seu Melhor No Ministério" indica uma parte feita exclusivamente por **Irmãos (Homens)**, sem ajudante.
  * O termo **"Consideração"** na seção "Nossa Vida Cristã" exige um **Ancião ou Servo Ministerial (Homens)**.
  * Partes como **"Iniciando conversas"** ou **"Cultivando o interesse"** (com Ajudante) são majoritariamente designadas para **Irmãs (Mulheres)** (embora irmãos também possam fazer, a proporção de irmãs inscritas é maior).

## 4. Cenários e Perfil Familiar / Casais
Muitas partes de demonstração se adaptam perfeitamente ao perfil familiar do publicador, tornando o cenário muito mais realista.
* **Padrão Encontrado (Semana 40, Out):** *"Ofereça um estudo bíblico para uma pessoa que **é pai ou mãe**."*
* **Critério de Match:**
  * Palavras-chave: `casal`, `marido`, `esposa`, `filho`, `criança`, `pai ou mãe`.
  * **Filtro:** Priorizar publicadores com a tag `is_married = true` ou `has_children = true`. Quando a parte fala especificamente de "pai ou mãe", o algoritmo deve obrigatoriamente trazer para o topo os publicadores que têm filhos.

## 5. Abordagens Sensíveis, Empatia e Objeções
Algumas partes exigem um tato maior, experiência de vida, ou habilidade para lidar com objeções doutrinais e problemas emocionais.
* **Objeções (Semana 46, Nov):** *"O morador **não concorda com a nossa crença** de que Jesus é o Filho de Deus."*
* **Tristeza/Apatia (Semana 43, Out):** *"A pessoa está irritada"* ou *"Uma pessoa que parece estar triste vem atender."*
* **Pastoreio/Empatia (Semana 47/48, Nov):** *"Não se esqueça de nossos **irmãos e irmãs inativos**"* e *"Ajude os **cuidadores** a não desanimar"*.
* **Critério de Match:**
  * Situações de objeção forte, tristeza profunda, inativos ou cuidadores.
  * **Filtro:** O algoritmo deve dar um *boost* gigantesco para publicadores mais maduros e experientes (Pioneiros regulares, Anciãos, Servos Ministeriais e publicadores com muitos anos de batismo). O algoritmo deve **evitar** sugerir crianças, adolescentes ou recém-batizados para partes de inativos, cuidadores ou objeções teológicas fortes.

---

## 💡 Como isso foi implementado na prática (Concluído em Produção — Fase 7)

A proposta teórica foi integralmente implementada e expandida através de uma arquitetura robusta de agentes e base relacional:

1. **Base de Conhecimento Relacional (`curator_profiles` e `curator_batch_insights` no Supabase)**:
   - 16 perfis típicos estruturados (ex: *Instrutor Bíblico Eloquente, Conselheiro Amoroso, Jovem Exemplar, Pioneiro Zeloso, Orador Dinâmico, Acolhedor, Pacificador, Apologista Maduro, etc.*) cadastrados com traços ideais, traços a evitar, palavras-chave e papéis canônicos.
2. **Agente Especialista de Lote (`curatorBatchSpecialistAgent.ts`)**:
   - Analisa lotes de apostilas importadas e descobre ênfases temáticas (ex: livro profético de Jeremias em Set/Out 2026), enriquecendo os perfis com *insights* aplicados.
3. **Atribuição Determinística no Cadastro (`PublisherForm.tsx`)**:
   - Campo multi-select (+1) que vincula tags de perfis sintéticos ao publicador, persistido em `publishers.data (JSONB)`.
4. **Motor Híbrido e Ergonomia de Tela (`SemanticDraggableGenerator.tsx` & `semanticRulesService.ts`)**:
   - Ponto de partida determinístico (+300 pontos e badge `💎 Perfil Atribuído no Cadastro`) se o publicador elegível possuir o perfil exigido pela parte.
   - Flexibilidade total para selecionar qualquer publicador elegível da semana em foco.
   - Total isolamento: o motor de rotação automática ("Gerar") permanece 100% intocado.

