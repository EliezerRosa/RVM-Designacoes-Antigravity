const { generateRegistrationOptions } = require("@simplewebauthn/server");

async function test() {
  try {
    const options = await generateRegistrationOptions({
        rpName: 'Test',
        rpID: 'localhost',
        userID: new TextEncoder().encode('12345'), // v10 uses Uint8Array
        userName: 'test@test.com',
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });
      console.log("Success:", !!options);
  } catch(e) {
      console.error("Error generating options:", e.message);
  }
}
test();
