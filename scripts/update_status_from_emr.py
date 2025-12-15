"""
Script para extrair status/condição dos cabeçalhos do EMR PDF e atualizar publishers.
"""
import re
from pathlib import Path

# Dados mapeados do EMR PDF com seus status
STATUS_DATA = {
    # ANCIÃOS
    "Diego Fontana": {"condition": "Ancião", "isServing": True},
    "Domingos Oliveira": {"condition": "Ancião", "isServing": True},
    "Edmardo Queiroz": {"condition": "Ancião", "isServing": True},
    "Edmilson Monteiro": {"condition": "Ancião", "isServing": True},
    "Eliezer Rosa": {"condition": "Ancião", "isServing": True},
    "Israel Vieira": {"condition": "Ancião", "isServing": True},
    "José Luiz Fouraux": {"condition": "Ancião", "isServing": True},
    "Marcos Rogério": {"condition": "Ancião", "isServing": True},
    "Marcos Vinícios": {"condition": "Ancião", "isServing": True},
    "Renato Oliveira": {"condition": "Ancião", "isServing": True},
    "Mario Porto": {"condition": "Ancião", "isServing": True},
    
    # SERVOS MINISTERIAIS
    "Alexsandro Lopes": {"condition": "Servo Ministerial", "isServing": True},
    "Daniel Silva": {"condition": "Servo Ministerial", "isServing": True},
    "Emerson Souza": {"condition": "Servo Ministerial", "isServing": True},
    "Felipe Oliveira": {"condition": "Servo Ministerial", "isServing": True},
    "Samuel Almeida": {"condition": "Servo Ministerial", "isServing": True},
    "Patrick Oliveira": {"condition": "Servo Ministerial", "isServing": True},
    "Júnior Fouraux": {"condition": "Servo Ministerial", "isServing": True},
    
    # NÃO APTOS OU NÃO ASSISTEM REUNIÃO
    "Leonardo Barjona Colangero Nascimento": {"condition": "Publicador", "isServing": False},
    "Antônio Barjona Garcia Nascimento": {"condition": "Publicador", "isServing": False},
    "Eugenio Longo": {"condition": "Publicador", "isServing": False},
    "João Antonio": {"condition": "Publicador", "isServing": False},
    "Edmar": {"condition": "Publicador", "isServing": False},
    "Gerusa Souza": {"condition": "Publicador", "isServing": False},
    "Brenda Cristine": {"condition": "Publicador", "isServing": False},
    "Mauro Vieira": {"condition": "Publicador", "isServing": False},
    "Auxiliadora Valéria Neves": {"condition": "Publicador", "isServing": False},
    "Saniyuriss Reis": {"condition": "Publicador", "isServing": False},
    "Amanda Garcia Ferreira Nascimento": {"condition": "Publicador", "isServing": False},
    "Tamiris Mendes": {"condition": "Publicador", "isServing": False},
    "Marcela Gomes": {"condition": "Publicador", "isServing": False},
    "Raquel Elvira": {"condition": "Publicador", "isServing": False},
    "Edlena": {"condition": "Publicador", "isServing": False},
    "Maria Helena Carvalho Santos": {"condition": "Publicador", "isServing": False},
    "Maria Aparecida Cândida Marques": {"condition": "Publicador", "isServing": False},
    "Maria Eduarda Marques": {"condition": "Publicador", "isServing": False},
    "Maria José Farias": {"condition": "Publicador", "isServing": False},
    "Yasmin Reis dos Santos": {"condition": "Publicador", "isServing": False},
    "Lídia Ramos": {"condition": "Publicador", "isServing": False},
    "Ivone Oliveira": {"condition": "Publicador", "isServing": False},
    "Jeane Pinto Gomes": {"condition": "Publicador", "isServing": False},
    
    # PEDIRAM PARA NÃO PARTICIPAR
    "Rosa da Silva Miranda": {"condition": "Publicador", "isServing": False},
    "Aila Rosana Porto": {"condition": "Publicador", "isServing": False},
    "Aparecida Baldi": {"condition": "Publicador", "isServing": False},
    "Maria José Tonon da Cruz": {"condition": "Publicador", "isServing": False},
    "Melissa Rachel Porto Queiroz": {"condition": "Publicador", "isServing": False},
    "Tânia Mendes": {"condition": "Publicador", "isServing": False},
    "Solange Telles": {"condition": "Publicador", "isServing": False},
    "Laramara Rosa Nascimento": {"condition": "Publicador", "isServing": False},
    "Tatiana Muriel Fouraux": {"condition": "Publicador", "isServing": False},
    "Célia Regina": {"condition": "Publicador", "isServing": False},
    "Olívia Maria Porto": {"condition": "Publicador", "isServing": False},
    "Iná Trancoso Gervásio": {"condition": "Publicador", "isServing": False},
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
