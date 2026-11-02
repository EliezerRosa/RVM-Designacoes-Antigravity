# HG-Sync: Sincronizador Desacoplado RVM Designações ↔ Hourglass

Módulo autônomo e permanente projetado para sincronizar de forma bidirecional/unidirecional as designações da congregação entre o sistema local **RVM Designações** e o **Hourglass (HG)**.

---

## 🌟 Características Principais

1. **Totalmente Desacoplado**:
   - Isolado na subpasta `hg-sync/`, com suas próprias dependências, configurações e ciclo de vida.
   - Não interfere no build, testes ou deploy do RVM principal.
   - Acesso ao Supabase do RVM estritamente como **somente leitura** (`SELECT`), nunca alterando o banco do RVM.

2. **Sincronização Contínua do Meio de Semana (RVM ➡️ Hourglass)**:
   - Vigia em segundo plano (a cada 5 minutos por padrão).
   - Abrange todas as semanas publicadas a partir da semana em curso.
   - Regra estrita: O RVM é a fonte da verdade. Se uma designação for alterada ou removida no RVM, ela é atualizada ou esvaziada no Hourglass.

3. **Extração de Escalas em Downloads**:
   - Escaneia automaticamente `C:\Users\Eliez\Downloads` procurando arquivos de escalas (`.pdf`, `.xlsx`, `.csv`).
   - Extrai automaticamente:
     - **Presidente e Leitor** (Reunião do Fim de Semana)
     - **Indicadores e Microfones** (Áudio/Vídeo e Indicadores)
     - **Limpeza do Salão**
   - Resolve nomes abreviados usando um dicionário de apelidos pré-calibrado e correspondência fonética/prefixada.
   - Permite prévia visual e resolução de apelidos com 1 clique.

4. **Painel Local Dedicado (UI)**:
   - Interface web moderna disponível em `http://localhost:4610`.
   - Permite sincronização manual de documentos de download com prévia.
   - Visualização do diff das semanas do meio de semana.
   - Edição e gestão de dicionário de apelidos.
   - Registro de auditoria (ledger e logs históricos).

5. **Execução Permanente em Segundo Plano**:
   - Script para registro como Tarefa Agendada do Windows (`install-service.ps1`), executando no login do usuário sem janela preta de console.

---

## 🚀 Como Iniciar

### Modo Manual / Desenvolvimento
Na pasta raiz do repositório:
```bash
npm run hgsync
```
Ou dentro de `hg-sync/`:
```bash
npm start
```
Acesse o painel: [http://localhost:4610](http://localhost:4610).

### Modo Permanente (Serviço do Windows)
Execute o PowerShell como Administrador ou usuário normal:
```powershell
powershell -ExecutionPolicy Bypass -File .\install-service.ps1
```
Para remover:
```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-service.ps1
```

---

## 📁 Estrutura de Pastas

```
hg-sync/
├── config/
│   ├── columns.json      # Definição das colunas esperadas para cada tipo de PDF/XLSX
│   └── settings.json     # Configurações de porta, intervalos e pastas
├── data/
│   ├── aliases.json      # Dicionário persistente de nomes e IDs do Hourglass
│   ├── ledger.json       # Histórico de alterações aplicadas
│   ├── sync-log.json     # Registro de execuções
│   └── browser-session/  # Perfil persistente do navegador Chrome
├── src/
│   ├── hg/               # Automação de sessão, API REST e UI do Hourglass
│   ├── imports/          # Leitores de PDF (pdfjs-dist), planilhas e datas
│   ├── midweek/          # Mapeamento do RVM e motor de reconciliação (diff)
│   ├── names/            # Resolvedor inteligente de nomes e apelidos
│   ├── rvm/              # Leitor somente-leitura do Supabase RVM
│   ├── config.ts         # Leitor de variáveis de ambiente
│   ├── server.ts         # Servidor HTTP e endpoints REST
│   ├── store.ts          # Gerenciador de estado local em JSON
│   ├── types.ts          # Interfaces TypeScript
│   └── worker.ts         # Processador em segundo plano (agendador)
├── ui/                   # Interface web do painel (HTML/CSS/JS puro)
├── install-service.ps1   # Instalador da tarefa agendada
├── run-silent.vbs        # Launcher invisível para background
└── start-hgsync.bat      # Script batch para execução direta
```
