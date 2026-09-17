import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateS89PngBase64 } from '../services/s89Generator';
import { resolveS89CardParams } from '../services/weekPublishService';
import { mapDbToWorkbookPart } from '../services/workbookService';

export function S89PrintRoute({ partId, secret }: { partId: string | null; secret: string | null }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!secret || secret !== import.meta.env.VITE_PRINT_SECRET) {
        setError("Unauthorized");
        return;
      }
      if (!partId) {
        setError("Missing partId");
        return;
      }

      try {
        const realId = partId.replace(/-(titular|ajudante)$/i, '');
        
        // 1. Fetch the specific part
        const { data: partData, error: partErr } = await supabase
          .from('workbook_parts')
          .select('*')
          .eq('id', realId)
          .single();
        
        if (partErr || !partData) {
          setError("Part not found");
          return;
        }

        const targetPart = mapDbToWorkbookPart(partData);

        // 2. Fetch all parts for that week to resolve the assistant/titular context
        const { data: weekData, error: weekErr } = await supabase
          .from('workbook_parts')
          .select('*')
          .eq('week_id', targetPart.weekId);

        if (weekErr || !weekData) {
           setError("Failed to fetch week parts");
           return;
        }

        const weekParts = weekData.map(mapDbToWorkbookPart);

        // 3. Resolve S89 parameters (Titular vs Ajudante)
        const { partForPdf, assistantName, isStudent } = resolveS89CardParams(targetPart, weekParts);

        // 4. Aguardar fontes carregarem para não bugar o Puppeteer Headless (Crucial)
        await document.fonts.ready;

        // 5. Generate PNG via pdf.js canvas rendering
        const base64 = await generateS89PngBase64(partForPdf, assistantName, undefined, isStudent);
        
        if (base64) {
          setImgSrc(`data:image/png;base64,\${base64}`);
        } else {
          setError("Failed to generate image");
        }
      } catch (err: any) {
         setError(err.message || String(err));
      }
    }
    
    load();
  }, [partId, secret]);

  if (error) {
    return <div style={{ color: 'red', fontFamily: 'monospace', padding: '20px' }}>{error}</div>;
  }
  
  if (!imgSrc) {
    return <div id="s89-loading" style={{ fontFamily: 'monospace', padding: '20px' }}>Rendering S-89...</div>;
  }

  // O ID "s89-card-canvas" é mandatório, pois o Puppeteer usará waitForSelector nele.
  return (
    <div style={{ margin: 0, padding: 0, display: 'flex', background: 'transparent' }}>
      <img id="s89-card-canvas" src={imgSrc} style={{ display: 'block', maxWidth: '100%' }} alt="S-89" />
    </div>
  );
}
