---
description: Regra de raciocínio para evitar soluções redundantes
---

# Antes de propor qualquer solução técnica:

## 1. PARAR e perguntar:
- Isso já existe no projeto?
- Há funcionalidade similar na UI?
- Há um script que faz algo parecido?

## 2. Verificar:
- `src/components/` - funcionalidades de UI existentes
- `src/services/` - serviços já implementados
- `scripts/` - scripts Python existentes

## 3. Se existir similar:
- Informar o usuário: "Isso já existe em X, quer reutilizar?"
- Só criar algo novo se houver justificativa clara

## 4. Exemplos desta regra:
- Upload Excel → já existe em WorkbookManager.tsx
- Buscar dados paginados → já existe em supabasePagination.ts
- Atualizar publicadores → considerar se UI já permite edição

## 5. Filosofia:
> "Reutilizar antes de reinventar"
