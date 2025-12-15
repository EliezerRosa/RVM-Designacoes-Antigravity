"""
Script para adicionar publicadores que estão nas categorias especiais do EMR PDF:
- NÃO APTOS OU NÃO ASSISTEM REUNIÃO
- PEDIRAM PARA NÃO PARTICIPAR
"""
import re
from pathlib import Path

# Publicadores que estão em categorias especiais
SPECIAL_PUBLISHERS = [
    # NÃO APTOS OU NÃO ASSISTEM REUNIÃO
    ("Leonardo Barjona Colangero Nascimento", "brother", True, False),
    ("Antônio Barjona Garcia Nascimento", "brother", True, False),
    ("Eugenio Longo", "brother", True, False),
    ("João Antonio", "brother", True, False),
    ("Edmar", "brother", True, False),
    ("Gerusa Souza", "sister", True, False),
    ("Brenda Cristine Cunha Pacheco", "sister", True, False),
    ("Mauro Vieira", "brother", True, False),
    ("Auxiliadora Valéria Neves", "sister", True, False),
    ("Saniyuriss Bernardes dos Reis", "sister", True, False),
    ("Amanda Garcia Ferreira Nascimento", "sister", True, False),
    ("Tamiris Mendes", "sister", True, False),
    ("Marcela Gomes Coelho", "sister", True, False),
    ("Raquel Elvira", "sister", True, False),
    ("Edlena", "sister", True, False),
    ("Maria Helena Carvalho Santos", "sister", True, False),
    ("Maria Aparecida Cândida Marques", "sister", True, False),
    ("Maria Eduarda Marques Carone Reis", "sister", True, False),
    ("Maria José Farias", "sister", True, False),
    ("Yasmin Reis dos Santos", "sister", True, False),
    ("Lídia Ramos", "sister", True, False),
    ("Ivone Oliveira", "sister", True, False),
    ("Jeane Pinto Gomes", "sister", True, False),
    
    # PEDIRAM PARA NÃO PARTICIPAR
    ("Rosa da Silva Miranda", "sister", False, True),
    ("Aila Rosana Porto", "sister", False, True),
    ("Aparecida Baldi", "sister", False, True),
    ("Maria José Tonon da Cruz", "sister", False, True),
    ("Melissa Rachel Porto Queiroz", "sister", False, True),
    ("Tânia Mendes", "sister", False, True),
    ("Solange Telles", "sister", False, True),
    ("Laramara Rosa Nascimento", "sister", False, True),
    ("Tatiana", "sister", False, True),
    ("Célia Regina Figueiredo", "sister", False, True),
    ("Olívia Maria Porto", "sister", False, True),
    ("Iná Trancoso Gervásio", "sister", False, True),
]

def get_existing_names(content: str) -> set[str]:
    """Extrai nomes existentes do arquivo."""
    name_pattern = re.compile(r'name:\s*["\']([^"\']+)["\']')
    return {n.lower() for n in name_pattern.findall(content)}

def get_next_id(content: str) -> int:
    """Encontra o próximo ID disponível."""
    id_pattern = re.compile(r'id:\s*["\'](\d+)["\']')
    ids = [int(m) for m in id_pattern.findall(content)]
    return max(ids) + 1 if ids else 1

def generate_publisher_entry(pub_id: int, name: str, gender: str, is_not_qualified: bool, requested_no_participation: bool) -> str:
    """Gera a entrada TypeScript para um publicador."""
    is_brother = gender == "brother"
    
    return f'''    {{
        id: "{pub_id}",
        name: "{name}",
        gender: "{gender}" as const,
        condition: "Publicador" as const,
        phone: "",
        isBaptized: true,
        isServing: false,
        ageGroup: "Adulto" as const,
        parentIds: [],
        isHelperOnly: {str(not is_brother).lower()},
        canPairWithNonParent: true,
        privileges: {{
            canGiveTalks: false,
            canConductCBS: false,
            canReadCBS: false,
            canPray: false,
            canPreside: false,
        }},
        privilegesBySection: {{
            canParticipateInTreasures: false,
            canParticipateInMinistry: false,
            canParticipateInLife: false,
        }},
        availability: {{ mode: "always" as const, exceptionDates: [] }},
        aliases: [],
        isNotQualified: {str(is_not_qualified).lower()},
        requestedNoParticipation: {str(requested_no_participation).lower()},
    }},'''

def main():
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    existing_names = get_existing_names(content)
    next_id = get_next_id(content)
    
    print(f"Próximo ID: {next_id}")
    print(f"Publicadores existentes: {len(existing_names)}")
    
    # Gerar entradas para novos publicadores
    new_entries = []
    added_count = 0
    
    for name, gender, is_not_qualified, requested_no_participation in SPECIAL_PUBLISHERS:
        if name.lower() not in existing_names:
            entry = generate_publisher_entry(next_id, name, gender, is_not_qualified, requested_no_participation)
            new_entries.append(entry)
            flag = "⚠️ Não Apto" if is_not_qualified else "🙅 Não Participa"
            print(f"+ Adicionando: {name} ({flag})")
            next_id += 1
            added_count += 1
        else:
            print(f"  Já existe: {name}")
    
    if not new_entries:
        print("\nNenhum novo publicador para adicionar.")
        return
    
    # Inserir antes do fechamento do array
    insert_marker = "];"
    insert_pos = content.rfind(insert_marker)
    
    if insert_pos == -1:
        print("Erro: não encontrou o marcador de fechamento do array")
        return
    
    new_content = content[:insert_pos] + "\n".join(new_entries) + "\n" + content[insert_pos:]
    
    # Salvar
    ts_path.write_text(new_content, encoding="utf-8")
    print(f"\n✅ Adicionados {added_count} publicadores com flags especiais")

if __name__ == "__main__":
    main()
