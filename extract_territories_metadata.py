import fitz  # PyMuPDF
import os
import json
import re
import urllib.parse

def extract_territory_data(pdf_path):
    doc = fitz.open(pdf_path)
    territories = []
    
    # We map 4 cards per page based on approximate bounding boxes 
    # to extract text explicitly for each card section
    
    card_count = 0
    for page_num in range(len(doc)):
        page = doc[page_num]
        width, height = page.rect.width, page.rect.height
        
        quadrants = [
            fitz.Rect(0, 0, width / 2, height / 2),
            fitz.Rect(width / 2, 0, width, height / 2),
            fitz.Rect(0, height / 2, width / 2, height),
            fitz.Rect(width / 2, height / 2, width, height)
        ]
        
        for q_rect in quadrants:
            card_count += 1
            # Extract text just for this quadrant
            text = page.get_text("text", clip=q_rect)
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            
            # Simple heuristic parsing: 
            # Looking for "Localidade", "Terr. N.º", and street names (usually start with "R.", "Av.")
            localidade = "Desconhecida"
            terr_num = str(card_count)
            ruas = []
            
            for line in lines:
                if "Localidade" in line and "Terr. N.º" in line:
                    continue # Standard header line, handled below
                
                # Check for direct matches
                if line.isupper() and len(line) > 3 and "CARTÃO" not in line and "MAPA" not in line and "JACARAÍPE" in line:
                    localidade = line
                elif line.isupper() and len(line) > 3 and "CARTÃO" not in line and "MAPA" not in line and "SÃO PATRÍCIO" in line:
                    localidade = line
                elif line.isupper() and len(line) > 3 and "CASTELÂNDIA" in line:
                    localidade = line
                elif line.isupper() and len(line) > 3 and "SÃO PEDRO" in line:
                     localidade = line   
                
                # Extract street names to help form the Google Maps query
                if line.startswith("R.") or line.startswith("Av.") or line.startswith("R "):
                    ruas.append(line)
            
            # Remove duplicates
            ruas = list(dict.fromkeys(ruas))
            
            # Build search query for Google Maps (e.g., "Rua X, Bairro Y, Serra - ES")
            search_query = ""
            if ruas:
                # Use the first 2 streets as reference points for the center of the territory
                ref_streets = " e ".join(ruas[:2])
                search_query = f"{ref_streets}, {localidade}, Serra - ES"
            else:
                search_query = f"{localidade}, Serra - ES"
                
            maps_url = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(search_query)
            
            # Description text combining streets
            description = f"Limites: {', '.join(ruas)}" if ruas else "Limites não identificados"
            
            territories.append({
                "number": str(card_count),
                "neighborhood": localidade,
                "description": description,
                "image_url": f"/territories/territory_card_{card_count:02d}.png",
                "google_maps_url": maps_url,
                "extracted_streets": ruas
            })
            
    return territories

if __name__ == "__main__":
    pdf_path = r"C:\Antigravity - RVM Designações\Territórios\MAPAS TERRITÓRIOS\Território Estancia Impressão.PDF"
    output_json = r"C:\Antigravity - RVM Designações\rvm-designacoes-unified\public\territories\territories_data.json"
    
    print("Extracting text data...")
    data = extract_territory_data(pdf_path)
    
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    print(f"Extracted {len(data)} territories to {output_json}")
