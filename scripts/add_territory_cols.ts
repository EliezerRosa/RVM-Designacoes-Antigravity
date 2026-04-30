const SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const SQL = `
ALTER TABLE public.territories 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
`;

async function addColumns() {
    console.log('Sending SQL to Supabase pg/query endpoint...');
    const pgResponse = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: SQL })
    });

    if (!pgResponse.ok) {
        const text = await pgResponse.text();
        console.log('❌ Failed:', text);
    } else {
        console.log('✅ Columns added successfully!');
    }
}

addColumns().catch(console.error);
