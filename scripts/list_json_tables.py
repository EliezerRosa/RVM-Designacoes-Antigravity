import json

JSON_PATH = r"c:\Antigravity - RVM Designações\backup_rvm_2026-01-05.json"

try:
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    keys = list(data.get('tables', {}).keys())
    print(f"BACKUP TABLES: {keys}")
except Exception as e:
    print(e)
