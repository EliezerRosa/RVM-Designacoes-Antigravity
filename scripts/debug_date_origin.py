
import os
import asyncio
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

url: str = os.environ.get("VITE_SUPABASE_URL") # Use VITE_ prefix as seen in config
key: str = os.environ.get("VITE_SUPABASE_ANON_KEY") # Or service role if available, but usually VITE keys are in .env

if not url or not key:
    print("Error: SUPABASE_URL or SUPABASE_SERVICE_KEY not found in environment.")
    exit(1)

supabase: Client = create_client(url, key)

async def main():
    print("Fetching parts for week 2026-02-23...")
    
    # Query specific parts mentioned in screenshot: "Comentários Iniciais" or for publisher "Marcos Vinicius"
    response = supabase.table("workbook_parts").select("*").eq("week_id", "2026-02-23").execute()
    
    parts = response.data
    
    print(f"Found {len(parts)} parts for this week.")
    for part in parts:
        print(f"[{part.get('date')}] {part.get('part_title')} - {part.get('resolved_publisher_name') or part.get('raw_publisher_name')}")


if __name__ == "__main__":
    asyncio.run(main())
