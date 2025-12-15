import os
import json
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="RVM Gateway", version="1.0.0")

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from env
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
REPO_OWNER = os.getenv("REPO_OWNER", "EliezerRosa")
REPO_NAME = os.getenv("REPO_NAME", "RVM-Designacoes-Antigravity")

if not GITHUB_TOKEN:
    print("WARNING: GITHUB_TOKEN not set")

class SaveRequest(BaseModel):
    block_id: str
    content: dict

async def trigger_github_workflow(block_id: str, content: dict):
    """
    Triggers the GitHub Actions workflow via repository_dispatch event.
    """
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/dispatches"
    
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"token {GITHUB_TOKEN}",
    }
    
    payload = {
        "event_type": "atomic_write",
        "client_payload": {
            "block_id": block_id,
            "content": content 
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            if response.status_code != 204:
                print(f"Error triggering workflow: {response.text}")
            else:
                print(f"Workflow triggered for block {block_id}")
        except Exception as e:
            print(f"Exception triggering workflow: {e}")

@app.get("/")
def read_root():
    return {"status": "online", "service": "RVM Gateway"}

@app.post("/api/save")
async def save_entity(request: SaveRequest, background_tasks: BackgroundTasks):
    """
    Receives JSON content and queues it for atomic writing via GitHub Actions.
    """
    if not GITHUB_TOKEN:
        raise HTTPException(status_code=500, detail="Server misconfiguration: No GitHub Token")

    # Dispatch to background task to respond immediately
    background_tasks.add_task(trigger_github_workflow, request.block_id, request.content)
    
    return {
        "status": "accepted", 
        "message": "Transação enfileirada no Atomic Writer",
        "block_id": request.block_id
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
