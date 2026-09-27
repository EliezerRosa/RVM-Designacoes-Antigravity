import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';

(async () => {
    const templateBytes = fs.readFileSync('public/S-89_T.pdf');
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    const page = pdfDoc.getPages()[0];
    
    // Configurações simplificadas para gerar rapidamente
    page.drawText('Raquel Oliveira', { x: 45, y: 550, size: 10, color: rgb(0,0,0) });
    page.drawText('Explicando Suas Crenças', { x: 150, y: 510, size: 10, color: rgb(0,0,0) });
    page.drawText('Quinta-feira, 8/Outubro/2026', { x: 180, y: 260, size: 9, color: rgb(0,0,0) });
    
    const pdfBytes = await pdfDoc.save();
    
    fs.writeFileSync('C:\\\\Users\\\\Eliez\\\\.gemini\\\\antigravity-ide\\\\brain\\\\b0d3ad02-39fe-4fe8-99c4-8e6c46ce35e7\\\\s89_raquel_oficial.pdf', pdfBytes);
    console.log('PDF Saved!');
})();
