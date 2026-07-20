import xlsx from 'xlsx';

const path = 'c:/Antigravity - RVM Designações/docs/RM Desacoplado/9fe36d.Relatório Mensal v03 (New).ods';
const workbook = xlsx.readFile(path);
const sheetName = workbook.SheetNames.find(s => s.trim().toLowerCase() === 'congregações');
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.table(data.map((r: any) => ({
    id: r['id_Congregação'] || r['Row ID'] || r['id'],
    nome: r['Nome'] || r['Nome da Congregação'],
})));
