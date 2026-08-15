const url = "https://pevstuyzlewvjidjkmea.supabase.co/functions/v1/webauthn-challenge";
fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "authenticate", email: "zico.josias@gmail.com", rpID: "rvm-designacoes-antigravity.vercel.app" })
}).then(async r => {
  console.log("Status:", r.status);
  console.log("Body:", await r.text());
}).catch(console.error);
