# Arquitetura de Armazenamento, Junções NTFS & OneDrive (1 TB) — Governança Multi-IDE

> **Data de Implantação**: 2026-11-05  
> **Escopo**: Global para todos os IDEs (Antigravity, VS Code, Cursor, Claude Code, Roo Code, GitHub Copilot, Windsurf) no computador `DELL-PESSOAL` (`C:\Users\Eliez`).  
> **Responsável Epistêmico**: Eliezer Rosa

---

## 1. Os 3 Únicos Projetos Ativos em Curso

Apenas **3 projetos** estão em desenvolvimento ativo no disco local `C:\`:

| # | Projeto Ativo | Caminho Canônico no Disco `C:\` | Observações |
| :-: | :--- | :--- | :--- |
| **1** | **RVM Designações** | `C:\Antigravity - RVM Designações\rvm-designacoes-unified` | Aplicação principal (+ módulos locais não versionados). |
| **2** | **idd-ide** | `C:\IDE IDD Claude-VS Code\idd-ide` | IDE / Extensão de Governança IDD & Verificador Jev (TypeSafe). |
| **3** | **IDD Refrigeração** | `C:\Antigravity - IDD Refrigeração` | Projeto IDD Refrigeração, vídeos e renderização visual. |

Todos os demais ~50 projetos antigos, protótipos (`C:\app-rvm-*`, `C:\app-relatorio-mensal*`, `C:\Antigravity - Gestão Reforma`, `C:\Claude WhatsApp*`, etc.) e pastas de estudo que antes ficavam soltos em `C:\` e `C:\Users\Eliez\` foram **limpos de `node_modules`/`.venv` e arquivados na nuvem do OneDrive** em:
- `C:\Users\Eliez\OneDrive\Artefatos_IDEs\Projetos_Arquivados_Raiz_C\`
- `C:\Users\Eliez\OneDrive\Artefatos_IDEs\Projetos_Arquivados_Usuario\`

---

## 2. Esquema de Junções Transparentes (`mklink /J`) + OneDrive Sob Demanda (1 TB)

Para impedir que artefatos pesados (vídeos `.mp4`, áudios `.wav`, renders, acervos documentais e backups) esgotem o SSD `C:\` (`457 GB`), as pastas de artefatos pesados dos 3 projetos ativos foram movidas fisicamente para **`C:\Users\Eliez\OneDrive\Artefatos_IDEs\`** e substituídas no caminho original por **Junções de Diretório NTFS (`mklink /J`)**:

| Projeto | Caminho Original (Junção NTFS Transparente p/ IDEs) | Caminho Físico Real no OneDrive (1 TB Nuvem) | Volume Aprox. |
| :--- | :--- | :--- | :---: |
| **idd-ide** | `C:\IDE IDD Claude-VS Code\idd-ide\paradigma` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDE_IDD_Claude\idd-ide_paradigma` | `24,00 GB` |
| **idd-ide** | `C:\IDE IDD Claude-VS Code\IDD Paradigma` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDE_IDD_Claude\IDD Paradigma` | `4,45 GB` |
| **idd-ide** | *(Arquivo)* `idd-ide.zip` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDE_IDD_Claude\idd-ide.zip` | `18,23 GB` |
| **IDD Refrigeração** | `C:\Antigravity - IDD Refrigeração\producao_yt` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDD_Refrigeracao\producao_yt` | `13,23 GB` |
| **IDD Refrigeração** | `C:\Antigravity - IDD Refrigeração\motion_graphics_renderer` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDD_Refrigeracao\motion_graphics_renderer` | `7,00 GB` |
| **IDD Refrigeração** | `C:\Antigravity - IDD Refrigeração\IDD Paradigma` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDD_Refrigeracao\IDD Paradigma` | `4,44 GB` |
| **IDD Refrigeração** | `C:\Antigravity - IDD Refrigeração\apresentacao` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDD_Refrigeracao\apresentacao` | `2,64 GB` |
| **IDD Refrigeração** | `C:\Antigravity - IDD Refrigeração\artefatos` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\IDD_Refrigeracao\artefatos` | `0,62 GB` |
| **RVM Designações** | `C:\Antigravity - RVM Designações\_render_work` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\RVM_Designacoes\_render_work` | `0,47 GB` |
| **RVM Designações** | `S-89 RVM Designações`, `CRUD RVM Dsignações`, `Form RVM Designações` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\RVM_Designacoes\Legados_Arquivados\*` | `0,39 GB` |
| **Sistema / Usuário** | `C:\Users\Eliez\.git_backup_20251204` | `C:\Users\Eliez\OneDrive\Artefatos_IDEs\Backups_Usuario\.git_backup_20251204` | `10,22 GB` |

---

## 3. Automação de Desidratação (`attrib +U -P`) e Energia

1. **Tarefa Agendada `\OneDrive-AutoDehydrate-Artefatos`**:
   - Script: `C:\Users\Eliez\OneDrive\Artefatos_IDEs\dehydrate-artefatos.cmd`
   - Frequência: Executa automaticamente a cada **15 minutos** aplicando `attrib +U -P "C:\Users\Eliez\OneDrive\Artefatos_IDEs\*" /S /D`.
   - Comportamento: Assim que o cliente `OneDrive.exe` conclui o upload de qualquer arquivo novo ou modificado para a nuvem de 1 TB, o arquivo é desidratado localmente (passa a ocupar **`0 bytes` no disco `C:\`** e fica disponível sob demanda).
2. **Sensor de Armazenamento do Windows (Storage Sense)**:
   - Ativado no registro (`HKCU\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy`) para desidratar automaticamente arquivos do OneDrive sem uso recente.
3. **Política de Energia e Suspensão**:
   - Na tomada (`AC`): **Nunca suspender/hibernar** (`standby-timeout-ac = 0`), apenas desligar a tela após 3 minutos, e modo de energia destravado para **Equilibrado / 100% CPU** (sem throttling de *Best Power Efficiency*).

---

## 4. Regras Obrigatórias para Todos os Agentes e IDEs

1. **NUNCA coloque `node_modules`, `.venv`, `venv` ou `.git` de projetos ativos dentro de pastas sincronizadas pelo OneDrive**:
   - Ambientes virtuais e `node_modules` possuem dezenas de milhares de microarquivos que travam o indexador do OneDrive. Se um agente precisar de `node_modules` ou `.venv`, ele deve ficar em pasta local fora das junções do OneDrive.
2. **Novos Artefatos Pesados (Vídeos, Áudios, Renders, Datasets, Backups `.zip`)**:
   - Devem sempre ser gravados dentro das pastas já mapeadas por Junção NTFS (ex.: `producao_yt`, `motion_graphics_renderer`, `paradigma`, `_render_work`, `artefatos`) ou diretamente em subpastas de `C:\Users\Eliez\OneDrive\Artefatos_IDEs\`. Assim, já nascem protegidos na nuvem de 1 TB e têm seu espaço local liberado automaticamente.
3. **Preservação das Junções NTFS (`ReparsePoint`)**:
   - Nenhum agente deve remover ou recriar como pasta comum as junções listadas na Seção 2. Para verificar se uma pasta é uma junção no PowerShell: `(Get-Item $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint`.
4. **Cuidado com Varreduras Recursivas (`grep` / `find_by_name`) em Pastas Desidratadas**:
   - Ler o **conteúdo** de arquivos desidratados (`.mp4`, `.wav`, `.zip`) força o OneDrive a baixá-los da nuvem para o disco local. Agentes de código **NÃO** devem fazer `grep` ou leitura de conteúdo em pastas de mídia/vídeo (`producao_yt`, `paradigma\50-comunicacao`, `motion_graphics_renderer\outputs`); inspecione apenas metadados/nomes de arquivos (`Get-ChildItem`) quando necessário.
