# 🌍 Controle de Trabalho de Campo — Modelo de Entidades

## Visão Geral (Leigo)

O sistema organiza o **trabalho de pregação** da congregação em camadas:

> **Onde** pregamos → **Quem** vai → **O que** foi feito

```mermaid
graph TD
    subgraph "📍 ONDE pregamos"
        B["🏘️ Bairro\n(Ex: Jardim América)"]
        T["🗺️ Território\n(Ex: Território 14)"]
        Q["🧱 Quadra\n(Ex: Quadra A — Rua das Flores)"]
        C["🏠 Casa\n(Ex: Nº 205, Apto 3)"]
    end

    subgraph "👤 QUEM vai"
        P["👤 Publicador\n(Ex: João Mendes)"]
        D["📋 Designação\n(Território → Publicador\nSaída: 01/Mar — Retorno: 30/Abr)"]
    end

    subgraph "📝 O QUE foi feito"
        V["📝 Visita\n(Data, Resultado, Observações)"]
    end

    B -->|contém| T
    T -->|dividido em| Q
    Q -->|composta de| C
    T -->|designado via| D
    D -->|para| P
    C -->|recebe| V
    V -->|feita por| P

    style B fill:#4F46E5,color:#fff,stroke:#4F46E5
    style T fill:#7C3AED,color:#fff,stroke:#7C3AED
    style Q fill:#9333EA,color:#fff,stroke:#9333EA
    style C fill:#A855F7,color:#fff,stroke:#A855F7
    style P fill:#059669,color:#fff,stroke:#059669
    style D fill:#0891B2,color:#fff,stroke:#0891B2
    style V fill:#D97706,color:#fff,stroke:#D97706
```

---

## Diagrama de Classes (UML Detalhado)

```mermaid
classDiagram
    class Bairro {
        🏘️ Bairro / Neighborhood
        ──────────────
        +UUID id
        +String nome
        +String cidade
        +String observacoes
    }

    class Territorio {
        🗺️ Território
        ──────────────
        +UUID id
        +String numero
        +UUID bairro_id
        +String descricao
        +String mapa_url
        +Date ultimo_trabalho
    }

    class Quadra {
        🧱 Quadra / Bloco
        ──────────────
        +UUID id
        +UUID territorio_id
        +String nome
        +Int ordem
    }

    class Casa {
        🏠 Casa / Endereço
        ──────────────
        +UUID id
        +UUID quadra_id
        +String numero
        +String complemento
        +String status
        +String observacoes
    }

    class Publicador {
        👤 Publicador
        ──────────────
        +String id
        +String nome
        +String telefone
        +String genero
        +String[] permissoes
    }

    class Designacao {
        📋 Designação de Território
        ──────────────
        +UUID id
        +UUID territorio_id
        +String publicador_id
        +Date data_saida
        +Date data_retorno
    }

    class Visita {
        📝 Registro de Visita
        ──────────────
        +UUID id
        +UUID casa_id
        +String publicador_id
        +DateTime data
        +String resultado
        +String observacoes
    }

    Bairro "1" --> "*" Territorio : contém
    Territorio "1" --> "*" Quadra : dividido em
    Quadra "1" --> "*" Casa : composta de
    Territorio "1" --> "*" Designacao : designado a
    Designacao "*" --> "1" Publicador : atribuído a
    Casa "1" --> "*" Visita : recebe
    Visita "*" --> "1" Publicador : feita por
```

---

## Glossário para Leigos

| Entidade | O que é? | Exemplo Real |
|---|---|---|
| **Bairro** | A região geográfica que a congregação cobre | Jardim América, Centro, Vila Nova |
| **Território** | Uma subdivisão numerada do bairro, geralmente com mapa impresso | Território 14 — Jardim América Norte |
| **Quadra** | Um bloco de ruas/casas dentro do território | Quadra A — Rua das Flores até Rua dos Ipês |
| **Casa** | Um endereço específico dentro da quadra | Nº 205, Apto 3 |
| **Publicador** | O irmão ou irmã que realiza o trabalho de campo | João Mendes |
| **Designação** | O ato de entregar um território para um publicador trabalhar | "João, aqui está o Território 14. Retorne em 4 meses." |
| **Visita** | O registro do que aconteceu em cada casa | "Falei com morador, deixei convite. Revisita marcada." |

---

## Status de uma Casa

```mermaid
stateDiagram-v2
    [*] --> Normal : Casa nova no cadastro
    Normal --> Revisita : Morador demonstrou interesse
    Revisita --> EstudoBiblico : Aceitou estudo
    Normal --> Ausente : Ninguém em casa
    Ausente --> Normal : Tentativa seguinte
    Normal --> NaoPerturbe : Morador pediu para não voltar
    NaoPerturbe --> [*]
    EstudoBiblico --> [*]
```

---

## Ciclo de Vida de um Território

```mermaid
stateDiagram-v2
    [*] --> Disponivel : Território cadastrado
    Disponivel --> Designado : Entregue a um publicador
    Designado --> EmAndamento : Publicador está trabalhando
    EmAndamento --> Concluido : Todas as casas visitadas
    Concluido --> Disponivel : Retornado ao arquivo
    Designado --> Disponivel : Publicador devolveu sem concluir
```

---

## Mapeamento Banco ↔ Modelo

| Classe (Modelo) | Tabela (Supabase) | Status |
|---|---|---|
| Bairro | `neighborhoods` | ✅ Criada (0 linhas) |
| Território | `territories` | ✅ Criada (0 linhas) |
| Quadra | `blocks` | ✅ Criada (0 linhas) |
| Casa | `houses` | ✅ Criada (0 linhas) |
| Visita | `visits` | ✅ Criada (0 linhas) |
| Designação | `territory_assignments` | ✅ Criada (0 linhas) |
| Publicador | `publishers` | ✅ Existente (123 linhas) |

> [!NOTE]
> Todas as tabelas de território já existem no banco com RLS ativado e chaves estrangeiras configuradas. Falta apenas a **interface** (frontend) para gerenciá-las.
