import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it } from "vitest";
import { D1CommunicationRepository } from "../../infrastructure/cloudflare/repositories/communications";
import {
  createSpeakerLifecycleFixture,
  speakerLifecycleIds as ids,
} from "../../test-support/speaker-lifecycle";
import { CommunicationService } from "../communications/service";
import type { CommunicationDeliveryRequest } from "../communications/types";
import { CommunicationSpeakerCommunications } from "./communications";
import { SpeakerService, SpeakerServiceError } from "./service";

const fixtures: ReturnType<typeof createSpeakerLifecycleFixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

function fixture() {
  const value = createSpeakerLifecycleFixture();
  fixtures.push(value);
  return value;
}

function communications(
  database: D1Database,
  deliveries: CommunicationDeliveryRequest[],
  now = "2099-08-15T04:00:00.000Z",
) {
  const repository = new D1CommunicationRepository(database);
  const service = new CommunicationService(
    repository,
    {
      async send(request) {
        deliveries.push(request);
        return { status: "queued", providerMessageId: `provider:${request.recipientId}` };
      },
    },
    {
      clock: () => new Date(now),
      senderIdentities: {
        auth: "auth@sessionboard.namuh.co",
        speakers: "speakers@sessionboard.namuh.co",
        calendar: "calendar@sessionboard.namuh.co",
      },
    },
  );
  return {
    repository,
    service,
    facade: new CommunicationSpeakerCommunications(service, "https://event.example.test"),
  };
}

async function createSpeaker(
  service: SpeakerService,
  database: ReturnType<typeof createSpeakerLifecycleFixture>["database"],
  participantId: string,
  displayName: string,
  email: string,
) {
  const [firstName, ...lastNames] = displayName.split(" ");
  database.executeScript(`
    INSERT INTO participants
      (id,organization_id,event_id,first_name,last_name,display_name,email,normalized_email,
       identity_state,source_type,source_id,claimed_user_id,version,created_at,updated_at)
    VALUES
      ('${participantId}','${ids.organizationId}','${ids.eventId}','${firstName ?? displayName}',
       '${lastNames.join(" ")}','${displayName}','${email}','${email.toLowerCase()}',
       'resolved','manual','manual:${participantId}',NULL,1,
       '2099-08-15T04:00:00.000Z','2099-08-15T04:00:00.000Z');
  `);
  return service.createOrganizerSpeaker({
    organizationId: ids.organizationId,
    eventId: ids.eventId,
    accountId: ids.organizerAccountId,
    explicitParticipantId: participantId,
    sourceType: "manual",
    sourceId: `manual:${participantId}`,
    idempotencyKey: `create:${participantId}`,
    displayName,
    email,
    jobTitle: "Engineer",
    company: "Example",
    biography: "Speaker biography",
    socialLinks: {},
    status: "confirmed",
  });
}

