import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

async function trigger() {
    console.log("Triggering Edge Function...");
    const url = process.env.VITE_SUPABASE_URL + '/functions/v1/cron-whatsapp-reminders';
    
    // We need the anon key or service key for auth, or x-cron-secret if they use that.
    // The cron job used:
    // 'x-cron-secret': (select decrypted_secret from vault.decrypted_secrets where name = 'cron_whatsapp_secret')
    // Wait, the edge function might be public? No, usually not. Let's try with Anon Key.
    
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
    });

    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
}

trigger();
