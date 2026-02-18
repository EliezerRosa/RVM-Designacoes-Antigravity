#!/usr/bin/env python3
"""Debug script para analisar estrutura de dados BD vs PDF"""

import fitz
import re
import requests
from pathlib import Path

SUPABASE_URL = "https://pevstuyzlewvjidjkmea.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0"
HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
}

MONTHS = {
    'JANEIRO': '01', 'FEVEREIRO': '02', 'MARÇO': '03', 'MARCO': '03',
    'ABRIL': '04', 'MAIO': '05', 'JUNHO': '06', 'JULHO': '07',
    'AGOSTO': '08', 'SETEMBRO': '09', 'OUTUBRO': '10',
    'NOVEMBRO': '11', 'DEZEMBRO': '12'
}

# 1. Ver datas das partes sem nome no BD
print("=" * 60)
print("1. DATAS DAS PARTES SEM NOME NO BD")
print("=" * 60)

url = f"{SUPABASE_URL}/rest/v1/workbook_parts?select=date&or=(raw_publisher_name.is.null,raw_publisher_name.eq.)&limit=2000"
response = requests.get(url, headers=HEADERS)
data = response.json()

dates = {}
for p in data:
    d = p.get('date', '')
    dates[d] = dates.get(d, 0) + 1

print(f"Total: {len(data)} partes sem nome")
print(f"Datas distintas: {len(dates)}")
print("\nPrimeiras 20 datas com contagem:")
for date, count in sorted(dates.items())[:20]:
    print(f"  {date}: {count} partes")

# 2. Verificar datas em cada PDF
print("\n" + "=" * 60)
print("2. DATAS EM CADA PDF")
print("=" * 60)

PAUTAS = r"c:\Antigravity - RVM Designações\ANTIGRAVITY Designações Antigas"
pdfs = [
    "1. Novembro_Dezembro 2024_Vida e Ministério.pdf",
    "2. Dezembro-Janeiro 2025_Vida e Ministério.pdf",
    "3. fevereiro2025 mwb_T_202501.pdf",
    "4. Març-Abril 2025 mwb_T_202501.pdf",
    "5. Abril-Maio 2025 mwb_T_202501.pdf",
    "6. Junho-Julho 2025 mwb_T_202501.pdf",
    "7. Agosto-Setembro de 2025 mwb_T_202509.pdf",
    "8. Outubro-Novembro de 2025 mwb_T_202509.pdf",
]

pdf_dates = set()
for pdf_name in pdfs:
    pdf_path = Path(PAUTAS) / pdf_name
    if not pdf_path.exists():
        continue
    
    doc = fitz.open(str(pdf_path))
    print(f"\n📄 {pdf_name}")
    
    default_year = 2025 if '2025' in pdf_name else 2024
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()
        
        year = default_year
        year_match = re.search(r'—\s*(20\d{2})', text)
        if year_match:
            year = int(year_match.group(1))
        
        match = re.search(r'SEMANA\s+(\d{1,2})\s*[-–]\s*\d{1,2}\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)', text, re.IGNORECASE)
        if match:
            day = int(match.group(1))
            month_name = match.group(2).upper()
            month = MONTHS.get(month_name)
            if month:
                date = f"{year}-{month}-{day:02d}"
                pdf_dates.add(date)
                print(f"  Page {page_num+1}: {date}")
    
    doc.close()

# 3. Comparar
print("\n" + "=" * 60)
print("3. COMPARAÇÃO")
print("=" * 60)

bd_dates = set(dates.keys())
common = bd_dates & pdf_dates
only_bd = bd_dates - pdf_dates
only_pdf = pdf_dates - bd_dates

print(f"Datas só no BD (sem PDF): {len(only_bd)}")
print(f"Datas só no PDF (sem BD): {len(only_pdf)}")
print(f"Datas em comum: {len(common)}")

if common:
    print("\nDatas em comum (podem ser preenchidas):")
    for d in sorted(common):
        print(f"  {d}: {dates.get(d, 0)} partes sem nome")

# 4. Ver estrutura de uma parte específica
print("\n" + "=" * 60)
print("4. EXEMPLO DE PARTE SEM NOME (BD)")
print("=" * 60)

if common:
    test_date = sorted(common)[0]
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?select=*&or=(raw_publisher_name.is.null,raw_publisher_name.eq.)&date=eq.{test_date}&limit=5"
    response = requests.get(url, headers=HEADERS)
    parts = response.json()
    
    print(f"Data: {test_date}")
    for p in parts:
        print(f"  titulo_parte: {p.get('titulo_parte')}")
        print(f"  tipo_parte: {p.get('tipo_parte')}")
        print(f"  funcao: {p.get('funcao')}")
        print(f"  ---")
