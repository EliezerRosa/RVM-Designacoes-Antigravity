"""
Script para corrigir nomes concatenados no importedHistory.ts
Usa a lista de publicadores conhecidos para detectar onde separar nomes.
"""
import json
import re
from pathlib import Path
from difflib import SequenceMatcher

# Carregar publicadores conhecidos
KNOWN_PUBLISHERS = [
    "Ademar Gomes", "Alessandro Rosa", "Alexsandro Lopes", "Ana Beatriz Ferreira",
    "Ana Clara Santos", "Ana Paula Oliveira", "André Luiz", "Angela Maria",
    "Antonio Carlos", "Bianca Eugênio", "Carlos Alberto", "Carlos Eduardo",
    "Carlos Henrique", "Celso Roberto", "Claudia Silva", "Cristiane Souza",
    "Daniel Figueiredo", "Daniel Silva", "Diego Fontana", "Diego Resmann",
    "Edilene Souza", "Edmardo Queiroz", "Eduardo Santos", "Eliezer Rosa",
    "Emerson França", "Emerson Souza", "Eryck Segall", "Felipe Oliveira",
    "Fernando Pessoa", "Flávio Santos", "Gabriel Fouraux", "Gérson Santos",
    "Giovanna Reis", "Gustavo Lima", "Helena Costa", "Isabela Almeida",
    "Jacyra Eugênio", "João Pedro", "Jonas Silva", "José Carlos",
    "Juberto Santos", "Juliane Pinto", "Júnior Fouraux", "Keyla Costa",
    "Larissa Queiroz", "Leonardo Santos", "Letícia Ferreira", "Lúcia Helena",
    "Luiz Alexandrino", "Malena Colangero", "Marcela Souza", "Márcia Regina",
    "Marcos Rogério", "Marcos Vinícius", "Maria Aparecida", "Maria Clara",
    "Mario Porto", "Marilene Queiroz", "Marta Oliveira", "Patrick de Oliveira",
    "Patrick Oliveira", "Paula Cristina", "Paulo César", "Paulo Roberto",
    "Pedro Henrique", "Rafael Costa", "Raquel Oliveira", "Ricardo Silva",
    "Roberto Carlos", "Rodrigo Santos", "Roselita Sales", "Rozelita Sales",
    "Samuel Almeida", "Sandra Regina", "Sérgio Costa", "Silvia Eugênio",
    "Simone Alves", "Suellen Souza", "Tatiane Silva", "Terezinha Oliveira",
    "Tiago Souza", "Vinicius Pessanha", "Vitoria Emanuelle", "Vitor Correa",
    "Vitor Pessanha", "Victor Correa", "Wanderleia Santos", "Yngrid França",
]

def normalize(name: str) -> str:
    """Normalize name for comparison."""
    return name.lower().strip()

def find_split_point(concatenated: str, known_names: list[str]) -> tuple[str, str] | None:
    """
    Tenta encontrar onde dois nomes foram concatenados.
    Ex: "André Luiz Raquel Oliveira" -> ("André Luiz", "Raquel Oliveira")
    """
    norm_concat = normalize(concatenated)
    
    # Ordenar por tamanho decrescente para match mais específico primeiro
    sorted_names = sorted(known_names, key=len, reverse=True)
    
    for name1 in sorted_names:
        norm_name1 = normalize(name1)
        if norm_concat.startswith(norm_name1 + " "):
            # Encontrou possível primeiro nome
            remaining = concatenated[len(name1):].strip()
            
            # Verificar se o restante também é um nome conhecido
            for name2 in sorted_names:
                if normalize(remaining) == normalize(name2):
                    return (name1, name2)
                    
            # Verificar match parcial para o segundo nome
            for name2 in sorted_names:
                if remaining.lower().startswith(name2.lower().split()[0].lower()):
                    # Match no primeiro nome
                    return (name1, remaining)
    
    return None

def fix_raw_name(raw_name: str, known_names: list[str]) -> tuple[str, str | None]:
    """
    Corrige um raw_name que pode ter nomes concatenados.
    Retorna (nome_principal, ajudante_ou_None)
    """
    # Primeiro, verificar separadores explícitos
    if "+" in raw_name:
        parts = raw_name.split("+", 1)
        return parts[0].strip(), parts[1].strip() if len(parts) > 1 else None
    
    if " / " in raw_name:
        parts = raw_name.split(" / ", 1)
        return parts[0].strip(), parts[1].strip() if len(parts) > 1 else None
    
    # Tentar detectar concatenação
    split = find_split_point(raw_name, known_names)
    if split:
        return split
    
    # Sem concatenação detectada
    return raw_name.strip(), None

def main():
    # Caminho do arquivo
    input_path = Path(__file__).parent.parent / "src" / "data" / "importedHistory.ts"
    
    if not input_path.exists():
        print(f"Arquivo não encontrado: {input_path}")
        return
    
    # Ler o conteúdo
    content = input_path.read_text(encoding="utf-8")
    
    # Extrair o JSON (remover export statement)
    json_match = re.search(r"export const importedHistory = ({.*});?\s*$", content, re.DOTALL)
    if not json_match:
        print("Não consegui extrair JSON do arquivo")
        return
    
    try:
        data = json.loads(json_match.group(1))
    except json.JSONDecodeError as e:
        print(f"Erro ao parsear JSON: {e}")
        return
    
    # Processar participações
    fixed_count = 0
    new_participations = []
    
    for p in data.get("participations", []):
        raw_name = p.get("raw_name", "")
        main_name, assistant = fix_raw_name(raw_name, KNOWN_PUBLISHERS)
        
        if assistant:
            # Nome foi separado - criar duas entradas
            fixed_count += 1
            print(f"CORRIGIDO: '{raw_name}' -> '{main_name}' + '{assistant}'")
            
            # Entrada do estudante principal
            new_p1 = p.copy()
            new_p1["raw_name"] = main_name
            new_p1["_was_split"] = True
            new_participations.append(new_p1)
            
            # Entrada do ajudante
            new_p2 = p.copy()
            new_p2["raw_name"] = assistant
            new_p2["part"] = p.get("part", "") + " (Ajudante)"
            new_p2["_was_split"] = True
            new_participations.append(new_p2)
        else:
            # Manter original
            new_participations.append(p)
    
    print(f"\nTotal corrigido: {fixed_count} nomes concatenados")
    
    # Atualizar unknown_names também
    new_unknown = []
    for u in data.get("unknown_names", []):
        name = u.get("name", "")
        main_name, assistant = fix_raw_name(name, KNOWN_PUBLISHERS)
        
        if assistant:
            # Separar em duas entradas
            new_unknown.append({"name": main_name, "count": u.get("count", 1), "best_guess": main_name})
            new_unknown.append({"name": assistant, "count": u.get("count", 1), "best_guess": assistant})
        else:
            new_unknown.append(u)
    
    # Atualizar dados
    data["participations"] = new_participations
    data["unknown_names"] = new_unknown
    
    # Escrever de volta
    output_content = "export const importedHistory = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n"
    
    # Backup do original
    backup_path = input_path.with_suffix(".ts.bak")
    input_path.rename(backup_path)
    print(f"Backup criado: {backup_path}")
    
    # Salvar corrigido
    input_path.write_text(output_content, encoding="utf-8")
    print(f"Arquivo corrigido salvo: {input_path}")

if __name__ == "__main__":
    main()
