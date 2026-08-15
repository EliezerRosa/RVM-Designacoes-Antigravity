const { verifyRegistrationResponse } = require("@simplewebauthn/server");

async function test() {
  const mockRegistrationResponse = {
    id: "test",
    rawId: "test",
    response: {
      clientDataJSON: "test",
      attestationObject: "test"
    },
    type: "public-key"
  };

  try {
    await verifyRegistrationResponse({
      response: mockRegistrationResponse,
      expectedChallenge: "test",
      expectedOrigin: "http://localhost",
      expectedRPID: "localhost",
    });
  } catch(e) {
    console.log("Verification threw:", e.message);
  }
}
test();
