import './node-shims.cjs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import fs from 'fs';
import { chromium } from 'playwright';
import { generateS89 } from '../src/services/s89Generator.js';
import type { WorkbookPart } from '../src/types/index.js';

async function testRender() {
  const testPart: WorkbookPart = {
    id: 'fa000000-0000-4000-8000-000000000001',
    batch_id: 'b1',
    weekId: '2026-10-05',
    date: '2026-10-08',
    section: 'faça seu melhor',
    tipoParte: '5. Iniciando conversas',
    tituloParte: '5. Iniciando conversas (Demonstração com Botões Nativos)',
    part_title: '5. Iniciando conversas (Demonstração com Botões Nativos)',
    modalidade: 'Principal',
    seq: 5,
    status: 'ENVIADA',
    rawPublisherName: 'Eliezer Rosa',
    resolvedPublisherName: 'Eliezer Rosa',
    resolvedPublisherId: '3',
    horaInicio: '19:35',
  } as any;

  console.log('1. Generating S-89 PDF bytes with pdf-lib...');
  const pdfBytes = await generateS89(testPart, undefined, 4, true);
  console.log('   PDF bytes length:', pdfBytes.length);

  console.log('2. Launching Playwright Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Convert PDF bytes to base64
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  // Load a simple HTML with pdfjs-dist from node_modules or cdn to render on canvas
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    </head>
    <body style="margin:0; padding:0; background:transparent;">
      <canvas id="pdf-canvas"></canvas>
      <script>
        window.renderPdf = async function(base64Data) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdfData = atob(base64Data);
          const pdfArray = new Uint8Array(pdfData.length);
          for (let i = 0; i < pdfData.length; i++) {
            pdfArray[i] = pdfData.charCodeAt(i);
          }
          const pdf = await pdfjsLib.getDocument({ data: pdfArray }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.getElementById('pdf-canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          return { width: viewport.width, height: viewport.height };
        };
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  console.log('3. Rendering S-89 PDF on canvas...');
  await page.evaluate((b64) => (window as any).renderPdf(b64), pdfBase64);

  const canvasHandle = await page.$('#pdf-canvas');
  if (!canvasHandle) throw new Error('Canvas not found');

  const pngBuffer = await canvasHandle.screenshot({ type: 'png' });
  await browser.close();

  fs.writeFileSync('public/test_s89_generated.png', pngBuffer);
  console.log('4. S-89 Card PNG saved to public/test_s89_generated.png (', pngBuffer.length, 'bytes)!');
  return pngBuffer.toString('base64');
}

testRender().catch(console.error);
