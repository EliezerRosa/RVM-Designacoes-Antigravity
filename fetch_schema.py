import urllib.request, json
url = "https://api.supabase.com/v1/projects/pevstuyzlewvjidjkmea/database/query"
req = urllib.request.Request(url, method="POST")
req.add_header("Authorization", "Bearer sbp_78fcb25f7c76211de318e43e56ed238b4d8c072b")
req.add_header("Content-Type", "application/json")
query = """
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
"""
data = {"query": query}
req.data = json.dumps(data).encode("utf-8")
try:
    with urllib.request.urlopen(req) as r:
        resp = json.loads(r.read().decode())
        print("Tables:", resp)
except Exception as e:
    import urllib.error
    if isinstance(e, urllib.error.HTTPError):
        print("HTTP Error:", e.code, e.read().decode())
    else:
        print("Erro:", e)
