import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    console.log("Calling webhook locally...");
    const url = process.env.VITE_SUPABASE_URL + "/functions/v1/zapi-smart-webhook";
    
    const payload = {
        "text": {
            "message": "Bom dia meu amigo, na semana 26 de outubro a 1º de novembro, não vou poder cumprir com a designação."
        },
        "type": "ReceivedCallback",
        "phone": "5527992035302",
        "fromMe": false,
        "isEdit": false,
        "status": "RECEIVED",
        "messageId": "TEST_" + Date.now(),
        "senderName": "Eliezer Rosa PE",
        "connectedPhone": "5527981470002"
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(payload)
        });
        
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Response: ${text}`);
    } catch (e) {
        console.error(e);
    }
}
run();
