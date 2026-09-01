const payload = {
    systemInstruction: { parts: [{ text: 'Você é um bot. Retorne JSON: {"regras": []}' }] },
    contents: [{ role: 'user', parts: [{ text: 'Semana: 2026-09-07' }] }],
    generationConfig: { responseMimeType: 'application/json' }
};

fetch('https://rvm-designacoes-antigravity.vercel.app/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
.catch(console.error);
