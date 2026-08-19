const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const email = 'grupo.belem.estancia@gmail.com';
  
  // Find the profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, publisher_id, role, full_name')
    .eq('email', email)
    .single();
    
  if (profileError || !profile) {
    console.error("Profile error:", profileError?.message || "Not found");
    return;
  }
  
  console.log("Profile found:", profile);
  
  if (profile.publisher_id) {
    // Find the publisher
    const { data: publisher, error: pubError } = await supabase
      .from('publishers')
      .select('id, name, group_id, data')
      .eq('id', profile.publisher_id)
      .single();
      
    if (pubError || !publisher) {
      console.error("Publisher error:", pubError?.message || "Not found");
    } else {
      console.log("Publisher found:", publisher);
    }
  } else {
    console.log("This profile is not linked to any publisher_id.");
  }
}

main();
