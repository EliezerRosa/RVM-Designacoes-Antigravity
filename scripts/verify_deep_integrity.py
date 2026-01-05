import json
from supabase import create_client, Client
import datetime

# Setup
SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'
JSON_PATH = r"c:\Antigravity - RVM Designações\backup_rvm_2026-01-05 v2.json"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TABLES_TO_CHECK = [
    'workbook_parts',
    'special_events',
    'workbook_batches',
    'publishers',
    'local_needs_preassignments'
]

def get_db_schema_sample(table):
    """Fetches one row from DB to infer schema"""
    res = supabase.table(table).select('*').limit(1).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]
    return None

def normalize_value(v):
    if v is None: return "null"
    return str(v)

def compare_objects(db_obj, json_obj, table_name):
    # 1. Compare Keys
    db_keys = set(db_obj.keys())
    json_keys = set(json_obj.keys())
    
    missing_in_json = db_keys - json_keys
    extra_in_json = json_keys - db_keys
    
    print(f"\n[{table_name}] Validating Schema...")
    
    if not missing_in_json and not extra_in_json:
        print(f"  ✅ Colunas idênticas ({len(db_keys)} campos)")
    else:
        if missing_in_json:
            print(f"  ❌ Faltando no Backup: {missing_in_json}")
        if extra_in_json:
            print(f"  ⚠️ Extras no Backup (pode ser normal): {extra_in_json}")

    # 2. Compare Values (Sample)
    print(f"[{table_name}] Validating Values for ID: {db_obj.get('id', 'N/A')}...")
    diffs = []
    for k in db_keys:
        if k in json_keys:
            db_val = normalize_value(db_obj[k])
            json_val = normalize_value(json_obj[k])
            
            # Helper for created_at diffs (ms precision issues)
            if 'created_at' in k or 'date' in k:
                if db_val[:19] == json_val[:19]: # Compare up to seconds
                    continue
            
            if db_val != json_val:
                diffs.append(f"{k}: DB='{db_val}' vs JSON='{json_val}'")
    
    if not diffs:
        print(f"  ✅ Valores batem 100% (Amostra)")
    else:
        print(f"  ⚠️ Diferenças de valor encontradas: {diffs}")

def verify_deep():
    print("--- DEEP INTEGRITY CHECK ---")
    
    try:
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        tables = backup_data.get('tables', {})
        
        for table in TABLES_TO_CHECK:
            # Get DB Sample
            db_sample = get_db_schema_sample(table)
            if not db_sample:
                print(f"\n[{table}] ⚠️ Tabela vazia no banco, impossível comparar schema.")
                continue
            
            # Find matching record in JSON
            json_rows = tables.get(table, {}).get('data', [])
            target_id = db_sample.get('id')
            
            json_match = next((item for item in json_rows if item.get('id') == target_id), None)
            
            if json_match:
                compare_objects(db_sample, json_match, table)
            else:
                 print(f"\n[{table}] ❌ Registro ID {target_id} existe no DB mas não no JSON!")

    except Exception as e:
        print(f"CRITICAL ERROR: {e}")

if __name__ == "__main__":
    verify_deep()
