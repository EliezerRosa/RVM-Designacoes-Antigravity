import os
"""
Script robusto para adicionar flags aos publicadores existentes.
Funciona adicionando as propriedades diretamente nos objetos JSON.
"""
import re
from pathlib import Path

# Lista completa de publicadores com flags
NOT_QUALIFIED = [
    "Eugenio Longo",
    "Gerusa Souza",
    "Brenda Cristine",
    "Tamiris Mendes",
    "Marcela Gomes",
    "Raquel Elvira",
    "Maria José Farias",
    "Lídia Ramos",
    "Ivone Oliveira",
    "Jeane Pinto Gomes",
    "Leonardo Barjona",
    "Antônio Barjona",
    "João Antonio",
    "Edmar",
    "Mauro Vieira",
    "Auxiliadora Valéria",
    "Saniyuriss",
    "Amanda Garcia",
    "Edlena",
    "Maria Helena Carvalho",
    "Maria Aparecida Cândida",
    "Maria Eduarda Marques",
    "Yasmin Reis",
    "Helena Carvalho",
    "Cândida Marques",
]

NO_PARTICIPATION = [
    "Rosa da Silva",
    "Aila Rosana",
    "Aparecida Baldi",
    "Maria José Tonon",
    "Melissa Rachel",
    "Tânia Mendes",
    "Solange Telles",
    "Laramara Rosa",
    "Tatiana Muriel",
    "Célia Regina",
    "Olívia Maria Porto",
    "Iná Trancoso",
]

def main():
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    updated_not_qualified = 0
    updated_no_participation = 0
    
    # Para cada publicador, encontrar e adicionar as flags
    for name_pattern in NOT_QUALIFIED:
        # Padrão para encontrar linha do aliases (última linha antes de fechar o objeto)
        pattern = rf'(name:\s*["\'](?:[^"\']*{re.escape(name_pattern)}[^"\']*)["\'].*?)(aliases:\s*\[[^\]]*\],?\s*)(\n\s*\}})'
        
        match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
        if match:
            # Verificar se já tem a flag
            if 'isNotQualified' not in match.group(0):
                replacement = match.group(1) + match.group(2) + '\n        isNotQualified: true,\n        requestedNoParticipation: false,' + match.group(3)
                content = content[:match.start()] + replacement + content[match.end():]
                updated_not_qualified += 1
                print(f"⚠️ Flag Não Apto: {name_pattern}")
    
    for name_pattern in NO_PARTICIPATION:
        pattern = rf'(name:\s*["\'](?:[^"\']*{re.escape(name_pattern)}[^"\']*)["\'].*?)(aliases:\s*\[[^\]]*\],?\s*)(\n\s*\}})'
        
        match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
        if match:
            if 'requestedNoParticipation' not in match.group(0):
                replacement = match.group(1) + match.group(2) + '\n        isNotQualified: false,\n        requestedNoParticipation: true,' + match.group(3)
                content = content[:match.start()] + replacement + content[match.end():]
                updated_no_participation += 1
                print(f"🙅 Flag Não Participa: {name_pattern}")
    
    # Salvar
    ts_path.write_text(content, encoding="utf-8")
    
    print(f"\n📊 Resumo:")
    print(f"   ⚠️ Não Aptos: {updated_not_qualified}")
    print(f"   🙅 Não Participar: {updated_no_participation}")
    print(f"\n✅ Arquivo atualizado!")

if __name__ == "__main__":
    main()
