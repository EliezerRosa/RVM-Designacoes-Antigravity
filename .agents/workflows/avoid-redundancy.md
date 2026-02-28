---
description: Regra de raciocínio para evitar soluções redundantes e erros repetitivos
---

# Checklist Anti-Redundância (OBRIGATÓRIO antes de cada edição)

## 1. Verificar Imports
// turbo-all
- Antes de usar qualquer `React.xxx`, verificar se `React` está importado como namespace no topo do arquivo
- Se o projeto usa import direto de hooks (`import { useState } from 'react'`), usar o hook diretamente (`useRef`, não `React.useRef`)
- Verificar que todo símbolo usado está importado: `grep` no topo do arquivo

## 2. Verificar APIs e Métodos
- Antes de chamar qualquer método de um service (ex: `workbookService.xxx()`), executar `grep` para confirmar que o método existe
- Se o método não existe, criar o método ANTES de usá-lo

## 3. Não Remover Funcionalidade ao Corrigir Bug
- Ao refatorar um bloco de código, listar TODAS as funcionalidades do bloco original
- Garantir que cada funcionalidade foi preservada ou conscientemente descartada
- Especial atenção a `setState` calls que definem contexto para outros componentes

## 4. Testar Após Deploy
- Após `npm run build`, verificar que não há erros no output além de warnings conhecidos
- Sempre abrir o app no browser (via `browser_subagent`) após deploy crítico para confirmar que carrega

## 5. Consistência de URLs
- WhatsApp: SEMPRE usar `https://api.whatsapp.com/send` (funciona no celular E desktop)
- NUNCA usar `https://web.whatsapp.com/send` (exige cadastro de dispositivo)

## 6. Dependency Arrays em useEffect
- `[]` = roda uma vez no mount (sem acesso a dados reativos)
- `[data]` = roda quando data muda (usar para resolver dados pendentes)
- Nunca usar `[data.length > 0]` como dependency — isso é um boolean, não reativo ao conteúdo
