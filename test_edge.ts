import { generateRegistrationOptions } from "npm:@simplewebauthn/server";

async function test() {
  try {
    const options = await generateRegistrationOptions({
        rpName: 'Test',
        rpID: 'localhost',
        userID: new TextEncoder().encode('12345'),
        userName: 'test@test.com',
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });
      console.log(options);
  } catch(e) {
      console.error(e);
  }
}
test();
