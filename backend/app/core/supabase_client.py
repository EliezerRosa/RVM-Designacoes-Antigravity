"""
Cliente Supabase para o Backend Python
Reutiliza credenciais do arquivo .env
"""
import os
from functools import lru_cache
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# Carregar variáveis de ambiente
load_dotenv()


@lru_cache()
def get_supabase_client() -> Client:
    """
    Retorna uma instância singleton do cliente Supabase.
    Usa cache para evitar múltiplas conexões.
    """
    url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
    
    if not url or not key:
        raise ValueError(
            "Supabase credentials not found. "
            "Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
        )
    
    return create_client(url, key)


def get_supabase() -> Client:
    """Alias para get_supabase_client()"""
    return get_supabase_client()
