import urllib.request
import re
from html.parser import HTMLParser

class WOLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_h3 = False
        self.in_p = False
        self.current_title = ""
        self.current_desc = ""
        self.parts = []
        self.capture_desc = False

    def handle_starttag(self, tag, attrs):
        if tag == 'h3':
            self.in_h3 = True
            self.current_title = ""
        elif tag == 'p' and self.capture_desc:
            self.in_p = True

    def handle_endtag(self, tag):
        if tag == 'h3':
            self.in_h3 = False
            self.capture_desc = True # next text might be description
        elif tag == 'p' and self.in_p:
            self.in_p = False
            if self.current_desc.strip() and self.current_title:
                self.parts.append((self.current_title.strip(), self.current_desc.strip()))
            self.current_desc = ""
            self.capture_desc = False

    def handle_data(self, data):
        if self.in_h3:
            self.current_title += data
        elif self.in_p and self.capture_desc:
            self.current_desc += data

def fetch_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"Error: {e}")
        return None

def main():
    for week in range(40, 49):
        url = f"https://wol.jw.org/pt/wol/meetings/r5/lp-t/2026/{week}"
        html = fetch_url(url)
        if not html: continue
        match = re.search(r'href="(/pt/wol/d/r5/lp-t/\d+)"', html)
        if not match: continue
            
        article_url = f"https://wol.jw.org{match.group(1)}"
        article_html = fetch_url(article_url)
        if not article_html: continue
        
        print(f"\n=== Semana {week} ===")
        
        # O padrao no WOL atual é o titulo em <strong> ou <h3>, seguido por texto.
        # Mas as partes as vezes estao em listas <li class="pGroup">
        # Vamos usar um regex rapido no conteudo texto
        
        # Remover tags mantendo um pouco de estrutura
        blocks = re.split(r'<(?:h3|h2)[^>]*>', article_html)
        for block in blocks[1:]:
            title_match = re.match(r'(.*?)</(?:h3|h2)>', block, re.DOTALL)
            if title_match:
                title = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()
                # O resto do bloco ate a proxima tag p ou div relevante
                rest = block[len(title_match.group(0)):]
                # Pega o primeiro paragrafo
                p_match = re.search(r'<p[^>]*>(.*?)</p>', rest, re.DOTALL)
                desc = ""
                if p_match:
                    desc = re.sub(r'<[^>]+>', '', p_match.group(1)).strip()
                
                # Ignorar titulos genericos
                if title and not any(x in title.lower() for x in ['cântico', 'oração']):
                    print(f"PARTE: {title}")
                    if desc:
                        print(f"DESC: {desc}")

if __name__ == "__main__":
    main()
