"""
Script para migrar publicadores usando requests diretamente.
"""
import re
import json
import requests
from pathlib import Path

# Supabase credentials
SUPABASE_URL = "https://nrmfuhkvnpfaqzgbbmnm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybWZ1aGt2bnBmYXF6Z2JibW5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQwNDc5ODMsImV4cCI6MjA0OTYyMzk4M30.oMZxfFnHlvqqLEeJpJG6hT9n8vwGKhmp5WFMtb1B5Uw"

def extract_publishers_from_ts(file_path: str) -> list[dict]:
    """Extrai publicadores do arquivo TypeScript."""
    content = Path(file_path).read_text(encoding="utf-8")
    
    # Encontrar o array
    match = re.search(r'export const initialPublishers = \[(.*)\];', content, re.DOTALL)
    if not match:
        raise ValueError("Não encontrou o array de publicadores")
    
    array_content = match.group(1)
    
    # Extrair cada publicador manualmente
    publishers = []
    
    # Padrão para extrair ID e nome
    pub_pattern = re.compile(r'\{\s*id:\s*["\'](\d+)["\'],\s*name:\s*["\']([^"\']+)["\']', re.DOTALL)
    
    for match in pub_pattern.finditer(array_content):
        pub_id = match.group(1)
        name = match.group(2)
        
        # Determinar gênero baseado no contexto
        start_pos = match.start()
        end_pos = min(start_pos + 800, len(array_content))
        context = array_content[start_pos:end_pos]
        
        gender = "brother" if 'gender: "brother"' in context or "gender: 'brother'" in context else "sister"
        
        # Extrair condição se possível
        condition_match = re.search(r'condition:\s*["\']([^"\']+)["\']', context)
        condition = condition_match.group(1) if condition_match else "Publicador"
        
        publishers.append({
            "id": pub_id,
            "name": name,
            "gender": gender,
            "condition": condition,
            "phone": "",
            "isBaptized": True,
            "isServing": True,
            "ageGroup": "Adulto",
            "parentIds": [],
            "isHelperOnly": gender == "sister",
            "canPairWithNonParent": True,
            "privileges": {
                "canGiveTalks": gender == "brother",
                "canConductCBS": "Ancião" in condition,
                "canReadCBS": gender == "brother",
                "canPray": gender == "brother",
                "canPreside": "Ancião" in condition or "Servo" in condition,
            },
            "privilegesBySection": {
                "canParticipateInTreasures": True,
                "canParticipateInMinistry": True,
                "canParticipateInLife": True,
            },
            "availability": {"mode": "always", "exceptionDates": []},
            "aliases": [],
        })
    
    return publishers

def upsert_to_supabase(publishers: list[dict]):
    """Envia publicadores para Supabase via REST API."""
    url = f"{SUPABASE_URL}/rest/v1/publishers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    # Preparar dados
    rows = [{"id": p["id"], "data": p} for p in publishers]
    
    # Enviar em batch
    response = requests.post(url, headers=headers, json=rows)
    
    if response.status_code in (200, 201):
        print(f"✅ Sucesso! Status: {response.status_code}")
    else:
        print(f"❌ Erro: {response.status_code}")
        print(response.text)
        
    return response.status_code

def main():
    ts_path = Path(__file__).parent.parent / "src" / "data" / "initialPublishers.ts"
    
    print(f"Extraindo publicadores de: {ts_path}")
    publishers = extract_publishers_from_ts(str(ts_path))
    print(f"Total extraído: {len(publishers)} publicadores")
    
    print(f"\nEnviando para Supabase...")
    status = upsert_to_supabase(publishers)
    
    if status in (200, 201):
        print(f"\n✅ Migração concluída! {len(publishers)} publicadores no Supabase.")
    else:
        print(f"\n❌ Migração falhou")

if __name__ == "__main__":
    main()