describe("durable speaker communications", () => {
  it("projects every canonical manual and CSV speaker into all_participants personalization", async () => {
    const lifecycle = fixture();
    const phase = lifecycle.createPhase();
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-manual",
      "Priya Raman",
      "priya@example.test",
    );
    lifecycle.database.executeScript(`
      INSERT INTO participants
        (id,organization_id,event_id,first_name,last_name,display_name,email,normalized_email,
         identity_state,source_type,source_id,claimed_user_id,version,created_at,updated_at)
      VALUES
        ('participant-accepted','${ids.organizationId}','${ids.eventId}','Ada','Lovelace',
         'Ada Lovelace','ada@example.test','ada@example.test','resolved','cfp','submission-accepted',
         NULL,1,'2099-08-15T04:00:00.000Z','2099-08-15T04:00:00.000Z');
    `);
    await expect(
      phase.repository.createProfile({
        id: `speaker-profile:${ids.eventId}:participant-accepted`,
        eventId: ids.eventId,
        participantId: "participant-accepted",
        displayName: "Ada Lovelace",
        email: "ada@example.test",
        biography: "Accepted speaker",
        status: "accepted",
        sourceType: "cfp",
        sourceId: "submission-accepted",
        version: 1,
        updatedAt: "2099-08-15T04:00:00.000Z",
      }),
    ).resolves.toMatchObject({ ok: true });
    const preview = await phase.service.previewSpeakerImport({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      csv: "displayName,email,jobTitle,company,biography\nMarcus Okafor,marcus@example.test,Lead,Northstar,Community builder",
    });
    if (preview.previewId === undefined || preview.sourceDigest === undefined) {
      throw new Error("Expected a durable CSV preview.");
    }
    await phase.service.commitSpeakerImport({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      previewId: preview.previewId,
      sourceDigest: preview.sourceDigest,
      idempotencyKey: "csv-speakers",
    });

    const rows = lifecycle.database.query<{
      id: string;
      audience: string;
      data_json: string;
    }>(`SELECT r.id, a.audience, r.data_json
          FROM communication_recipients r
          JOIN communication_recipient_audiences a
            ON a.organization_id=r.organization_id AND a.event_id=r.event_id AND a.recipient_id=r.id
         WHERE r.organization_id='${ids.organizationId}' AND r.event_id='${ids.eventId}'
         ORDER BY r.id`);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.audience === "all_participants")).toBe(true);
    expect(rows.map((row) => JSON.parse(row.data_json))).toEqual(
      expect.arrayContaining([
        {
          first_name: "Priya",
          display_name: "Priya Raman",
          email: "priya@example.test",
        },
        {
          first_name: "Marcus",
          display_name: "Marcus Okafor",
          email: "marcus@example.test",
        },
        {
          first_name: "Ada",
          display_name: "Ada Lovelace",
          email: "ada@example.test",
        },
      ]),
    );
  });

  it("keeps the built-in welcome template isolated across events", async () => {
    const lifecycle = fixture();
    const phase = lifecycle.createPhase();
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-first-event",
      "Priya Raman",
      "priya@example.test",
    );
    lifecycle.database.executeScript(`
      INSERT INTO communication_recipients
        (id,organization_id,event_id,participant_id,email,display_name,data_json,updated_at)
      VALUES
        ('participant-second-event','${ids.organizationId}','event-second',
         'participant-second-event','ada@example.test','Ada Lovelace',
         '{"first_name":"Ada","display_name":"Ada Lovelace","email":"ada@example.test"}',
         '2099-08-15T04:00:00.000Z');
      INSERT INTO communication_recipient_audiences
        (organization_id,event_id,recipient_id,audience)
      VALUES
        ('${ids.organizationId}','event-second','participant-second-event','all_participants');
    `);
    const deliveryRequests: CommunicationDeliveryRequest[] = [];
    const { facade } = communications(
      lifecycle.database as unknown as D1Database,
      deliveryRequests,
    );

    await expect(
      facade.previewInvitations({
        organizationId: ids.organizationId,
        eventId: ids.eventId,
        accountId: ids.organizerAccountId,
        participantIds: ["participant-first-event"],
      }),
    ).resolves.toHaveLength(1);
    await expect(
      facade.previewInvitations({
        organizationId: ids.organizationId,
        eventId: "event-second",
        accountId: ids.organizerAccountId,
        participantIds: ["participant-second-event"],
      }),
    ).resolves.toHaveLength(1);

    const templates = lifecycle.database.query<{ id: string; event_id: string }>(
      `SELECT id,event_id
         FROM communication_templates
        WHERE organization_id='${ids.organizationId}'
          AND purpose='organizer_group_email'
        ORDER BY event_id`,
    );
    expect(templates).toHaveLength(2);
    expect(new Set(templates.map((template) => template.id))).toHaveProperty("size", 2);
  });

  it("persists versions, exact previews, sends, provider timestamps, and history across recreation", async () => {
    const lifecycle = fixture();
    const phase = lifecycle.createPhase();
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-priya",
      "Priya Raman",
      "priya@example.test",
    );
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-marcus",
      "Marcus Okafor",
      "marcus@example.test",
    );
    const database = lifecycle.database as unknown as D1Database;
    const delivered: CommunicationDeliveryRequest[] = [];
    const first = communications(database, delivered);
    const template = await first.facade.createTemplate({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      templateId: "speaker-update",
      name: "Speaker update",
      subject: "Hello {{first_name}}",
      html: '<p>Hello {{display_name}} at <a href="{{portal_url}}">the portal</a></p>',
      text: "Hello {{first_name}} at {{email}}: {{portal_url}}",
      status: "approved",
    });
    const version = await first.facade.createTemplateVersion({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      templateId: template.id,
      subject: "Update for {{first_name}}",
      html: '<p>Update for {{display_name}} at <a href="{{portal_url}}">the portal</a></p>',
      text: "Update for {{first_name}} at {{email}}: {{portal_url}}",
      status: "approved",
    });
    const preview = await first.facade.preview({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      participantIds: ["participant-priya"],
      templateId: version.id,
      templateVersion: version.version,
      data: { portal_url: "https://attacker.example.test/override" },
    });
    expect(preview.recipientIds).toEqual(["participant-priya"]);
    expect(preview.recipients[0]).toMatchObject({
      html: expect.stringContaining("https://event.example.test/login?next=/work"),
      text: expect.stringContaining("https://event.example.test/login?next=/work"),
    });
    expect(preview.recipients[0]?.html).not.toContain("attacker.example.test");
    expect(preview.recipients[0]?.text).not.toContain("attacker.example.test");

    const second = communications(database, delivered);
    const send = await second.facade.send({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      previewId: preview.id,
      idempotencyKey: "speaker-update-once",
    });
    expect(send.recipientIds).toEqual(["participant-priya"]);
    expect(delivered.map((item) => item.recipientId)).toEqual(["participant-priya"]);

    const statusAt = "2099-08-15T05:00:00.000Z";
    const third = communications(database, delivered, statusAt);
    await third.service.recordDeliveryStatus(
      {
        tenantId: ids.organizationId,
        userId: "provider-webhook",
        kind: "automation",
        grants: [{ eventId: ids.eventId, role: "delivery" }],
      },
      {
        eventId: ids.eventId,
        sendId: send.id,
        recipientId: "participant-priya",
        status: "delivered",
        providerMessageId: "provider:participant-priya",
      },
    );
    const history = await third.facade.listHistory(
      ids.organizationId,
      ids.eventId,
      ids.organizerAccountId,
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: send.id,
      status: "sent",
      recipientIds: ["participant-priya"],
      deliveries: [
        {
          participantId: "participant-priya",
          status: "sent",
          providerMessageId: "provider:participant-priya",
        },
      ],
    });
    expect(history[0]?.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ occurredAt: statusAt, action: "delivery_sent" }),
      ]),
    );
  });

  it("replays one canonical invitation and conflicts when the same key selects another speaker", async () => {
    const lifecycle = fixture();
    const phase = lifecycle.createPhase();
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-priya",
      "Priya Raman",
      "priya@example.test",
    );
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-marcus",
      "Marcus Okafor",
      "marcus@example.test",
    );
    const delivered: CommunicationDeliveryRequest[] = [];
    const durable = communications(lifecycle.database as unknown as D1Database, delivered);
    const service = new SpeakerService(phase.repository, phase.assets, {
      speakerSender: "speakers@sessionboard.namuh.co",
      communications: durable.facade,
    });
    const input = {
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      participantIds: ["participant-priya"],
      templateId: "ignored-client-template",
      idempotencyKey: "welcome-once",
    } as const;
    const first = await service.sendOrganizerSpeakerInvitations(input);
    const replay = await service.sendOrganizerSpeakerInvitations(input);
    expect(first.recipients).toHaveLength(1);
    expect(replay).toMatchObject({ status: "duplicate", duplicate: true });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.text).toContain("review and accept your speaker invitation");
    expect(delivered[0]?.text).toContain("https://event.example.test/login?next=/work");
    expect(JSON.stringify(delivered)).not.toMatch(/grant|token|secret/iu);

    await expect(
      service.sendOrganizerSpeakerInvitations({
        ...input,
        participantIds: ["participant-marcus"],
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof SpeakerServiceError &&
        error.code === "VERSION_CONFLICT" &&
        error.status === 409,
    );
    expect(delivered).toHaveLength(1);
  });
});
