"""
RVM Designações - Backend API
FastAPI server para processamento de PDFs, motor de IA e geração de S-89
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="RVM Designações API",
    description="API para gerenciamento de designações de reuniões",
    version="1.0.0"
)

# Configurar CORS para permitir acesso do frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "RVM Designações API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


# Importar rotas
from app.api import publishers, meetings, assignments, pdf, pdf_parser

app.include_router(publishers.router, prefix="/api/publishers", tags=["Publishers"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(assignments.router, prefix="/api/assignments", tags=["Assignments"])
app.include_router(pdf.router, prefix="/api/pdf", tags=["PDF"])
app.include_router(pdf_parser.router, prefix="/api/history", tags=["History Import"])
