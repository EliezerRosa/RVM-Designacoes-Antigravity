import fitz  # PyMuPDF
import os
import io
from PIL import Image
import copy

def extract_territory_cards(pdf_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    doc = fitz.open(pdf_path)
    
    # Each page contains 4 cards in a 2x2 grid.
    # We will compute the crop boxes based on percentages of the page size
    # to be robust against different exact dimensions.
    
    card_count = 0
    cards_data = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        rect = page.rect
        width = rect.width
        height = rect.height
        
        # Define 4 quadrants: Top-Left, Top-Right, Bottom-Left, Bottom-Right
        # Adding some margin tuning to capture just the card map area if possible,
        # but capturing the whole quadrant is safer to start.
        # Let's crop the page directly and save.
        
        quadrants = [
            fitz.Rect(0, 0, width / 2, height / 2),                     # Top-Left (Card 1)
            fitz.Rect(width / 2, 0, width, height / 2),                 # Top-Right (Card 2)
            fitz.Rect(0, height / 2, width / 2, height),                # Bottom-Left (Card 3)
            fitz.Rect(width / 2, height / 2, width, height)             # Bottom-Right (Card 4)
        ]
        
        for q_idx, q_rect in enumerate(quadrants):
            card_count += 1
            
            # Render the specific quadrant at high resolution (e.g. 300 DPI -> zoom = 300/72 = 4.16)
            zoom_matrix = fitz.Matrix(4.0, 4.0)
            pix = page.get_pixmap(matrix=zoom_matrix, clip=q_rect)
            
            # Convert to PIL Image
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # Save the image
            filename = f"territory_card_{card_count:02d}.png"
            filepath = os.path.join(output_dir, filename)
            img.save(filepath, "PNG")
            
            cards_data.append({
                "territory_number": card_count,
                "image_file": filename,
                "page": page_num + 1,
                "quadrant": q_idx + 1
            })
            
            print(f"Saved {filepath}")

if __name__ == "__main__":
    pdf_path = r"C:\Antigravity - RVM Designações\Territórios\MAPAS TERRITÓRIOS\Território Estancia Impressão.PDF"
    # Ensure raw string for windows paths
    output_dir = r"C:\Antigravity - RVM Designações\rvm-designacoes-unified\public\territories"
    
    print(f"Extracting cards from: {pdf_path}")
    extract_territory_cards(pdf_path, output_dir)
    print("Done!")
