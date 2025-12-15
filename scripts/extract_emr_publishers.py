"""
Script para extrair nomes do PDF 'EMR Material - Fernando out 2015.pdf'
e identificar quais não estão na lista de publicadores iniciais.
"""
import re
from pathlib import Path
from pypdf import PdfReader

def extract_names_from_pdf(pdf_path: str) -> list[str]:
    """Extrai nomes que parecem ser de pessoas do PDF."""
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    
    # Salvar texto extraído para análise
    output_path = Path(__file__).parent / "emr_extracted_text.txt"
    output_path.write_text(text, encoding="utf-8")
    print(f"Texto extraído salvo em: {output_path}")
    
    # Padrões para encontrar nomes
    # Nomes brasileiros tipicamente têm 2-4 palavras começando com maiúscula
    name_pattern = re.compile(r'\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,4})\b')
    
    potential_names = name_pattern.findall(text)
    
    # Filtrar nomes que parecem válidos (2-4 palavras, não muito longos)
    valid_names = []
    for name in potential_names:
        words = name.split()
        if 2 <= len(words) <= 5 and len(name) > 5:
            # Ignorar padrões que não são nomes
            if not any(skip in name.lower() for skip in ['semana', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'salmo', 'parte', 'reunião', 'vida', 'ministério']):
                valid_names.append(name.strip())
    
    # Remover duplicatas mantendo ordem
    seen = set()
    unique_names = []
    for name in valid_names:
        if name.lower() not in seen:
            seen.add(name.lower())
            unique_names.append(name)
    
    return unique_names

def get_existing_publishers() -> set[str]:
    """Lê os nomes dos publicadores já cadastrados."""
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    # Extrair nomes do TypeScript
    name_pattern = re.compile(r'name:\s*["\']([^"\']+)["\']')
    return set(name_pattern.findall(content))

def main():
    pdf_path = Path(__file__).parent.parent.parent / "EMR Material - Fernando out 2015.pdf"
    
    if not pdf_path.exists():
        print(f"PDF não encontrado: {pdf_path}")
        return
    
    print(f"Extraindo nomes de: {pdf_path}")
    
    # Extrair nomes do PDF
    pdf_names = extract_names_from_pdf(str(pdf_path))
    print(f"\nNomes extraídos do PDF: {len(pdf_names)}")
    
    # Obter publicadores existentes
    existing = get_existing_publishers()
    print(f"Publicadores existentes: {len(existing)}")
    
    # Encontrar nomes novos (não existentes)
    existing_lower = {n.lower() for n in existing}
    new_names = []
    for name in pdf_names:
        if name.lower() not in existing_lower:
            new_names.append(name)
    
    print(f"\n=== NOMES NOVOS (não cadastrados) ===")
    for i, name in enumerate(new_names, 1):
        print(f"{i}. {name}")
    
    # Salvar em arquivo para revisão
    output_path = Path(__file__).parent / "new_publishers_from_emr.txt"
    output_path.write_text("\n".join(new_names), encoding="utf-8")
    print(f"\nLista salva em: {output_path}")

if __name__ == "__main__":
    main()
