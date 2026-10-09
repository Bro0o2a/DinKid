import { createECDH, createHash } from "crypto";

// The notification keys are made from PUSH_SECRET, so Vercel only needs that one setting.
export function vapidKeys(secret: string) {
  const privateKey = createHash("sha256").update(`dinkin-vapid:${secret}`).digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateKey);
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: privateKey.toString("base64url"),
  };
}
