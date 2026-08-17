import type { D1Database } from "@cloudflare/workers-types";
import { createTransport } from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1CommunicationRepository } from "../../infrastructure/cloudflare/repositories/communications";
import {
  createSpeakerLifecycleFixture,
  speakerLifecycleIds as ids,
} from "../../test-support/speaker-lifecycle";
import { CommunicationService } from "../communications/service";
import type { CommunicationDeliveryRequest } from "../communications/types";
import { CommunicationSpeakerCommunications, SPEAKER_WELCOME_TEMPLATE_ID } from "./communications";
import { speakerCommunicationActor } from "./communications-mapping";
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

  it("canonicalizes legacy divergent HTML before preview and send", async () => {
    const lifecycle = fixture();
    const phase = lifecycle.createPhase();
    await createSpeaker(
      phase.service,
      lifecycle.database,
      "participant-priya",
      "Priya Raman",
      "priya@example.test",
    );
    const delivered: CommunicationDeliveryRequest[] = [];
    const durable = communications(lifecycle.database as unknown as D1Database, delivered);
    const actor = speakerCommunicationActor(
      ids.organizationId,
      ids.eventId,
      ids.organizerAccountId,
    );
    const legacy = await durable.service.createTemplate(actor, {
      eventId: ids.eventId,
      id: "speaker-approved-welcome:custom",
      name: "Legacy speaker message",
      purpose: "organizer_group_email",
      subject: "Hello {{first_name}}",
      html: '<img src="https://attacker.example/pixel"><p>Stale body</p>',
      text: "Hello {{first_name}}\n\nThis is the canonical plain-text body.",
    });
    const approved = await durable.service.approveTemplate(
      actor,
      ids.eventId,
      legacy.id,
      legacy.version,
    );

    const previewInput = {
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      participantIds: ["participant-priya"],
      templateId: approved.id,
      templateVersion: approved.version,
    } as const;
    const originalCreateTemplateVersion = durable.service.createTemplateVersion.bind(
      durable.service,
    );
    let releaseCreateVersion!: () => void;
    const createVersionGate = new Promise<void>((resolve) => {
      releaseCreateVersion = resolve;
    });
    let createVersionCalls = 0;
    const createVersion = vi
      .spyOn(durable.service, "createTemplateVersion")
      .mockImplementation(async (actor, input) => {
        createVersionCalls += 1;
        if (createVersionCalls === 2) releaseCreateVersion();
        await createVersionGate;
        return originalCreateTemplateVersion(actor, input);
      });
    const concurrentPreviews = await Promise.allSettled([
      durable.facade.preview(previewInput),
      durable.facade.preview(previewInput),
    ]);
    createVersion.mockRestore();
    expect(createVersionCalls).toBe(2);
    expect(concurrentPreviews.every((result) => result.status === "fulfilled")).toBe(true);
    if (concurrentPreviews[0]?.status !== "fulfilled") {
      throw concurrentPreviews[0]?.reason;
    }
    const preview = concurrentPreviews[0].value;

    expect(preview.templateVersion).toBe(approved.version + 1);
    expect(preview.recipients[0]?.html).toBe(
      "<p>Hello Priya</p>\n<p>This is the canonical plain-text body.</p>",
    );
    expect(preview.recipients[0]?.html).not.toContain("attacker.example");

    const repeatedPreview = await durable.facade.preview(previewInput);
    expect(repeatedPreview.templateVersion).toBe(preview.templateVersion);

    await durable.facade.send({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      previewId: preview.id,
      idempotencyKey: "legacy-template-send",
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.html).toBe(preview.recipients[0]?.html);
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
    lifecycle.database.executeScript(`
      UPDATE communication_recipients
      SET data_json=json_set(data_json,'$.portal_url','javascript:alert(document.domain)')
      WHERE organization_id='${ids.organizationId}' AND event_id='${ids.eventId}'
        AND id='participant-priya';
    `);
    const database = lifecycle.database as unknown as D1Database;
    const delivered: CommunicationDeliveryRequest[] = [];
    const first = communications(database, delivered);
    const template = await first.facade.createTemplate({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      templateId: "speaker-approved-welcome:custom",
      name: "Speaker update",
      subject: "Hello {{first_name}}",
      html: '<img src="https://attacker.example/pixel"><p>Stale body</p>',
      text: "Hello {{first_name}} ({{display_name}}) at {{email}}: {{portal_url}}",
      status: "approved",
    });
    expect(template.html).toBe(
      "<p>Hello {{first_name}} ({{display_name}}) at {{email}}: {{portal_url}}</p>",
    );
    const version = await first.facade.createTemplateVersion({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      templateId: template.id,
      subject: "Update for {{first_name}}",
      html: '<p>Hello {{display_name}} at <a href="{{portal_url}}">the portal</a></p>',
      text: "Hello {{first_name}},\n\nThe latest agenda is ready for {{display_name}}.\nReply to {{email}}: {{portal_url}}",
      status: "approved",
    });
    expect(version.html).toBe(
      "<p>Hello {{first_name}},</p>\n<p>The latest agenda is ready for {{display_name}}.<br />Reply to {{email}}: {{portal_url}}</p>",
    );
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
    expect(preview.recipients[0]?.html).toContain("The latest agenda is ready for Priya Raman.");
    expect(preview.recipients[0]?.html).toContain("https://event.example.test/login?next=/work");
    expect(preview.recipients[0]?.text).toContain("The latest agenda is ready for Priya Raman.");
    expect(preview.recipients[0]?.text).toContain("https://event.example.test/login?next=/work");
    expect(preview.recipients[0]?.html).toContain("priya@example.test");
    expect(preview.recipients[0]?.text).toContain("priya@example.test");
    expect(preview.recipients[0]?.html).not.toContain("attacker.example.test");
    expect(preview.recipients[0]?.text).not.toContain("attacker.example.test");
    expect(preview.recipients[0]?.html).not.toContain("javascript:");
    expect(preview.recipients[0]?.text).not.toContain("javascript:");
    expect(preview.recipients[0]?.html).not.toContain("{{");
    expect(preview.recipients[0]?.text).not.toContain("{{");
    expect(preview.recipients[0]?.html).not.toContain("Hello Priya Raman at");

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
    expect(delivered[0]).toMatchObject({
      subject: preview.subject,
      html: preview.recipients[0]?.html,
      text: preview.recipients[0]?.text,
    });
    const providerRequest = delivered[0];
    expect(providerRequest).toBeDefined();
    if (providerRequest === undefined) throw new Error("Expected one provider request.");
    const mimeTransport = createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    const mimeResult = await mimeTransport.sendMail({
      from: providerRequest.from,
      to: providerRequest.to,
      subject: providerRequest.subject,
      html: providerRequest.html,
      text: providerRequest.text,
    });
    const rawMime =
      typeof mimeResult.message === "string" ? mimeResult.message : mimeResult.message.toString();
    expect(rawMime).toContain(`Subject: ${providerRequest.subject}`);
    expect(rawMime).toContain("Content-Type: multipart/alternative");
    expect(rawMime).toContain(providerRequest.text);
    const decodedRawMime = rawMime
      .replace(/=\r?\n/gu, "")
      .replace(/=([0-9A-F]{2})/gu, (_encoded, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    expect(decodedRawMime).toContain(providerRequest.html);
    expect(decodedRawMime).not.toContain("{{");

    await second.facade.createTemplateVersion({
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      templateId: template.id,
      subject: "Later {{first_name}}",
      html: "<p>Later {{first_name}}</p>",
      text: "Later {{first_name}}",
      status: "approved",
    });
    expect(
      await second.facade.send({
        organizationId: ids.organizationId,
        eventId: ids.eventId,
        accountId: ids.organizerAccountId,
        previewId: preview.id,
        idempotencyKey: "speaker-update-once",
      }),
    ).toEqual(send);
    expect(delivered).toHaveLength(1);

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
    const communicationActor = speakerCommunicationActor(
      ids.organizationId,
      ids.eventId,
      ids.organizerAccountId,
    );
    const historicalTemplate = await durable.service.createTemplate(communicationActor, {
      eventId: ids.eventId,
      id: SPEAKER_WELCOME_TEMPLATE_ID,
      name: "Speaker invitation",
      purpose: "organizer_group_email",
      subject: "Review your speaker invitation",
      html: '<p>Hello {{first_name}},</p><p><a href="{{portal_url}}">Sign in to the work hub</a> to review and accept your speaker invitation.</p>',
      text: "Hello {{first_name}},\n\nSign in to the work hub to review and accept your speaker invitation: {{portal_url}}",
    });
    const approvedTemplate = await durable.service.approveTemplate(
      communicationActor,
      ids.eventId,
      historicalTemplate.id,
      historicalTemplate.version,
    );
    const historicalPreview = await durable.service.previewGroupSend(communicationActor, {
      eventId: ids.eventId,
      purpose: "organizer_group_email",
      audience: "all_participants",
      templateId: approvedTemplate.id,
      templateVersion: approvedTemplate.version,
      recipientIds: ["participant-priya"],
      data: { portal_url: "https://event.example.test/login?next=/work" },
      protectedRecipientDataKeys: ["portal_url"],
    });
    const historicalSend = await durable.service.sendGroup(communicationActor, {
      eventId: ids.eventId,
      previewId: historicalPreview.id,
      idempotencyKey: "welcome-once",
    });
    const laterTrustedVersion = await durable.service.createTemplateVersion(communicationActor, {
      templateId: approvedTemplate.id,
      subject: approvedTemplate.subject,
      html: approvedTemplate.html,
      text: approvedTemplate.text,
    });
    await durable.service.approveTemplate(
      communicationActor,
      ids.eventId,
      laterTrustedVersion.id,
      laterTrustedVersion.version,
    );
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
    await lifecycle.database
      .prepare(
        "DELETE FROM communication_recipients WHERE organization_id=? AND event_id=? AND id=?",
      )
      .bind(ids.organizationId, ids.eventId, "participant-priya")
      .run();
    const first = await service.sendOrganizerSpeakerInvitations(input);
    const replay = await service.sendOrganizerSpeakerInvitations(input);
    expect(first.recipients).toHaveLength(1);
    expect(first).toMatchObject({ status: "duplicate", duplicate: true });
    expect(replay).toMatchObject({ status: "duplicate", duplicate: true });
    expect(delivered).toHaveLength(1);
    expect(
      await durable.facade.listTemplates(ids.organizationId, ids.eventId, ids.organizerAccountId),
    ).toHaveLength(2);
    expect(delivered[0]?.html).toContain('<a href="https://event.example.test/login?next=/work');
    expect(delivered[0]?.html).toContain('">Sign in to the work hub</a>');
    expect(delivered[0]?.text).toContain("review and accept your speaker invitation");
    expect(delivered[0]?.text).toContain("https://event.example.test/login?next=/work");
    expect(JSON.stringify(delivered)).not.toMatch(/grant|token|secret/iu);

    await lifecycle.database
      .prepare(
        "UPDATE communication_send_recipients SET data_json=? WHERE send_id=? AND recipient_id=?",
      )
      .bind(
        JSON.stringify({ portal_url: "https://attacker.example/work-hub" }),
        historicalSend.id,
        "participant-priya",
      )
      .run();
    await expect(service.sendOrganizerSpeakerInvitations(input)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof SpeakerServiceError &&
        error.code === "VERSION_CONFLICT" &&
        error.status === 409,
    );
    expect(delivered).toHaveLength(1);

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
