import os
"""
Script para extrair status/condição dos cabeçalhos do EMR PDF e atualizar publishers.
"""
import re
from pathlib import Path

# Dados mapeados do EMR PDF com seus status
STATUS_DATA = {
    # ANCIÃOS
    "Diego Fontana": {"condition": "Ancião"},
    "Domingos Oliveira": {"condition": "Ancião"},
    "Edmardo Queiroz": {"condition": "Ancião"},
    "Edmilson Monteiro": {"condition": "Ancião"},
    "Eliezer Rosa": {"condition": "Ancião"},
    "Israel Vieira": {"condition": "Ancião"},
    "José Luiz Fouraux": {"condition": "Ancião"},
    "Marcos Rogério": {"condition": "Ancião"},
    "Marcos Vinícios": {"condition": "Ancião"},
    "Renato Oliveira": {"condition": "Ancião"},
    "Mario Porto": {"condition": "Ancião"},
    
    # SERVOS MINISTERIAIS
    "Alexsandro Lopes": {"condition": "Servo Ministerial"},
    "Daniel Silva": {"condition": "Servo Ministerial"},
    "Emerson Souza": {"condition": "Servo Ministerial"},
    "Felipe Oliveira": {"condition": "Servo Ministerial"},
    "Samuel Almeida": {"condition": "Servo Ministerial"},
    "Patrick Oliveira": {"condition": "Servo Ministerial"},
    "Júnior Fouraux": {"condition": "Servo Ministerial"},
    
    # NÃO APTOS OU NÃO ASSISTEM REUNIÃO
    "Leonardo Barjona Colangero Nascimento": {"isNotQualified": True},
    "Antônio Barjona Garcia Nascimento": {"isNotQualified": True},
    "Eugenio Longo": {"isNotQualified": True},
    "João Antonio": {"isNotQualified": True},
    "Edmar": {"isNotQualified": True},
    "Gerusa Souza": {"isNotQualified": True},
    "Brenda Cristine": {"isNotQualified": True},
    "Mauro Vieira": {"isNotQualified": True},
    "Auxiliadora Valéria Neves": {"isNotQualified": True},
    "Saniyuriss Reis": {"isNotQualified": True},
    "Amanda Garcia Ferreira Nascimento": {"isNotQualified": True},
    "Tamiris Mendes": {"isNotQualified": True},
    "Marcela Gomes": {"isNotQualified": True},
    "Raquel Elvira": {"isNotQualified": True},
    "Edlena": {"isNotQualified": True},
    "Maria Helena Carvalho Santos": {"isNotQualified": True},
    "Maria Aparecida Cândida Marques": {"isNotQualified": True},
    "Maria Eduarda Marques": {"isNotQualified": True},
    "Maria José Farias": {"isNotQualified": True},
    "Yasmin Reis dos Santos": {"isNotQualified": True},
    "Lídia Ramos": {"isNotQualified": True},
    "Ivone Oliveira": {"isNotQualified": True},
    "Jeane Pinto Gomes": {"isNotQualified": True},
    
    # PEDIRAM PARA NÃO PARTICIPAR
    "Rosa da Silva Miranda": {"requestedNoParticipation": True},
    "Aila Rosana Porto": {"requestedNoParticipation": True},
    "Aparecida Baldi": {"requestedNoParticipation": True},
    "Maria José Tonon da Cruz": {"requestedNoParticipation": True},
    "Melissa Rachel Porto Queiroz": {"requestedNoParticipation": True},
    "Tânia Mendes": {"requestedNoParticipation": True},
    "Solange Telles": {"requestedNoParticipation": True},
    "Laramara Rosa Nascimento": {"requestedNoParticipation": True},
    "Tatiana Muriel Fouraux": {"requestedNoParticipation": True},
    "Célia Regina": {"requestedNoParticipation": True},
    "Olívia Maria Porto": {"requestedNoParticipation": True},
    "Iná Trancoso Gervásio": {"requestedNoParticipation": True},
}

def update_publishers_file(status_data: dict):
    """Atualiza o arquivo initialPublishers.ts com os status."""
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    updated = 0
    
    # Processar linha por linha
    lines = content.split('\n')
    new_lines = []
    current_name = None
    
    # Padrões
    name_pattern = re.compile(r'name:\s*["\']([^"\']+)["\']')
    condition_pattern = re.compile(r'(condition:\s*)["\'][^"\']*["\']')
    isServing_pattern = re.compile(r'(isServing:\s*)(true|false)')
    
    for i, line in enumerate(lines):
        new_line = line
        
        # Detectar nome
        name_match = name_pattern.search(line)
        if name_match:
            current_name = name_match.group(1)
        
        # Atualizar condition
        if current_name and 'condition:' in line:
            name_lower = current_name.lower()
            for key, data in status_data.items():
                if key.lower() == name_lower or key.lower() in name_lower or name_lower in key.lower():
                    new_condition = data["condition"]
                    old_line = new_line
                    new_line = condition_pattern.sub(f'condition: "{new_condition}"', line)
                    if new_line != old_line:
                        updated += 1
                        print(f"✅ {current_name}: condition -> {new_condition}")
                    break
        
        # Atualizar isServing
        if current_name and 'isServing:' in line:
            name_lower = current_name.lower()
            for key, data in status_data.items():
                if key.lower() == name_lower or key.lower() in name_lower or name_lower in key.lower():
                    is_serving = str(data["isServing"]).lower()
                    new_line = isServing_pattern.sub(f'isServing: {is_serving}', line)
                    break
        
        new_lines.append(new_line)
    
    # Salvar
    ts_path.write_text('\n'.join(new_lines), encoding="utf-8")
    print(f"\n📊 Total atualizado: {updated} status")

def main():
    print("Atualizando status dos publicadores do EMR PDF...\n")
    update_publishers_file(STATUS_DATA)
    print("\n✅ Concluído!")

if __name__ == "__main__":
    main()
