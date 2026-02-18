"""
Script para atualizar flags de publicadores existentes no initialPublishers.ts
"""
import re
from pathlib import Path

# Mapa de nomes para suas flags
FLAG_UPDATES = {
    # NÃO APTOS OU NÃO ASSISTEM REUNIÃO
    "Eugenio Longo": {"isNotQualified": True, "requestedNoParticipation": False},
    "Gerusa Souza": {"isNotQualified": True, "requestedNoParticipation": False},
    "Brenda Cristine": {"isNotQualified": True, "requestedNoParticipation": False},
    "Tamiris Mendes": {"isNotQualified": True, "requestedNoParticipation": False},
    "Marcela Gomes": {"isNotQualified": True, "requestedNoParticipation": False},
    "Raquel Elvira": {"isNotQualified": True, "requestedNoParticipation": False},
    "Maria José Farias": {"isNotQualified": True, "requestedNoParticipation": False},
    "Lídia Ramos": {"isNotQualified": True, "requestedNoParticipation": False},
    "Ivone Oliveira": {"isNotQualified": True, "requestedNoParticipation": False},
    "Jeane Pinto Gomes": {"isNotQualified": True, "requestedNoParticipation": False},
    
    # PEDIRAM PARA NÃO PARTICIPAR
    "Rosa da Silva Miranda": {"isNotQualified": False, "requestedNoParticipation": True},
    "Aila Rosana Porto": {"isNotQualified": False, "requestedNoParticipation": True},
    "Aparecida Baldi": {"isNotQualified": False, "requestedNoParticipation": True},
    "Maria José Tonon da Cruz": {"isNotQualified": False, "requestedNoParticipation": True},
    "Melissa Rachel Porto Queiroz": {"isNotQualified": False, "requestedNoParticipation": True},
    "Tânia Mendes": {"isNotQualified": False, "requestedNoParticipation": True},
    "Solange Telles": {"isNotQualified": False, "requestedNoParticipation": True},
    "Laramara Rosa Nascimento": {"isNotQualified": False, "requestedNoParticipation": True},
    "Célia Regina": {"isNotQualified": False, "requestedNoParticipation": True},
    "Olívia Maria Porto": {"isNotQualified": False, "requestedNoParticipation": True},
    "Iná Trancoso Gervásio": {"isNotQualified": False, "requestedNoParticipation": True},
}

def main():
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    # Processar linha por linha
    lines = content.split('\n')
    new_lines = []
    current_name = None
    updated_count = 0
    in_publisher_block = False
    publisher_start_line = 0
    
    name_pattern = re.compile(r'name:\s*["\']([^"\']+)["\']')
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Detectar início de bloco de publicador
        if line.strip() == '{':
            in_publisher_block = True
            publisher_start_line = i
            current_name = None
        
        # Detectar nome do publicador
        name_match = name_pattern.search(line)
        if name_match:
            current_name = name_match.group(1)
        
        # Detectar fim de bloco de publicador
        if line.strip().startswith('},'):
            # Verificar se este publicador precisa de atualização de flags
            if current_name:
                name_match_key = None
                for key in FLAG_UPDATES:
                    if key.lower() in current_name.lower() or current_name.lower() in key.lower():
                        name_match_key = key
                        break
                
                if name_match_key:
                    flags = FLAG_UPDATES[name_match_key]
                    
                    # Verificar se as flags já existem neste bloco
                    block_content = '\n'.join(lines[publisher_start_line:i+1])
                    
                    if 'isNotQualified' not in block_content:
                        # Adicionar as flags antes do fechamento },
                        indent = "        "
                        flag_lines = [
                            f"{indent}isNotQualified: {str(flags['isNotQualified']).lower()},",
                            f"{indent}requestedNoParticipation: {str(flags['requestedNoParticipation']).lower()},"
                        ]
                        
                        # Inserir antes da linha atual (},)
                        new_lines.extend(flag_lines)
                        updated_count += 1
                        print(f"✅ Atualizado: {current_name}")
            
            in_publisher_block = False
            current_name = None
        
        new_lines.append(line)
        i += 1
    
    # Salvar
    ts_path.write_text('\n'.join(new_lines), encoding="utf-8")
    print(f"\n📊 Total atualizado: {updated_count} publicadores")

if __name__ == "__main__":
    main()
