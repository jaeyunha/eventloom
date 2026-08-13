import type { IntegrationPublicationId } from "@eventloom/contracts";
import type { AcceleventsConfirmationTokens } from "./types";

const TOKEN_PREFIX = "accelevents-confirm-v1.";

export class HmacAcceleventsConfirmationTokens implements AcceleventsConfirmationTokens {
  private readonly key: Promise<CryptoKey>;
  private readonly subtle: SubtleCrypto;

  constructor(secret: string, subtle: SubtleCrypto = crypto.subtle) {
    if (new TextEncoder().encode(secret).byteLength < 32) {
      throw new Error("Accelevents confirmation secret must contain at least 32 bytes.");
    }
    this.subtle = subtle;
    this.key = subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }

  async issue(publicationId: IntegrationPublicationId, snapshotHash: string): Promise<string> {
    const signature = await this.subtle.sign(
      "HMAC",
      await this.key,
      new TextEncoder().encode(tokenPayload(publicationId, snapshotHash)),
    );
    return `${TOKEN_PREFIX}${encodeBase64Url(new Uint8Array(signature))}`;
  }

  async verify(
    token: string,
    publicationId: IntegrationPublicationId,
    snapshotHash: string,
  ): Promise<boolean> {
    if (!token.startsWith(TOKEN_PREFIX)) {
      return false;
    }
    const signature = decodeBase64Url(token.slice(TOKEN_PREFIX.length));
    if (signature === null) {
      return false;
    }
    return this.subtle.verify(
      "HMAC",
      await this.key,
      signature,
      new TextEncoder().encode(tokenPayload(publicationId, snapshotHash)),
    );
  }
}

function tokenPayload(publicationId: IntegrationPublicationId, snapshotHash: string): string {
  return `accelevents-confirm-v1\n${publicationId}\n${snapshotHash}`;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
