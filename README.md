# RVM Designações (Antigravity)

**Sistema Unificado de Gestão de Designações para Reuniões Cristãs**

## 📋 Sinopse
Plataforma web para coordenadores e secretários gerenciarem de forma automatizada as designações semanais de reuniões, com geração inteligente baseada em rodízio justo e elegibilidade.

## ✨ Funcionalidades

### 📖 Apostila (WorkbookManager)
- Importação de apostilas via Excel/PDF.
- Visualização e edição de partes por semana.
- Geração automática de designações com motor de rodízio unificado.
- Geração de formulários S-140 (Room B A4) e S-89.

### 🤖 Agente RVM
- Chat com IA (Gemini) contextualizado com dados reais.
- Preview S-140 integrado com navegação por semana.
- Painel de controle com análise de scores e explicações.
- Ações ativas: designar, simular, limpar, navegar.

### ✅ Aprovações
- Fluxo de revisão para anciãos confirmarem propostas.

### 👥 Publicadores
- Cadastro com privilégios, gênero, grupo e disponibilidade.
- Verificador de duplicatas.

### 💾 Backup
- Exportação/importação completa (JSON/Excel) de todas as tabelas.

### 📊 Admin Dashboard
- Monitoramento de custos da API Gemini.
- Métricas de resiliência e saúde do sistema.

## 🏗️ Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, TypeScript, Vite 7 |
| Backend (API) | Supabase (PostgreSQL + Realtime) |
| IA | Gemini 1.5 Flash via Serverless Function |
| Deploy | GitHub Pages (CI/CD via GitHub Actions) |

## 🚀 Desenvolvimento Local

```bash
npm install
npm run dev
```

## 📚 Documentação

- [Manifesto Técnico do RVM Designações](docs/manifesto_tecnico_rvm_designacoes.md)

---
*Desenvolvido para EliezerRosa como parte do projeto Antigravity.*
