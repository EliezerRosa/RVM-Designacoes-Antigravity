import json

JSON_PATH = r"c:\Antigravity - RVM Designações\backup_rvm_2026-01-05.json"

try:
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    tables = data.get('tables', {})
    keys = list(tables.keys())
    print("--- KEYS FOUND IN JSON 'tables' ---")
    for k in keys:
        print(f"Key: {k} - Count: {len(tables[k].get('data', []))}")
        
except Exception as e:
    print(e)
