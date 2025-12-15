"""
Script corrigido para adicionar flags de status nos publicadores.
Adiciona as flags APÓS a linha "aliases: []," e ANTES do fechamento "},".
"""
import re
from pathlib import Path

# Publicadores com suas flags
FLAGS = {
    # NÃO APTOS OU NÃO ASSISTEM REUNIÃO (isNotQualified: true)
    "Eugenio Longo": "isNotQualified",
    "Gerusa Souza": "isNotQualified",
    "Brenda Cristine": "isNotQualified",
    "Tamiris Mendes": "isNotQualified",
    "Marcela Gomes": "isNotQualified",
    "Raquel Elvira": "isNotQualified",
    "Maria José Farias": "isNotQualified",
    "Lídia Ramos": "isNotQualified",
    "Ivone Oliveira": "isNotQualified",
    "Jeane Pinto": "isNotQualified",
    "Helena Carvalho": "isNotQualified",
    "Cândida Marques": "isNotQualified",
    "Saniyuriss": "isNotQualified",
    "Maria Eduarda Marques": "isNotQualified",
    
    # PEDIRAM PARA NÃO PARTICIPAR (requestedNoParticipation: true)
    "Rosa da Silva": "requestedNoParticipation",
    "Aila Rosana": "requestedNoParticipation",
    "Aparecida Baldi": "requestedNoParticipation",
    "Maria José Tonon": "requestedNoParticipation",
    "Melissa Rachel": "requestedNoParticipation",
    "Tânia Mendes": "requestedNoParticipation",
    "Solange Telles": "requestedNoParticipation",
    "Laramara Rosa": "requestedNoParticipation",
    "Tatiana Muriel": "requestedNoParticipation",
    "Célia Regina": "requestedNoParticipation",
    "Olívia Maria": "requestedNoParticipation",
    "Iná Trancoso": "requestedNoParticipation",
}

def main():
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    content = ts_path.read_text(encoding="utf-8")
    
    updated = 0
    
    for name_pattern, flag_type in FLAGS.items():
        # Encontrar o bloco do publicador
        # Padrão: name: "...name_pattern..." ... aliases: [], ... }
        pattern = rf'(name:\s*["\'][^"\']*{re.escape(name_pattern)}[^"\']*["\'].*?aliases:\s*\[\],?)\s*\n(\s*\}})'
        
        match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
        if match:
            # Verificar se já tem a flag
            block_start = match.start()
            block_end = match.end()
            
            # Encontrar início do bloco (último '{' antes do match)
            brace_count = 0
            block_content = content[block_start:block_end]
            
            if 'isNotQualified' not in block_content and 'requestedNoParticipation' not in block_content:
                # Adicionar as flags
                is_not_qualified = "true" if flag_type == "isNotQualified" else "false"
                requested_no_part = "true" if flag_type == "requestedNoParticipation" else "false"
                
                flags_lines = f"""
        isNotQualified: {is_not_qualified},
        requestedNoParticipation: {requested_no_part},"""
                
                # Inserir antes do fechamento }
                replacement = match.group(1) + flags_lines + "\n" + match.group(2)
                content = content[:match.start()] + replacement + content[match.end():]
                
                flag_emoji = "⚠️" if flag_type == "isNotQualified" else "🙅"
                print(f"{flag_emoji} {name_pattern}: {flag_type}")
                updated += 1
        else:
            print(f"   ❌ Não encontrado: {name_pattern}")
    
    # Salvar
    ts_path.write_text(content, encoding="utf-8")
    print(f"\n✅ Atualizado: {updated} publicadores")

if __name__ == "__main__":
    main()
