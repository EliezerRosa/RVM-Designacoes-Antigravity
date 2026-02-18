"""
Script para adicionar novos publicadores do EMR ao initialPublishers.ts
"""
import re
from pathlib import Path

# Lista de nomes válidos extraídos do EMR PDF (filtrados manualmente)
NEW_PUBLISHERS = [
    # Homens
    ("Diego Fontana", "brother"),
    ("Marcos Vinícios", "brother"),
    ("Mario Porto", "brother"),  # pode já existir como Mário Porto
    ("Alexsandro Lopes", "brother"),
    ("Daniel Silva", "brother"),
    ("Emerson Souza", "brother"),
    ("Felipe Oliveira", "brother"),
    ("Patrick Oliveira", "brother"),
    ("Júnior Fouraux", "brother"),
    ("Cláudio Vieira", "brother"),
    ("Carlos Augusto", "brother"),
    ("André Luiz", "brother"),
    ("Eryck Segall", "brother"),
    ("Edmilson Pessanha", "brother"),
    ("Fernando Balieira", "brother"),
    ("Gabriel Fouraux", "brother"),
    ("Gustavo Rangel", "brother"),
    ("Gérson Santos", "brother"),
    ("Victor Correa", "brother"),
    ("Daniel Carneiro", "brother"),
    ("Felipe de Oliveira", "brother"),
    ("Saymon Schultz", "brother"),
    ("Vinícius Pessanha", "brother"),
    ("João Paulo", "brother"),
    ("Eugenio Longo", "brother"),
    ("Juberto Santos", "brother"),
    
    # Mulheres
    ("Ana Paula Oliveira", "sister"),
    ("Ariane Bello", "sister"),
    ("Ágatha do Nascimento", "sister"),
    ("Dayse Campos", "sister"),
    ("Débora Cristine", "sister"),
    ("Érika Segall", "sister"),
    ("Elina Mendes", "sister"),
    ("Edna Costa", "sister"),
    ("Eliana Souza", "sister"),
    ("Elza Elena", "sister"),
    ("Geysa Nascimento", "sister"),
    ("Gérbera Nascimento", "sister"),
    ("Inêz Monteiro", "sister"),
    ("Ivone Balieira", "sister"),
    ("Isabelle Cruz", "sister"),
    ("Jacyra Eugênio", "sister"),
    ("Josyane Vieira", "sister"),
    ("Julianne Cravo", "sister"),
    ("Keyla Costa", "sister"),
    ("Larissa Queiroz", "sister"),
    ("Luciana Marques", "sister"),
    ("Luciana Alves", "sister"),
    ("Mylena Balieira", "sister"),
    ("Maria de Lourdes", "sister"),
    ("Marcela Resmann", "sister"),
    ("Maria Izabel", "sister"),
    ("Márcia Rosa", "sister"),
    ("Márcia Bragança", "sister"),
    ("Margarete Venturin", "sister"),
    ("Mara Rúbia", "sister"),
    ("Marilene Queiroz", "sister"),
    ("Malena Colangero", "sister"),
    ("Michele Camillo", "sister"),
    ("Nazaré de Lima", "sister"),
    ("Nanci Celia", "sister"),
    ("Neuza Campanha", "sister"),
    ("Raquel Oliveira", "sister"),
    ("Reica Santana", "sister"),
    ("Rozelita Sales", "sister"),
    ("Sandra Duarte", "sister"),
    ("Suellen Correa", "sister"),
    ("Sirlene Ramos", "sister"),
    ("Yngrid França", "sister"),
    ("Terezinha Oliveira", "sister"),
    ("Vitoria Emanuelle", "sister"),
    ("Waleska Nascimento", "sister"),
    ("Gerusa Souza", "sister"),
    ("Brenda Cristine", "sister"),
    ("Saniyuriss Reis", "sister"),
    ("Tamiris Mendes", "sister"),
    ("Marcela Gomes", "sister"),
    ("Helena Carvalho", "sister"),
    ("Cândida Marques", "sister"),
    ("Maria Eduarda Marques", "sister"),
    ("Maria José Farias", "sister"),
    ("Ivone Oliveira", "sister"),
    ("Tânia Mendes", "sister"),
    ("Solange Telles", "sister"),
    ("Laramara Rosa Nascimento", "sister"),
    ("Tatiana Muriel Fouraux", "sister"),
    ("Célia Regina", "sister"),
    ("Olívia Maria Porto", "sister"),
    ("Dione Guimarães", "sister"),
    ("Priscila Santos", "sister"),
    ("Tainá Reis", "sister"),
    ("Wanderleia Santos", "sister"),
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

def generate_publisher_entry(pub_id: int, name: str, gender: str) -> str:
    """Gera a entrada TypeScript para um publicador."""
    is_brother = gender == "brother"
    
    return f'''    {{
        id: "{pub_id}",
        name: "{name}",
        gender: "{gender}" as const,
        condition: "Publicador" as const,
        phone: "",
        isBaptized: true,
        isServing: true,
        ageGroup: "Adulto" as const,
        parentIds: [],
        isHelperOnly: {str(not is_brother).lower()},
        canPairWithNonParent: true,
        privileges: {{
            canGiveTalks: {str(is_brother).lower()},
            canConductCBS: false,
            canReadCBS: {str(is_brother).lower()},
            canPray: {str(is_brother).lower()},
            canPreside: false,
        }},
        privilegesBySection: {{
            canParticipateInTreasures: true,
            canParticipateInMinistry: true,
            canParticipateInLife: true,
        }},
        availability: {{ mode: "always" as const, exceptionDates: [] }},
        aliases: [],
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
    
    for name, gender in NEW_PUBLISHERS:
        if name.lower() not in existing_names:
            entry = generate_publisher_entry(next_id, name, gender)
            new_entries.append(entry)
            print(f"+ Adicionando: {name}")
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
    print(f"\n✅ Adicionados {added_count} novos publicadores")

if __name__ == "__main__":
    main()
