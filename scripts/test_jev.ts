import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const apiKey = process.env.VITE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "";
    
    const publisherName = "Eliezer Rosa PE";
    const partTitle = "Elogios e Conselhos";
    const partDate = "2026-10-12";
    const historyText = ""; // No history yet
    const inboundText = "Bom dia meu amigo, na semana 26 de outubro a 1º de novembro, não vou poder cumprir com a designação.";
    const detectedIntent = "RECUSAR";

    const prompt = `O usuário "${publisherName}" tem a designação "${partTitle}" agendada para a data: ${partDate}.${historyText}\nEle acabou de enviar a seguinte mensagem avulsa no WhatsApp (a última do histórico): "${inboundText}".\nO sistema heurístico classificou a intenção primária como: ${detectedIntent}.\n\nVerifique indícios de:\n1. Repasse de recado de TERCEIROS (proxy) copiando/colando (ex: "fulano pediu pra avisar", ou assinaturas diferentes no histórico).\n2. O usuário falando sobre uma DATA, SEMANA ou PARTE incompatível com o que ele tem agendado.\n\nQual a porcentagem de certeza (0 a 100) de que essa ÚLTIMA MENSAGEM se refere legitimamente à designação original do próprio remetente (sem ser proxy e para a data correta)? Se a certeza for menor que 70%, vete a ação (is_valid=false).`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash", 
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
          { 
            role: "system", 
            content: "Você é Jev AI, um moderador de automação robótica do Protocolo B. Retorne EXCLUSIVAMENTE JSON estrito com 'is_valid', 'certainty_percentage' e 'reason'. Proibido texto livre. Sua tarefa é cruzar contexto temporal e textual para vetar repasses (proxy) ou datas incompatíveis." 
          },
          { 
            role: "user", 
            content: prompt 
          }
        ]
      })
    });
    
    if (res.ok) {
        const json = await res.json();
        console.log(json.choices[0].message.content);
    } else {
        console.error("Error", res.status, await res.text());
    }
}
run();
