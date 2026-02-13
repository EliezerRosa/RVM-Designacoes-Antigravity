
import os
import requests
from dotenv import load_dotenv
from pathlib import Path

# Load env
root_path = Path(__file__).parent.parent / ".env"
load_dotenv(root_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Use Service Role Key for admin tasks (DDL)
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Service Role Key or URL missing.")
    exit(1)

# SQL to execute
sql = """
ALTER TABLE workbook_parts ADD COLUMN IF NOT EXISTS modalidade TEXT;
CREATE INDEX IF NOT EXISTS idx_workbook_parts_modalidade ON workbook_parts(modalidade);
"""

# Try to execute via SQL endpoint (often available on /v1/query or similar if pg_net/http enabled, but standard is different)
# Actually, standard Supabase REST API does NOT support raw SQL.
# But we can try the `pg_meta` endpoint if exposed (rarely public).
# OR we can try to use a stored procedure if one exists for exec_sql.

# However, for this user, the most reliable way is often to print instructions if we can't connect via psql.
# But let's check if the user has `psycopg2` installed, maybe we can find a connection string in another file?
# `scripts/inspect_schema.ts` showed `supabaseUrl` and `supabaseKey`.
# Let's try to find a connection string in the codebase.

# If not found, we'll just print the SQL and ask the user to run it.
print("⚠️ Automatic migration via script is limited without direct DB access.")
print("   Please run the following SQL in your Supabase SQL Editor:")
print("-" * 50)
print(sql)
print("-" * 50)
print(f"URL: {SUPABASE_URL}")
