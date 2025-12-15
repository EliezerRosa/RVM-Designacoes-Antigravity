"""
Script V2 para corrigir nomes concatenados no importedHistory.ts
Usa heurísticas inteligentes: nomes brasileiros tipicamente têm 2-3 palavras.
Se encontrar 4+ palavras, tenta separar em dois nomes.
"""
import json
import re
from pathlib import Path

# Sobrenomes comuns em português para ajudar na detecção de separação
COMMON_SURNAMES = {
    "silva", "santos", "oliveira", "souza", "costa", "pereira", "ferreira",
    "rodrigues", "almeida", "nascimento", "lima", "carvalho", "lopes", "gomes",
    "ribeiro", "martins", "rosa", "reis", "andrade", "campos", "queiroz",
    "vieira", "mendes", "telles", "fouraux", "porto", "duarte", "eugênio",
    "frança", "segall", "colangero", "balieira", "resmann", "pessanha",
    "pessoa", "correa", "correia", "guimarães", "bragança", "campanha",
    "ramos", "rangel", "schultz", "rastoldo", "camilo", "alexandrino",
    "candida", "cândida", "celia", "célia", "gonçalves", "cristine", "amorim",
    "longo", "vaz", "venturin", "izabel", "rubia", "rúbia", "cravo", "pinto",
    "paulo", "elena", "priscila", "dayse", "luiz", "agatha", "ágatha", "waleska"
}

# Primeiros nomes comuns para detecção
COMMON_FIRST_NAMES = {
    "ana", "maria", "sandra", "solange", "edna", "wanderleia", "terezinha",
    "vitoria", "waleska", "erika", "érika", "eliana", "elza", "dione", "dayse",
    "luciana", "margarete", "mara", "geysa", "malena", "ivone", "josyane",
    "márcia", "beatriz", "laramara", "daniel", "joão", "carlos", "marcos",
    "diego", "patrick", "gabriel", "vitor", "victor", "samuel", "andre", "andré",
    "jose", "josé", "junior", "júnior", "felipe", "emerson", "edmardo", "eliezer",
    "renato", "domingos", "israel", "mario", "mário", "antonio", "antônio",
    "getúlio", "saymon", "erick", "gustavo", "hidelmar", "vinicius", "vinícius",
    "rozelita", "keyla", "yngrid", "taina", "tainá", "juberto", "raquel",
    "suellen", "elina", "saniyuriss", "julianne", "jacyra", "olívia", "gérbera",
    "neuza", "priscila", "marcela", "tatiana", "larissa", "jeane", "mylena",
    "nanci", "célia", "débora", "agatha", "ágatha"
}

def is_likely_first_name(word: str) -> bool:
    """Verifica se a palavra parece ser um primeiro nome."""
    return word.lower().strip() in COMMON_FIRST_NAMES

def is_likely_surname(word: str) -> bool:
    """Verifica se a palavra parece ser um sobrenome."""
    return word.lower().strip() in COMMON_SURNAMES

def split_concatenated_name(raw_name: str) -> tuple[str, str | None]:
    """
    Tenta separar dois nomes concatenados.
    Retorna (nome1, nome2) ou (nome_original, None) se não encontrar separação.
    """
    words = raw_name.strip().split()
    
    # Menos de 4 palavras = provavelmente um único nome
    if len(words) < 4:
        return raw_name.strip(), None
    
    # Tentar encontrar o ponto de separação
    # Estratégia: procurar onde um sobrenome é seguido por um primeiro nome
    for i in range(1, len(words) - 1):
        current_word = words[i].lower().strip()
        next_word = words[i + 1].lower().strip()
        
        # Padrão: sobrenome seguido de primeiro nome
        if (is_likely_surname(current_word) or current_word.endswith("s") or current_word.endswith("a")) and \
           (is_likely_first_name(next_word) or next_word[0].isupper()):
            name1 = " ".join(words[:i + 1])
            name2 = " ".join(words[i + 1:])
            
            # Validar que ambos os nomes têm pelo menos 2 palavras ou 1 longa
            if len(name2.split()) >= 1 and len(name1.split()) >= 1:
                return name1.strip(), name2.strip()
    
    # Fallback: dividir no meio para nomes com 4-6 palavras
    if 4 <= len(words) <= 6:
        mid = len(words) // 2
        name1 = " ".join(words[:mid])
        name2 = " ".join(words[mid:])
        return name1.strip(), name2.strip()
    
    # Se nada funcionar, manter original
    return raw_name.strip(), None

def main():
    # Restaurar do backup
    backup_path = Path(__file__).parent.parent / "src" / "data" / "importedHistory.ts.bak"
    output_path = Path(__file__).parent.parent / "src" / "data" / "importedHistory.ts"
    
    if not backup_path.exists():
        print(f"Backup não encontrado: {backup_path}")
        return
    
    # Ler o conteúdo do backup
    content = backup_path.read_text(encoding="utf-8")
    
    # Extrair o JSON
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
        main_name, assistant = split_concatenated_name(raw_name)
        
        if assistant:
            fixed_count += 1
            print(f"✅ '{raw_name}' -> '{main_name}' + '{assistant}'")
            
            # Entrada do estudante
            new_p1 = p.copy()
            new_p1["raw_name"] = main_name
            new_participations.append(new_p1)
            
            # Entrada do ajudante
            new_p2 = p.copy()
            new_p2["raw_name"] = assistant
            new_p2["part"] = p.get("part", "") + " (Ajudante)"
            new_participations.append(new_p2)
        else:
            new_participations.append(p)
    
    print(f"\n📊 Total corrigido: {fixed_count} nomes concatenados")
    
    # Processar unknown_names - agregar por nome
    name_counts: dict[str, int] = {}
    for u in data.get("unknown_names", []):
        name = u.get("name", "")
        main_name, assistant = split_concatenated_name(name)
        count = u.get("count", 1)
        
        # Agregar nome principal
        name_counts[main_name] = name_counts.get(main_name, 0) + count
        
        # Agregar ajudante se houver
        if assistant:
            name_counts[assistant] = name_counts.get(assistant, 0) + count
    
    # Converter para lista
    new_unknown = [
        {"name": name, "count": count, "best_guess": name}
        for name, count in sorted(name_counts.items(), key=lambda x: -x[1])
    ]
    
    print(f"📊 Total de nomes únicos: {len(new_unknown)}")
    
    # Atualizar dados
    data["participations"] = new_participations
    data["unknown_names"] = new_unknown
    
    # Escrever resultado
    output_content = "export const importedHistory = " + json.dumps(data, indent=2, ensure_ascii=False) + ";\n"
    output_path.write_text(output_content, encoding="utf-8")
    print(f"\n✅ Arquivo corrigido salvo: {output_path}")

if __name__ == "__main__":
    main()
