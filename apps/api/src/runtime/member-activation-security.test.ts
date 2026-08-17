import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import type { MemberInvitation } from "../features/members/types";
import { SqliteD1 } from "../test-support/sqlite-d1";
import { D1MemberAuthBoundary, D1MemberIdentityRepository } from "./cloudflare";

const now = "2026-08-15T12:00:00.000Z";
const expiresAt = "2099-01-01T00:00:00.000Z";
const identityMigration = readFileSync(
  fileURLToPath(new URL("../../migrations/0001_identity_and_access.sql", import.meta.url)),
  "utf8",
);
const entitlementMigration = readFileSync(
  fileURLToPath(new URL("../../migrations/0041_organization_entitlements.sql", import.meta.url)),
  "utf8",
);
const organizationMigration = readFileSync(
  fileURLToPath(new URL("../../migrations/0004_organizations.sql", import.meta.url)),
  "utf8",
);
const testMigration = `${identityMigration}\n${organizationMigration}\n${entitlementMigration}`;

function invitation(): MemberInvitation {
  return {
    id: "invitation-1",
    organizationId: "org-a",
    userId: "user-1",
    email: "reviewer@example.test",
    name: "Review Person",
    role: "reviewer",
    idempotencyKey: "invite-1",
    status: "pending",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    deliveredAt: null,
    acceptedAt: null,
  };
}

describe("D1 member activation credential protection", () => {
  it("stores an expensive verifier, rejects a different retry, and clears it on finalization", async () => {
    const database = new SqliteD1("eventloom-member-activation-", testMigration);
    try {
      const d1 = database as unknown as D1Database;
      const identity = new D1MemberIdentityRepository(d1);
      const auth = new D1MemberAuthBoundary(d1, "https://web.example.test");
      await identity.createUser({
        userId: "user-1",
        email: "reviewer@example.test",
        name: "Review Person",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
      await identity.createInvitation(invitation());
      const setup = await auth.issueSetupLink({
        invitationId: "invitation-1",
        organizationId: "org-a",
        userId: "user-1",
        email: "reviewer@example.test",
        expiresAt: new Date(expiresAt),
      });
      await identity.markInvitationDelivered("invitation-1", now);
      const claim = await auth.consumeSetupLink(setup.setupUrl, "org-a");
      expect(claim).not.toBeNull();
      if (claim === null) throw new Error("Expected setup-link claim.");
      const credential = JSON.stringify([claim.tokenDigest, "Review Person", "StrongPass1!"]);

      await identity.claimInvitationActivation("invitation-1", credential, now);
      const stored = database.query<{ identifier: string }>(
        "SELECT identifier FROM auth_verifications WHERE id = 'invitation-1'",
      )[0];
      const envelope = JSON.parse(stored?.identifier ?? "null") as Record<string, unknown>;
      expect(envelope.activationCredentialHash).toEqual(expect.any(String));
      expect(String(envelope.activationCredentialHash)).not.toBe(credential);
      expect(String(envelope.activationCredentialHash)).not.toMatch(/^[a-f0-9]{64}$/u);
      expect(stored?.identifier).not.toContain("StrongPass1!");

      await expect(
        identity.claimInvitationActivation("invitation-1", credential, now),
      ).resolves.toMatchObject({ status: "accepted" });
      await expect(
        identity.claimInvitationActivation(
          "invitation-1",
          JSON.stringify([claim.tokenDigest, "Review Person", "DifferentStrong2!"]),
          now,
        ),
      ).rejects.toThrow("different account details");

      await expect(auth.finalizeSetupLink(claim)).resolves.toBe(true);
      const finalized = JSON.parse(
        database.query<{ identifier: string }>(
          "SELECT identifier FROM auth_verifications WHERE id = 'invitation-1'",
        )[0]?.identifier ?? "null",
      ) as Record<string, unknown>;
      expect(finalized.activationCredentialHash).toBeNull();
      expect(finalized.activationDigest).toBeNull();
      expect(finalized.usedAt).toEqual(expect.any(String));
    } finally {
      database.dispose();
    }
  });

  it("upgrades a matching legacy activation digest before resuming activation", async () => {
    const database = new SqliteD1("eventloom-member-activation-legacy-", testMigration);
    try {
      const d1 = database as unknown as D1Database;
      const identity = new D1MemberIdentityRepository(d1);
      const auth = new D1MemberAuthBoundary(d1, "https://web.example.test");
      await identity.createUser({
        userId: "user-1",
        email: "reviewer@example.test",
        name: "Review Person",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
      await identity.createInvitation(invitation());
      const setup = await auth.issueSetupLink({
        invitationId: "invitation-1",
        organizationId: "org-a",
        userId: "user-1",
        email: "reviewer@example.test",
        expiresAt: new Date(expiresAt),
      });
      await identity.markInvitationDelivered("invitation-1", now);
      const claim = await auth.consumeSetupLink(setup.setupUrl, "org-a");
      expect(claim).not.toBeNull();
      if (claim === null) throw new Error("Expected setup-link claim.");
      const credential = JSON.stringify([claim.tokenDigest, "Review Person", "StrongPass1!"]);
      const stored = database.query<{ identifier: string }>(
        "SELECT identifier FROM auth_verifications WHERE id = 'invitation-1'",
      )[0];
      const legacyEnvelope = JSON.parse(stored?.identifier ?? "null") as Record<string, unknown>;
      legacyEnvelope.invitation = {
        ...(legacyEnvelope.invitation as Record<string, unknown>),
        status: "accepted",
        acceptedAt: now,
        updatedAt: now,
      };
      legacyEnvelope.activationCredentialHash = null;
      legacyEnvelope.activationDigest = createHash("sha256").update(credential).digest("hex");
      await d1
        .prepare("UPDATE auth_verifications SET identifier = ?, updated_at = ? WHERE id = ?")
        .bind(JSON.stringify(legacyEnvelope), now, "invitation-1")
        .run();

      await expect(
        identity.claimInvitationActivation("invitation-1", credential, now),
      ).resolves.toMatchObject({ status: "accepted" });
      const upgraded = JSON.parse(
        database.query<{ identifier: string }>(
          "SELECT identifier FROM auth_verifications WHERE id = 'invitation-1'",
        )[0]?.identifier ?? "null",
      ) as Record<string, unknown>;
      expect(upgraded.activationCredentialHash).toEqual(expect.any(String));
      expect(String(upgraded.activationCredentialHash)).not.toMatch(/^[a-f0-9]{64}$/u);
      expect(upgraded.activationDigest).toBeNull();
    } finally {
      database.dispose();
    }
  });
});
