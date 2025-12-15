"""
Script para extrair telefones do texto do EMR PDF e atualizar initialPublishers.ts
"""
import re
from pathlib import Path

# Dados extraídos do EMR PDF
PHONE_DATA = """
Alexsandro Lopes [27 99652-8686]
Cláudio Vieira [27 99842-4152]
Carlos Augusto [27 98864-7171]
Emerson França [27 99613-3137]
Patrick de Oliveira [27 99959-8949]
Samuel Almeida [27 99624-5928]
André Luiz [27 99844-7126]
Antônio Nascimento [27 98111-9805]
Daniel Silva [27 99695-2195]
Eryck Segall [27 99512-5833]
Edmilson Pessanha [27 99970-4928]
Fernando Balieira [27 98101-8424]
Gabriel Fouraux [27 99238-8157]
Gustavo Rangel [27 99979-5638]
Gérson Santos [71 98479-8864]
Luiz Alexandrino [27 98805-5100]
João Mendes [27 99895-6799]
Júnior Fouraux [27 99298-9988]
Victor Correa [27 99820-5347]
Antônio Miguel [27 99292-8631]
Carlos Ramos [27 98178-1342]
Daniel Carneiro [27 99939-3340]
Felipe de Oliveira [27 99942-1370]
Saymon Schultz [27 99247-3651]
Vinícius Pessanha [27 99590-4437]
Vitor Pessanha [27 99726-6591]
Ana Paula Oliveira [27 99309-8093]
Ariane Bello [27 99835-3014]
Ágatha do Nascimento [27 99288-0526]
Dayse Campos [27 99284-6954]
Débora Cristine [27 99531-2445]
Érika Segall [27 99972-7739]
Elina Mendes [61 8622-2151]
Edna Costa dos Santos [27 98811-7244]
Eliana Souza [27 98129-6551]
Elza Elena [27 99797-6498]
Geysa Nascimento [27 99293-4687]
Gérbera Nascimento [27 99245-3895]
Inêz Monteiro [27 99793-5590]
Ivone Balieira [21 96538-9404]
Isabelle Cruz [27 99839-5719]
Jacyra Eugênio [27 98813-1290]
Josyane Vieira [27 99809-8099]
Julianne Cravo Figueredo [27 99821-4512]
Keyla Costa [27 98849-2005]
Larissa Queiroz [27 99779-5605]
Luciana Marques [27 99237-1244]
Luciana Alves [31 9394-9672]
Maria de Lourdes [27 99247-3651]
Marcela Resmann [27 99737-1276]
Maria Izabel [27 99527-0049]
Márcia Rosa [27 98117-0400]
Márcia Bragança [27 99794-3143]
Margarete Venturin [27 99792-4986]
Mara Rúbia [27 99733-8016]
Marilene Queiroz [28 99973-6468]
Malena Colangero [27 99264-1214]
Michele Camillo [27 98136-1505]
Nanci Celia [21 98684-4383]
Neuza Campanha [27 99831-3861]
Priscila [81 9291-9973]
Raquel Oliveira [27 99780-6764]
Reica Santana Ribeiro [27 99921-6136]
Rozelita Sales [27 99859-5458]
Sandra Duarte [27 99660-0407]
Suellen Correa [27 99737-5030]
Sirlene Ramos [27 98838-8707]
Yngrid França [27 99265-4811]
Terezinha Oliveira [27 99765-7258]
Vitoria Emanuelle [27 92001-7006]
Waleska Nascimento [27 99893-1684]
"""

def parse_phone_data() -> dict[str, str]:
    """Extrai pares nome->telefone dos dados."""
    phone_map = {}
    pattern = re.compile(r'([^[]+)\s*\[([^\]]+)\]')
    
    for line in PHONE_DATA.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        
        match = pattern.match(line)
        if match:
            name = match.group(1).strip()
            phone = match.group(2).strip()
            phone_map[name.lower()] = phone
            # Também adicionar variações do nome
            # Ex: "Edna Costa dos Santos" -> também mapear "Edna Costa"
            words = name.split()
            if len(words) > 2:
                short_name = " ".join(words[:2])
                phone_map[short_name.lower()] = phone
    
    return phone_map

def update_publishers_file(phone_map: dict[str, str]):
    """Atualiza o arquivo initialPublishers.ts com os telefones."""
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    # Para cada publicador, encontrar e atualizar o telefone
    updated = 0
    
    # Padrão para encontrar cada publicador
    pub_pattern = re.compile(r'name:\s*["\']([^"\']+)["\']')
    phone_pattern = re.compile(r'(phone:\s*)["\'][^"\']*["\']')
    
    # Processar linha por linha para manter contexto
    lines = content.split('\n')
    new_lines = []
    current_name = None
    
    for line in lines:
        new_line = line
        
        # Detectar nome
        name_match = pub_pattern.search(line)
        if name_match:
            current_name = name_match.group(1)
        
        # Se encontrar linha de telefone e temos um nome
        if current_name and 'phone:' in line:
            name_lower = current_name.lower()
            
            # Procurar telefone no mapeamento
            phone = phone_map.get(name_lower)
            
            # Tentar variações
            if not phone:
                for key, value in phone_map.items():
                    if key in name_lower or name_lower in key:
                        phone = value
                        break
            
            if phone:
                # Atualizar a linha
                new_line = phone_pattern.sub(f'phone: "{phone}"', line)
                if new_line != line:
                    updated += 1
                    print(f"✅ {current_name}: {phone}")
        
        new_lines.append(new_line)
    
    # Salvar
    ts_path.write_text('\n'.join(new_lines), encoding="utf-8")
    print(f"\n📊 Total atualizado: {updated} telefones")

def main():
    print("Extraindo telefones do EMR PDF...")
    phone_map = parse_phone_data()
    print(f"Encontrados {len(phone_map)} telefones\n")
    
    print("Atualizando initialPublishers.ts...")
    update_publishers_file(phone_map)
    print("\n✅ Concluído!")

if __name__ == "__main__":
    main()
