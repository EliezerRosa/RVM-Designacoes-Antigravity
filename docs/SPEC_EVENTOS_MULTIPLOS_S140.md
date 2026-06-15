# Dossiê de Arquitetura: Eventos Multi-Impacto & S-140 Responsivo

## 1. Intenção e Objetivos de Negócio
O sistema atual de "Eventos Especiais" limitava o impacto de um evento a um paradigma engessado pelos templates (ex: Apenas o template "Visita do SC" podia injetar uma parte; o impacto no rodapé do S-140 era deduzido por máquina). 

O objetivo deste projeto é **desacoplar esses poderes**, permitindo modularidade total:
- **Poder 1 & 2 (Cancelamento e Redução de Tempo):** Já funcional de forma granular, mas agora empoderado por uma UI sem atrito.
- **Poder 3 (Injeção Flexível):** Qualquer evento poderá injetar uma parte extra, definindo tema, duração e responsável livremente.
- **Poder 4 (Nota S-140 Editável):** O rodapé do S-140 não será mais um texto concatenado por máquina. A UI sugerirá um texto baseado nas ações, mas o usuário terá palavra final em um editor limitado a 150 caracteres.

## 2. Análise de Impactos Previstos e Mitigações

### 2.1 Impacto no Motor de Geração PDF (S-140)
*   **Ameaça:** Se o usuário cancelar 1 parte e injetar 3, a tabela excederá a página A4 (297mm x 210mm), gerando o indesejado "verso" e quebrando a estética rígida do S-140.
*   **Ameaça (Duplicação):** Duplicar o gerador de PDF para "Semanas com evento" e "Semanas sem evento" geraria uma dívida técnica massiva (dobraria o esforço para qualquer atualização visual futura).
*   **Mitigação (Algoritmo Auto-Scale):** Manteremos o arquivo unificado (`s140GeneratorUnified.ts`). Implementaremos um algoritmo passivo que medirá a altura do contêiner HTML antes da renderização via `html2pdf`. Se ultrapassar o limite, a tabela sofrerá redução milimétrica em CSS (fonte e margens) num laço `while` até caber na A4. Semanas normais nunca ativarão o laço (Risco Zero).

### 2.2 Impacto na Experiência do Usuário (Tutoriais)
*   **Ameaça:** A mudança estrutural nos `checkboxes` e fluxos do modal React irá quebrar os seletores do `reactour`, causando erros ou telas confusas.
*   **Mitigação (Supressão Estratégica):** Os tutoriais da tela de Eventos Especiais serão temporariamente desativados (ocultados), permitindo focar 100% no algoritmo matemático sem interrupções de design. A reativação ocorrerá num ciclo futuro.

## 3. Implementação e Roteiro Determinístico (Código Duro)

### Camada Visual e Estado (`SpecialEventsManager.tsx`)
1. Comentar as invocações automáticas e os botões `<GuidedTour />`.
2. Remover a limitação `isInAddPartMode` substituindo-a pelo estado local `[formInjectPart, setFormInjectPart] = useState(false)`.
3. Criar estado `formS140Note` acoplado a um `useEffect` que sugere texto baseado no objeto `formGranularImpacts`, mas que permite sobresscrita humana via `<textarea>`.
4. No `handleSubmit`, persistir os dados no JSONB `details: { s140Note }` e popular o array de `impacts` com `ADD_PART` sob demanda.

### Camada de Serviço e Geração (`specialEventService.ts` & `s140GeneratorUnified.ts`)
1. Assegurar transações limpas do array de `impacts` sem corromper as `seq` (ordem cronológica).
2. Na compilação do `footerNotes` do S-140, abandonar o `switch` dedutivo, priorizando estritamente a variável `event.details.s140Note`.
3. Instanciar a checagem de `.scrollHeight > 1070` após o DOM estar pintado na memória, e acionar iteradores regressivos (`--base-font-size: 13pt` para 12.5pt, etc) no nó raiz do container da apostila.

---
*Documento gerado em 15/06/2026. Serve como testamento arquitetural para futuras avaliações.*
