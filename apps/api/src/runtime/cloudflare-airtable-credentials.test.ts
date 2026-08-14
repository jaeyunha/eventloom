import { describe, expect, it } from "vitest";
import { createAirtableSecretCipher } from "./cloudflare";

const credentialKey = "dedicated-airtable-credential-key-at-least-32-characters";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function legacyCiphertext(betterAuthSecret: string, plaintext: string): Promise<string> {
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`airtable:${betterAuthSecret}`),
  );
  const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

describe("Airtable credential cipher", () => {
  it("continues to decrypt dedicated-key ciphertext after BETTER_AUTH_SECRET rotates", async () => {
    const beforeRotation = createAirtableSecretCipher({
      credentialEncryptionKey: credentialKey,
      legacyBetterAuthSecret: "better-auth-secret-before-rotation-at-least-32-chars",
    });
    const ciphertext = await beforeRotation.encrypt("airtable-refresh-token");
    const afterRotation = createAirtableSecretCipher({
      credentialEncryptionKey: credentialKey,
      legacyBetterAuthSecret: "better-auth-secret-after-rotation-at-least-32-chars",
    });

    expect(ciphertext).toMatch(/^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    await expect(afterRotation.decrypt(ciphertext)).resolves.toBe("airtable-refresh-token");
  });

  it("reads persisted legacy ciphertext through the bounded Better Auth fallback", async () => {
    const betterAuthSecret = "better-auth-secret-before-rotation-at-least-32-chars";
    const cipher = createAirtableSecretCipher({
      credentialEncryptionKey: credentialKey,
      legacyBetterAuthSecret: betterAuthSecret,
    });

    await expect(
      cipher.decrypt(await legacyCiphertext(betterAuthSecret, "legacy-pat-token")),
    ).resolves.toBe("legacy-pat-token");
  });
});
