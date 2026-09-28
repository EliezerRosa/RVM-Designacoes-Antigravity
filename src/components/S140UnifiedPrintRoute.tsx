import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { mapDbToWorkbookPart } from '../services/workbookService';
import { renderS140ToElement } from '../services/s140GeneratorUnified';
import { prepareS140UnifiedData } from '../services/s140GeneratorUnified';
import type { Publisher } from '../types';

export function S140UnifiedPrintRoute({ weekId, secret }: { weekId: string | null; secret: string | null }) {
  const [renderedBase64, setRenderedBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      if (!secret || secret !== import.meta.env.VITE_PRINT_SECRET) {
        setError("Invalid secret");
        return;
      }
      if (!weekId) {
        setError("Week ID is missing");
        return;
      }

      try {
        const { data: partsData, error: partsErr } = await supabase
          .from('workbook_parts')
          .select('*')
          .eq('week_id', weekId);

        if (partsErr || !partsData) {
          setError("Failed to load parts");
          return;
        }

        const { data: publishersData, error: pubErr } = await supabase
          .from('publishers')
          .select('*');

        if (pubErr || !publishersData) {
          setError("Failed to load publishers");
          return;
        }

        const parts = partsData.map(mapDbToWorkbookPart);
        const publishers = publishersData as Publisher[];

        await document.fonts.ready;

        const weekData = await prepareS140UnifiedData(parts, publishers);
        const element = renderS140ToElement(weekData);

        // html2canvas works PERFECTLY here because we have a real browser DOM in Puppeteer!
        const html2canvas = (await import('html2canvas')).default;
        
        // Append temporarily to our container to render
        if (containerRef.current) {
          containerRef.current.appendChild(element);
        }

        // Aguarda estilos aplicarem
        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(element, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
        });

        // Retorna o base64 puro (removendo data:image/png;base64,) para que o Puppeteer consuma via src="data:..."
        const base64Data = canvas.toDataURL('image/png');
        setRenderedBase64(base64Data);

        // Limpa
        if (containerRef.current && containerRef.current.contains(element)) {
            containerRef.current.removeChild(element);
        }

      } catch (err: any) {
         setError(err.message || String(err));
      }
    }
    
    load();
  }, [weekId, secret]);

  if (error) {
    return <div style={{ color: 'red', fontFamily: 'monospace', padding: '20px' }}>{error}</div>;
  }
  
  if (!renderedBase64) {
    return (
        <div id="s140-loading" style={{ fontFamily: 'monospace', padding: '20px' }}>
            Rendering S-140...
            <div ref={containerRef} style={{ position: 'absolute', top: -10000, left: -10000 }}></div>
        </div>
    );
  }

  // O Puppeteer lê diretamente a imagem
  return (
    <div style={{ margin: 0, padding: 0, display: 'flex', background: 'transparent' }}>
      <img id="s140-unified-canvas" src={renderedBase64} style={{ display: 'block', maxWidth: '100%' }} alt="S-140" />
    </div>
  );
}
