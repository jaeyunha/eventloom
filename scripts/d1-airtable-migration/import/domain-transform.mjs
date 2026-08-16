import { canonicalJson, sha256 } from "./import-lib.mjs";

const DEFAULT_ORGANIZATION = "ai-engineer";
const EPOCH = "1970-01-01T00:00:00.000Z";

const json = (value) => JSON.stringify(value);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (...values) =>
  values.find((value) => typeof value === "string" && value.trim() !== "")?.trim();
const integer = (value, fallback = 1) =>
  Number.isSafeInteger(value) && value > 0 ? value : fallback;
const boolean = (value) => (value === true ? 1 : 0);
const array = (value) => (Array.isArray(value) ? value : []);
const instant = (value, fallback = EPOCH) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;

function parse(fields, names) {
  for (const name of names) {
    const value = fields[name];
    if (typeof value !== "string" || value.trim() === "") continue;
    try {
      const parsed = JSON.parse(value);
      if (object(parsed)) return parsed;
    } catch {
      throw new Error(`${name} is not valid JSON.`);
    }
  }
  return {};
}

function sourceRecord(table, record) {
  return {
    tableId: table.id,
    tableName: table.name,
    applicationId: record.applicationId,
    recordId: record.airtableRecordId,
    rawHash: record.rawSha256 ?? sha256(canonicalJson(record.raw)),
    createdTime: instant(record.raw?.createdTime),
    fields: record.raw?.fields ?? record.fields ?? {},
  };
}

function normalizeEventStatus(value) {
  if (value === "archived" || value === "closed") return "archived";
  if (value === "active" || value === "open" || value === "published") return "active";
  return "draft";
}

function scope(payload, fields, fallbackEventOrganization = DEFAULT_ORGANIZATION) {
  return {
    organizationId: text(
      payload.organizationId,
      payload.tenantId,
      fields["Organization ID"],
      fallbackEventOrganization,
    ),
    eventId: text(payload.eventId, fields["Event ID"]),
  };
}

function row(table, values, id, suffix = "") {
  return { table, row: values, id: suffix === "" ? id : `${id}:${suffix}` };
}

function add(context, source, item) {
  context.operations.push({ ...item, source });
}

function quarantine(context, source, reason) {
  context.quarantine.push({
    tableId: source.tableId,
    recordId: source.recordId,
    applicationId: source.applicationId,
    reason,
  });
}

function splitName(displayName) {
  const parts = (displayName ?? "").trim().split(/\s+/u).filter(Boolean);
  return { first: parts.shift() ?? "", last: parts.join(" ") };
}

function ensureOrganization(context, organizationId, source, fields = {}, payload = {}) {
  if (context.organizations.has(organizationId)) return;
  context.organizations.add(organizationId);
  const createdAt = instant(fields["Created At"], source.createdTime);
  add(
    context,
    source,
    row(
      "organizations",
      {
        organization_id: organizationId,
        slug:
          text(fields.Slug, payload.slug, organizationId)
            .toLowerCase()
            .replaceAll(/[^a-z0-9-]+/gu, "-")
            .replaceAll(/^-|-$/gu, "") || `org-${sha256(organizationId).slice(0, 12)}`,
        name: text(fields.Name, payload.name, organizationId),
        config_json: json(object(payload) ? payload : {}),
        created_at: createdAt,
        updated_at: instant(fields["Updated At"], createdAt),
      },
      organizationId,
    ),
  );
}

function ensureEventStatus(context, organizationId, eventId, status, source) {
  const key = `${organizationId}:${eventId}:${status}`;
  if (context.sessionStatuses.has(key)) return;
  context.sessionStatuses.add(key);
  add(
    context,
    source,
    row(
      "session_statuses",
      {
        id: `session-status:${eventId}:${status}`,
        organization_id: organizationId,
        event_id: eventId,
        value: status,
        name: status,
        description: "Imported Airtable session status.",
        agenda_eligible: status === "confirmed" || status === "accepted" ? 1 : 0,
        sort_order: context.sessionStatuses.size - 1,
        active: 1,
        version: 1,
        created_at: source.createdTime,
        updated_at: source.createdTime,
      },
      `session-status:${eventId}:${status}`,
    ),
  );
}

function ensureParticipant(context, participant, organizationId, eventId, source) {
  const id = text(participant.id, participant.participantId);
  if (!id) throw new Error("Participant has no stable id.");
  const key = `${organizationId}:${eventId}:${id}`;
  if (context.participants.has(key)) return id;
  const displayName = text(
    participant.displayName,
    `${participant.firstName ?? ""} ${participant.lastName ?? ""}`,
    id,
  );
  const split = splitName(displayName);
  const email = text(participant.email) ?? "";
  context.participants.add(key);
  add(
    context,
    source,
    row(
      "participants",
      {
        id,
        organization_id: organizationId,
        event_id: eventId,
        first_name: text(participant.firstName, split.first) ?? "",
        last_name: text(participant.lastName, split.last) ?? "",
        display_name: displayName,
        email,
        normalized_email: email.toLowerCase(),
        identity_state: email === "" ? "ambiguous" : "resolved",
        source_type: ["cfp", "manual", "csv", "crm"].includes(participant.sourceType)
          ? participant.sourceType
          : "cfp",
        source_id: text(participant.sourceId) ?? null,
        claimed_user_id: null,
        version: integer(participant.version),
        created_at: instant(participant.createdAt, source.createdTime),
        updated_at: instant(participant.updatedAt, source.createdTime),
      },
      id,
    ),
  );
  return id;
}

function transformOrganization(context, source) {
  const payload = parse(source.fields, ["Settings JSON"]);
  ensureOrganization(context, source.applicationId, source, source.fields, payload);
}

function transformEvent(context, source) {
  const fields = source.fields;
  const payload = parse(fields, ["Settings JSON"]);
  const organizationId = scope(payload, fields).organizationId;
  ensureOrganization(context, organizationId, source);
  const id = text(fields["Application ID"], payload.id, source.applicationId);
  const timeZone = text(fields["Time Zone"], payload.timeZone, payload.timezone, "UTC");
  const startsAt = instant(fields["Starts At"] ?? payload.startsAt, EPOCH);
  const endsFallback = new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();
  const endsCandidate = instant(fields["Ends At"] ?? payload.endsAt, endsFallback);
  const endsAt = Date.parse(endsCandidate) > Date.parse(startsAt) ? endsCandidate : endsFallback;
  const cfp = object(payload.cfpSettings) ? payload.cfpSettings : {};
  const calendar = object(payload.defaultCalendarSettings) ? payload.defaultCalendarSettings : {};
  const opensAt = text(cfp.opensAt, payload.opensAt);
  const closesAt = text(cfp.closesAt, payload.closesAt);
  const createdAt = instant(fields["Created At"] ?? payload.createdAt, source.createdTime);
  add(
    context,
    source,
    row(
      "events",
      {
        id,
        organization_id: organizationId,
        slug: text(fields.Slug, payload.slug, id),
        name: text(fields.Name, payload.name, id),
        status: normalizeEventStatus(payload.status ?? fields.Status),
        time_zone: timeZone,
        starts_at: startsAt,
        ends_at: endsAt,
        venue: text(payload.venue, payload.location) ?? null,
        cfp_enabled:
          typeof cfp.enabled === "boolean"
            ? boolean(cfp.enabled)
            : boolean(Boolean(opensAt && closesAt)),
        cfp_opens_at: opensAt ? instant(opensAt) : null,
        cfp_closes_at: closesAt ? instant(closesAt) : null,
        default_duration_minutes: integer(calendar.durationMinutes, 30),
        default_calendar_time_zone: text(calendar.timeZone, timeZone),
        default_calendar_location: text(calendar.location, payload.venue, payload.location) ?? null,
        version: integer(fields.Version ?? payload.version),
        created_at: createdAt,
        updated_at: instant(fields["Updated At"] ?? payload.updatedAt, createdAt),
        created_by: text(payload.createdBy, "system"),
        updated_by: text(payload.updatedBy, payload.createdBy, "system"),
      },
      id,
    ),
  );
  for (const embed of array(payload.embedConfigurations)) {
    add(
      context,
      source,
      row(
        "event_embed_configurations",
        {
          id: embed.id,
          organization_id: organizationId,
          event_id: id,
          widget_id: embed.widgetId,
          name: embed.name,
          theme: embed.theme,
          output_format: embed.outputFormat,
          layout: embed.layout,
          display_fields_json: json(array(embed.displayFields)),
          track_ids_json: json(array(embed.trackIds)),
          enabled: boolean(embed.enabled),
          revision: integer(embed.revision),
          created_at: createdAt,
          updated_at: instant(payload.updatedAt, createdAt),
        },
        embed.id,
      ),
    );
  }
}

function transformTaxonomy(context, source, target) {
  const fields = source.fields;
  const payload = parse(
    fields,
    target === "rooms" ? ["Settings JSON", "Metadata JSON"] : ["Metadata JSON", "Settings JSON"],
  );
  const { organizationId, eventId } = scope(payload, fields);
  ensureOrganization(context, organizationId, source);
  const id = text(fields["Application ID"], payload.id, source.applicationId);
  const createdAt = instant(payload.createdAt, source.createdTime);
  const values = {
    id,
    organization_id: organizationId,
    event_id: eventId,
    name: text(fields.Name, payload.name, id),
    version: integer(fields.Version ?? payload.version),
    created_at: createdAt,
    updated_at: instant(payload.updatedAt, createdAt),
    created_by: text(payload.createdBy, "system"),
    updated_by: text(payload.updatedBy, payload.createdBy, "system"),
  };
  if (target === "rooms")
    values.capacity = Number.isSafeInteger(fields.Capacity)
      ? fields.Capacity
      : Math.max(0, payload.capacity ?? 0);
  else values.description = text(fields.Description, payload.description) ?? "";
  add(context, source, row(target, values, id));
  context.taxonomy.set(`${target}:${eventId}:${values.name}`, id);
  context.taxonomy.set(`${target}:${eventId}:${id}`, id);
}

function transformForm(context, source) {
  const form = parse(source.fields, ["Fields JSON"]);
  const { organizationId, eventId } = scope(form, source.fields);
  ensureOrganization(context, organizationId, source);
  const createdAt = instant(form.createdAt, source.createdTime);
  const settings = object(form.settings) ? form.settings : {};
  add(
    context,
    source,
    row(
      "cfp_forms",
      {
        id: form.id,
        organization_id: organizationId,
        event_id: eventId,
        name: form.name,
        status: ["draft", "published", "closed"].includes(form.status) ? form.status : "draft",
        welcome_content: text(form.welcomeContent) ?? "",
        speaker_limit: integer(settings.speakerLimit, 1),
        max_submissions_per_account: integer(settings.maxSubmissionsPerAccount, 1),
        reminders_enabled: boolean(settings.remindersEnabled),
        admin_notifications_enabled: boolean(settings.adminNotificationsEnabled),
        confirmation_message: text(settings.confirmationMessage) ?? "",
        success_content: text(settings.successContent) ?? "",
        redirect_url: text(settings.redirectUrl) ?? null,
        version: integer(form.version),
        created_at: createdAt,
        updated_at: instant(form.updatedAt, createdAt),
      },
      form.id,
    ),
  );
  for (const [index, section] of array(form.sections).entries())
    add(
      context,
      source,
      row(
        "cfp_form_sections",
        {
          organization_id: organizationId,
          form_id: form.id,
          id: section.id,
          title: section.title,
          description: text(section.description) ?? "",
          sort_order: Number.isSafeInteger(section.order) ? section.order : index,
        },
        `${form.id}:${section.id}`,
      ),
    );
  for (const [scopeName, fields] of [
    ["submission", form.submissionFields],
    ["participant", form.participantFields],
  ]) {
    for (const [index, field] of array(fields).entries())
      add(
        context,
        source,
        row(
          "cfp_form_fields",
          {
            organization_id: organizationId,
            form_id: form.id,
            id: field.id,
            section_id: field.sectionId,
            scope: scopeName,
            field_key: field.key,
            label: field.label,
            description: text(field.description) ?? null,
            placeholder: text(field.placeholder) ?? null,
            kind: field.kind,
            required: boolean(field.required),
            options_json: json(array(field.options)),
            file_owner: field.kind === "file_request" ? (field.fileOwner ?? scopeName) : null,
            allowed_mime_types_json:
              field.kind === "file_request" ? json(array(field.allowedMimeTypes)) : null,
            max_bytes: field.kind === "file_request" ? field.maxBytes : null,
            reusable_field_id: field.reusableFieldId ?? null,
            reusable_field_version: field.reusableFieldVersion ?? null,
            sort_order: index,
          },
          `${form.id}:${scopeName}:${field.id}`,
        ),
      );
  }
  for (const [index, ruleValue] of array(form.rules).entries())
    add(
      context,
      source,
      row(
        "cfp_form_rules",
        {
          organization_id: organizationId,
          form_id: form.id,
          id: ruleValue.id,
          priority: Number.isSafeInteger(ruleValue.priority) ? ruleValue.priority : index,
          condition_json: json(ruleValue.when ?? ruleValue.condition),
          actions_json: json(array(ruleValue.actions)),
        },
        `${form.id}:${ruleValue.id}`,
      ),
    );
}

function transformSubmission(context, source) {
  const submission = parse(source.fields, ["Answers JSON"]);
  if (
    submission.entityType === "speaker_submission" ||
    source.applicationId.startsWith("speaker-submission:")
  ) {
    quarantine(
      context,
      source,
      "SPEAKER_SUBMISSION_PROJECTION_HAS_NO_LOSSLESS_NUMBERED_SCHEMA_TARGET",
    );
    return;
  }
  const { organizationId, eventId } = scope(submission, source.fields);
  ensureOrganization(context, organizationId, source);
  const createdAt = instant(submission.createdAt, source.createdTime);
  add(
    context,
    source,
    row(
      "submissions",
      {
        id: submission.id,
        organization_id: organizationId,
        event_id: eventId,
        form_id: submission.formId,
        owner_account_id: submission.ownerAccountId,
        form_version: integer(submission.formVersion),
        status: submission.status,
        completed_steps_json: json(array(submission.completedSteps)),
        version: integer(submission.version),
        created_at: createdAt,
        updated_at: instant(submission.updatedAt, createdAt),
        submitted_at: submission.submittedAt ? instant(submission.submittedAt) : null,
        reopened_at: submission.reopenedAt ? instant(submission.reopenedAt) : null,
        withdrawn_at: submission.withdrawnAt ? instant(submission.withdrawnAt) : null,
        final_decision_at: submission.finalDecisionAt ? instant(submission.finalDecisionAt) : null,
      },
      submission.id,
    ),
  );
  add(
    context,
    source,
    row(
      "submission_versions",
      {
        organization_id: organizationId,
        event_id: eventId,
        submission_id: submission.id,
        version: integer(submission.version),
        reason:
          submission.status === "submitted"
            ? "submitted"
            : submission.status === "withdrawn"
              ? "withdrawn"
              : submission.status === "reopened"
                ? "reopened"
                : "draft_saved",
        actor_id: submission.ownerAccountId,
        idempotency_key: null,
        snapshot_json: json(submission),
        created_at: instant(submission.updatedAt, createdAt),
      },
      `${submission.id}:v${integer(submission.version)}`,
    ),
  );
  for (const [fieldKey, value] of Object.entries(
    object(submission.answers) ? submission.answers : {},
  ))
    add(
      context,
      source,
      row(
        "submission_answers",
        {
          organization_id: organizationId,
          submission_id: submission.id,
          field_key: fieldKey,
          value_json: json(value),
          asset_id: null,
        },
        `${submission.id}:answer:${fieldKey}`,
      ),
    );
  for (const [index, participant] of array(submission.participants).entries()) {
    const participantId = ensureParticipant(
      context,
      {
        ...participant,
        createdAt,
        updatedAt: submission.updatedAt,
        sourceType: "cfp",
        sourceId: submission.id,
      },
      organizationId,
      eventId,
      source,
    );
    add(
      context,
      source,
      row(
        "submission_participants",
        {
          organization_id: organizationId,
          event_id: eventId,
          submission_id: submission.id,
          participant_id: participantId,
          role: participant.role === "primary" ? "primary" : "co_speaker",
          biography: text(participant.biography) ?? "",
          answers_json: json(object(participant.answers) ? participant.answers : {}),
          ordinal: index,
        },
        `${submission.id}:participant:${participantId}`,
      ),
    );
  }
  for (const [index, contact] of array(submission.secondaryContacts).entries())
    add(
      context,
      source,
      row(
        "submission_secondary_contacts",
        {
          organization_id: organizationId,
          submission_id: submission.id,
          id: contact.id,
          name: contact.name,
          email: contact.email,
          ordinal: index,
        },
        `${submission.id}:contact:${contact.id}`,
      ),
    );
}

function transformProfile(context, source) {
  const profile = parse(source.fields, ["Biography"]);
  const { organizationId, eventId } = scope(profile, source.fields);
  ensureOrganization(context, organizationId, source);
  ensureParticipant(
    context,
    {
      id: profile.participantId,
      displayName: profile.displayName,
      email: profile.email,
      sourceType: profile.sourceType,
      sourceId: profile.sourceId,
      version: profile.version,
      updatedAt: profile.updatedAt,
    },
    organizationId,
    eventId,
    source,
  );
  const travel = object(profile.travelLogistics) ? profile.travelLogistics : {};
  const createdAt = instant(profile.createdAt, source.createdTime);
  add(
    context,
    source,
    row(
      "speaker_profiles",
      {
        id: profile.id,
        organization_id: organizationId,
        event_id: eventId,
        participant_id: profile.participantId,
        display_name: profile.displayName,
        email: text(profile.email) ?? null,
        job_title: text(profile.jobTitle) ?? "",
        company: text(profile.company) ?? "",
        status: text(profile.status) ?? "",
        biography: text(profile.biography) ?? "",
        social_links_json: json(object(profile.socialLinks) ? profile.socialLinks : {}),
        travel_required: boolean(travel.travelRequired),
        arrival_at: text(travel.arrivalAt) ?? null,
        departure_at: text(travel.departureAt) ?? null,
        accommodation: text(travel.accommodation) ?? "",
        dietary_requirements: text(travel.dietaryRequirements) ?? "",
        accessibility_needs: text(travel.accessibilityNeeds) ?? "",
        travel_notes: text(travel.travelNotes) ?? "",
        headshot_asset_id: null,
        source_type: ["cfp", "manual", "csv", "crm"].includes(profile.sourceType)
          ? profile.sourceType
          : null,
        source_id: text(profile.sourceId) ?? null,
        version: integer(profile.version),
        created_at: createdAt,
        updated_at: instant(profile.updatedAt, createdAt),
      },
      profile.id,
    ),
  );
}

function resolveTaxonomy(context, target, eventId, value) {
  if (!value) return null;
  return context.taxonomy.get(`${target}:${eventId}:${value}`) ?? value;
}

function transformSession(context, source) {
  const session = parse(source.fields, ["Metadata JSON"]);
  const { organizationId, eventId } = scope(session, source.fields);
  ensureOrganization(context, organizationId, source);
  ensureEventStatus(context, organizationId, eventId, session.status, source);
  const createdAt = instant(session.createdAt, source.createdTime);
  add(
    context,
    source,
    row(
      "sessions",
      {
        id: session.id,
        organization_id: organizationId,
        event_id: eventId,
        title: session.title,
        description: text(session.description) ?? "",
        status: session.status,
        content_status: session.contentStatus ?? null,
        duration_minutes: integer(session.durationMinutes, 30),
        capacity_required: Number.isSafeInteger(session.capacityRequired)
          ? session.capacityRequired
          : 0,
        room_id: resolveTaxonomy(context, "rooms", eventId, session.roomId),
        format_id: resolveTaxonomy(context, "formats", eventId, session.formatId),
        level_id: resolveTaxonomy(context, "levels", eventId, session.levelId),
        version: integer(session.version),
        created_at: createdAt,
        updated_at: instant(session.updatedAt, createdAt),
        created_by: text(session.createdBy, "system"),
        updated_by: text(session.updatedBy, session.createdBy, "system"),
        deleted_at: session.deletedAt ? instant(session.deletedAt) : null,
      },
      session.id,
    ),
  );
  for (const [index, trackId] of array(session.trackIds).entries())
    add(
      context,
      source,
      row(
        "session_tracks",
        {
          organization_id: organizationId,
          event_id: eventId,
          session_id: session.id,
          track_id: resolveTaxonomy(context, "tracks", eventId, trackId),
          ordinal: index,
        },
        `${session.id}:track:${trackId}`,
      ),
    );
  for (const [index, speaker] of array(session.speakerRoster).entries()) {
    ensureParticipant(
      context,
      { id: speaker.id, displayName: speaker.displayName },
      organizationId,
      eventId,
      source,
    );
    add(
      context,
      source,
      row(
        "session_speakers",
        {
          organization_id: organizationId,
          event_id: eventId,
          session_id: session.id,
          speaker_id: speaker.id,
          display_name: speaker.displayName ?? null,
          role: speaker.role ?? null,
          ordinal: index,
        },
        `${session.id}:speaker:${speaker.id}`,
      ),
    );
  }
  for (const [index, resourceId] of array(session.resourceIds).entries())
    add(
      context,
      source,
      row(
        "session_resources",
        {
          organization_id: organizationId,
          event_id: eventId,
          session_id: session.id,
          resource_id: resourceId,
          ordinal: index,
        },
        `${session.id}:resource:${resourceId}`,
      ),
    );
  for (const history of array(session.history))
    add(
      context,
      source,
      row(
        "session_history",
        {
          id: history.id,
          organization_id: organizationId,
          event_id: eventId,
          entity_type: "session",
          entity_id: session.id,
          action: history.action,
          version: integer(history.version),
          actor_id: history.actorId,
          actor_label: history.actorLabel ?? null,
          occurred_at: instant(history.occurredAt),
          prior_status: history.priorStatus ?? null,
          new_status: history.newStatus ?? null,
          prior_content_status: history.priorContentStatus ?? null,
          new_content_status: history.newContentStatus ?? history.contentStatus ?? null,
          snapshot_json: history.snapshot ? json(history.snapshot) : null,
        },
        history.id,
      ),
    );
}

function transformReviewPlan(context, source) {
  const plan = parse(source.fields, ["Rounds JSON"]);
  const { organizationId, eventId } = scope(plan, source.fields);
  ensureOrganization(context, organizationId, source);
  const createdAt = instant(plan.createdAt, source.createdTime);
  const rule = object(plan.assignmentRule) ? plan.assignmentRule : {};
  const projection = object(plan.reviewerProjection) ? plan.reviewerProjection : {};
  add(
    context,
    source,
    row(
      "review_plans",
      {
        id: plan.id,
        organization_id: organizationId,
        event_id: eventId,
        name: plan.name,
        status: plan.status,
        blind_review: boolean(plan.blindReview),
        closes_at: plan.closesAt ? instant(plan.closesAt) : null,
        reviews_per_submission: integer(rule.reviewsPerSubmission),
        max_assignments_per_reviewer: integer(rule.maxAssignmentsPerReviewer),
        track_filter: text(rule.trackFilter) ?? null,
        auto_distribute: boolean(rule.autoDistribute),
        reviewer_projection_field_ids_json: json(array(projection.fieldIds)),
        reviewer_projection_file_ids_json: json(array(projection.fileIds)),
        grading_revision: plan.gradingRevision ?? null,
        grading_locked_at: plan.gradingLockedAt ? instant(plan.gradingLockedAt) : null,
        version: integer(plan.version),
        created_at: createdAt,
        updated_at: instant(plan.updatedAt, createdAt),
      },
      plan.id,
    ),
  );
  for (const roundValue of array(plan.rounds)) {
    add(
      context,
      source,
      row(
        "review_rubrics",
        {
          id: roundValue.rubric.id,
          organization_id: organizationId,
          event_id: eventId,
          plan_id: plan.id,
          revision: integer(roundValue.rubricRevision),
          name: roundValue.rubric.name,
        },
        `${plan.id}:${roundValue.rubric.id}:v${roundValue.rubricRevision}`,
      ),
    );
    add(
      context,
      source,
      row(
        "review_rounds",
        {
          id: roundValue.id,
          organization_id: organizationId,
          event_id: eventId,
          plan_id: plan.id,
          name: roundValue.name,
          sequence: roundValue.sequence,
          revision: integer(roundValue.revision),
          rubric_id: roundValue.rubric.id,
          rubric_revision: integer(roundValue.rubricRevision),
          opens_at: roundValue.opensAt ? instant(roundValue.opensAt) : null,
          closes_at: roundValue.closesAt ? instant(roundValue.closesAt) : null,
          blind_review: boolean(roundValue.blindReview),
          anonymization: roundValue.anonymization,
          track_filter: text(roundValue.trackFilter) ?? null,
        },
        `${plan.id}:${roundValue.id}:v${roundValue.revision}`,
      ),
    );
    for (const [index, criterion] of array(roundValue.rubric.criteria).entries()) {
      add(
        context,
        source,
        row(
          "review_criteria",
          {
            organization_id: organizationId,
            event_id: eventId,
            plan_id: plan.id,
            rubric_id: roundValue.rubric.id,
            rubric_revision: integer(roundValue.rubricRevision),
            id: criterion.id,
            label: criterion.label,
            description: text(criterion.description) ?? "",
            minimum: criterion.minimum,
            maximum: criterion.maximum,
            weight: criterion.weight,
            required: boolean(criterion.required),
            input_type: criterion.inputType ?? "numeric",
            sort_order: index,
          },
          `${plan.id}:${roundValue.rubric.id}:${criterion.id}`,
        ),
      );
      for (const [optionIndex, option] of array(criterion.options).entries())
        add(
          context,
          source,
          row(
            "review_criterion_options",
            {
              organization_id: organizationId,
              event_id: eventId,
              plan_id: plan.id,
              rubric_id: roundValue.rubric.id,
              rubric_revision: integer(roundValue.rubricRevision),
              criterion_id: criterion.id,
              id: option.id,
              label: option.label,
              value: option.value,
              sort_order: optionIndex,
            },
            `${plan.id}:${criterion.id}:${option.id}`,
          ),
        );
    }
    if (object(roundValue.reviewerPool) && array(roundValue.reviewerPool.reviewerIds).length > 0) {
      const poolId = `reviewer-pool:${plan.id}:${roundValue.id}:v${roundValue.revision}`;
      add(
        context,
        source,
        row(
          "reviewer_pools",
          {
            id: poolId,
            organization_id: organizationId,
            event_id: eventId,
            round_id: roundValue.id,
            round_revision: integer(roundValue.revision),
            name: `${roundValue.name} reviewer pool`,
            version: 1,
            created_at: createdAt,
            updated_at: instant(plan.updatedAt, createdAt),
          },
          poolId,
        ),
      );
      for (const reviewerId of roundValue.reviewerPool.reviewerIds)
        add(
          context,
          source,
          row(
            "reviewer_pool_members",
            {
              organization_id: organizationId,
              event_id: eventId,
              pool_id: poolId,
              reviewer_id: reviewerId,
            },
            `${poolId}:${reviewerId}`,
          ),
        );
    }
  }
}

function transformDecision(context, source) {
  const decision = parse(source.fields, ["Metadata JSON"]);
  const { organizationId, eventId } = scope(decision, source.fields);
  ensureOrganization(context, organizationId, source);
  add(
    context,
    source,
    row(
      "evaluation_decisions",
      {
        id: decision.id,
        organization_id: organizationId,
        event_id: eventId,
        plan_id: decision.planId,
        submission_id: decision.submissionId,
        status: decision.status,
        version: integer(decision.version),
        updated_at: instant(decision.updatedAt, source.createdTime),
      },
      decision.id,
    ),
  );
  for (const [index, transition] of array(decision.history).entries())
    add(
      context,
      source,
      row(
        "evaluation_decision_transitions",
        {
          organization_id: organizationId,
          event_id: eventId,
          decision_id: decision.id,
          ordinal: index,
          from_status: transition.from ?? null,
          to_status: transition.to,
          reason: transition.reason,
          decided_by: transition.decidedBy,
          decided_at: instant(transition.decidedAt),
          idempotency_key: transition.idempotencyKey,
        },
        `${decision.id}:transition:${index}`,
      ),
    );
}

function agendaMetadata(entry, sessions, rooms, tracks) {
  const metadata = object(entry.metadata) ? entry.metadata : {};
  const session = sessions.get(entry.sessionId) ?? {};
  return {
    title: text(entry.title, metadata.title, session.title, entry.sessionId),
    summary: text(entry.summary, metadata.summary, session.summary) ?? "",
    format: text(entry.format, metadata.format, session.format, "Session"),
    speakerNames: array(entry.speakerNames).length
      ? entry.speakerNames
      : array(metadata.speakerNames).length
        ? metadata.speakerNames
        : array(session.speakerNames),
    roomName: text(entry.roomName, metadata.roomName, rooms.get(entry.roomId)?.name, entry.roomId),
    trackNames: array(entry.trackNames).length
      ? entry.trackNames
      : array(metadata.trackNames).length
        ? metadata.trackNames
        : array(entry.trackIds).map((id) => tracks.get(id)?.name ?? id),
  };
}

function transformAgenda(context, source) {
  const agenda = parse(source.fields, ["Conflicts JSON"]);
  const eventId = agenda.eventId;
  const organizationId = context.eventOrganizations.get(eventId) ?? DEFAULT_ORGANIZATION;
  ensureOrganization(context, organizationId, source);
  const sessions = new Map(array(agenda.sessions).map((value) => [value.id, value]));
  const rooms = new Map(array(agenda.rooms).map((value) => [value.id, value]));
  const tracks = new Map(array(agenda.tracks).map((value) => [value.id, value]));
  const createdAt = source.createdTime;
  for (const session of sessions.values())
    for (const participantId of array(session.participantIds)) {
      const displayName =
        array(session.speakerNames)[array(session.participantIds).indexOf(participantId)] ??
        participantId;
      ensureParticipant(
        context,
        { id: participantId, displayName },
        organizationId,
        eventId,
        source,
      );
    }
  add(
    context,
    source,
    row(
      "agenda_states",
      {
        organization_id: organizationId,
        event_id: eventId,
        state_version: integer(agenda.stateVersion),
        time_zone: text(agenda.timeZone, "UTC"),
        minimum_travel_minutes: Number.isSafeInteger(agenda.minimumTravelMinutes)
          ? agenda.minimumTravelMinutes
          : 0,
        current_published_revision_id: agenda.currentPublishedRevisionId ?? null,
        created_at: createdAt,
        updated_at: instant(agenda.draft?.updatedAt, createdAt),
      },
      eventId,
    ),
  );
  if (object(agenda.draft))
    add(
      context,
      source,
      row(
        "agenda_drafts",
        {
          organization_id: organizationId,
          event_id: eventId,
          version: integer(agenda.draft.version),
          time_zone: text(agenda.draft.timeZone, agenda.timeZone, "UTC"),
          updated_at: instant(agenda.draft.updatedAt, createdAt),
          updated_by: text(agenda.draft.updatedBy, "system"),
        },
        eventId,
      ),
    );
  for (const roomValue of rooms.values())
    if (!context.taxonomy.has(`rooms:${eventId}:${roomValue.id}`)) {
      add(
        context,
        source,
        row(
          "rooms",
          {
            id: roomValue.id,
            organization_id: organizationId,
            event_id: eventId,
            name: roomValue.name,
            capacity: Math.max(0, roomValue.capacity ?? 0),
            version: 1,
            created_at: createdAt,
            updated_at: createdAt,
            created_by: "agenda-import",
            updated_by: "agenda-import",
          },
          roomValue.id,
        ),
      );
      context.taxonomy.set(`rooms:${eventId}:${roomValue.id}`, roomValue.id);
    }
  for (const trackValue of tracks.values())
    if (!context.taxonomy.has(`tracks:${eventId}:${trackValue.id}`)) {
      add(
        context,
        source,
        row(
          "tracks",
          {
            id: trackValue.id,
            organization_id: organizationId,
            event_id: eventId,
            name: trackValue.name,
            description: "",
            version: 1,
            created_at: createdAt,
            updated_at: createdAt,
            created_by: "agenda-import",
            updated_by: "agenda-import",
          },
          trackValue.id,
        ),
      );
      context.taxonomy.set(`tracks:${eventId}:${trackValue.id}`, trackValue.id);
    }
  for (const session of sessions.values())
    if (!context.sessions.has(`${organizationId}:${eventId}:${session.id}`)) {
      ensureEventStatus(context, organizationId, eventId, session.status, source);
      add(
        context,
        source,
        row(
          "sessions",
          {
            id: session.id,
            organization_id: organizationId,
            event_id: eventId,
            title: session.title,
            description: text(session.summary) ?? "",
            status: session.status,
            content_status: null,
            duration_minutes: integer(session.durationMinutes, 30),
            capacity_required: Number.isSafeInteger(session.capacityRequired)
              ? session.capacityRequired
              : 0,
            room_id: null,
            format_id: null,
            level_id: null,
            version: 1,
            created_at: createdAt,
            updated_at: createdAt,
            created_by: "agenda-import",
            updated_by: "agenda-import",
            deleted_at: null,
          },
          session.id,
        ),
      );
    }
  const addEntries = (containerType, containerId, entries) => {
    for (const entry of array(entries)) {
      const metadata = agendaMetadata(entry, sessions, rooms, tracks);
      add(
        context,
        source,
        row(
          "agenda_entries",
          {
            id: entry.id,
            organization_id: organizationId,
            event_id: eventId,
            container_type: containerType,
            container_id: containerId,
            session_id: entry.sessionId,
            room_id: entry.roomId,
            starts_at: instant(entry.startsAt),
            ends_at: instant(entry.endsAt),
            starts_at_local: entry.startsAtLocal,
            ends_at_local: entry.endsAtLocal,
            time_zone: entry.timeZone,
            title: metadata.title,
            summary: metadata.summary,
            format: metadata.format,
            speaker_names_json: json(metadata.speakerNames),
            room_name: metadata.roomName,
            track_names_json: json(metadata.trackNames),
          },
          `${containerType}:${containerId}:${entry.id}`,
        ),
      );
      for (const [index, trackId] of array(entry.trackIds).entries())
        add(
          context,
          source,
          row(
            "agenda_entry_tracks",
            {
              organization_id: organizationId,
              event_id: eventId,
              container_type: containerType,
              container_id: containerId,
              entry_id: entry.id,
              track_id: trackId,
              ordinal: index,
            },
            `${containerType}:${containerId}:${entry.id}:${trackId}`,
          ),
        );
    }
  };
  addEntries("draft", eventId, agenda.draft?.entries);
  for (const revision of array(agenda.revisions)) {
    add(
      context,
      source,
      row(
        "agenda_revisions",
        {
          id: revision.id,
          organization_id: organizationId,
          event_id: eventId,
          revision_number: integer(revision.revisionNumber),
          source_draft_version: integer(revision.sourceDraftVersion),
          time_zone: revision.timeZone,
          published_at: instant(revision.publishedAt),
          published_by: revision.publishedBy,
          rollback_of_revision_id: revision.rollbackOfRevisionId ?? null,
          source_hash: sha256(canonicalJson(revision)),
        },
        revision.id,
      ),
    );
    addEntries("revision", revision.id, revision.entries);
  }
  for (const outbox of array(agenda.outbox))
    add(
      context,
      source,
      row(
        "agenda_outbox_events",
        {
          id: outbox.id,
          organization_id: organizationId,
          event_id: eventId,
          revision_id: outbox.revisionId,
          type: outbox.type,
          idempotency_key: outbox.idempotencyKey,
          created_at: instant(outbox.createdAt),
        },
        outbox.id,
      ),
    );
  for (const audit of array(agenda.audit))
    add(
      context,
      source,
      row(
        "audit_events",
        {
          id: audit.id,
          tenant_id: organizationId,
          actor_type: audit.actorId ? "user" : "system",
          actor_id: audit.actorId ?? null,
          action: audit.action,
          resource_type: "agenda",
          resource_id: eventId,
          trace_id: null,
          details_json: json(object(audit.details) ? audit.details : {}),
          occurred_at: instant(audit.createdAt),
        },
        audit.id,
      ),
    );
  if (array(agenda.suggestionRuns).length > 0 || array(agenda.draft?.warningOverrides).length > 0)
    throw new Error(
      "Agenda suggestion runs or warning overrides require additional lossless decomposition.",
    );
}

function transformContact(context, source) {
  const contact = parse(source.fields, ["Contact JSON"]);
  const organizationId = text(contact.organizationId, contact.tenantId, DEFAULT_ORGANIZATION);
  ensureOrganization(context, organizationId, source);
  add(
    context,
    source,
    row(
      "crm_contacts",
      {
        id: contact.id,
        organization_id: organizationId,
        first_name: contact.firstName ?? null,
        last_name: contact.lastName ?? null,
        display_name: contact.displayName,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        company: contact.company ?? null,
        title: contact.title ?? null,
        website: contact.website ?? null,
        linkedin_url: contact.linkedinUrl ?? null,
        notes: contact.notes ?? null,
        custom_fields_json: json(object(contact.customFields) ? contact.customFields : {}),
        source: ["manual", "csv", "speaker", "import"].includes(contact.source)
          ? contact.source
          : "import",
        status: contact.status,
        merged_into_id: contact.mergedIntoId ?? null,
        merge_audit_id: contact.mergeAuditId ?? null,
        merged_at: contact.mergedAt ? instant(contact.mergedAt) : null,
        merge_source_ids_json: json(array(contact.mergeSourceIds)),
        pipeline_stage: contact.pipelineStage,
        version: integer(contact.version),
        created_at: instant(contact.createdAt, source.createdTime),
        updated_at: instant(contact.updatedAt, source.createdTime),
      },
      contact.id,
    ),
  );
  for (const tag of array(contact.tags))
    add(
      context,
      source,
      row(
        "crm_contact_tags",
        { organization_id: organizationId, contact_id: contact.id, tag },
        `${contact.id}:tag:${tag}`,
      ),
    );
}

const TRANSFORMERS = {
  Organizations: transformOrganization,
  Events: transformEvent,
  "CFP Forms": transformForm,
  Submissions: transformSubmission,
  "Speaker Profiles": transformProfile,
  Sessions: transformSession,
  "Agenda Versions": transformAgenda,
  Rooms: (c, s) => transformTaxonomy(c, s, "rooms"),
  Tracks: (c, s) => transformTaxonomy(c, s, "tracks"),
  Formats: (c, s) => transformTaxonomy(c, s, "formats"),
  "Review Plans": transformReviewPlan,
  Decisions: transformDecision,
  "CRM Contacts": transformContact,
};

const ORDER = [
  "organizations",
  "events",
  "event_embed_configurations",
  "rooms",
  "tracks",
  "formats",
  "levels",
  "tags",
  "session_statuses",
  "session_settings",
  "cfp_forms",
  "cfp_form_sections",
  "cfp_form_fields",
  "cfp_form_rules",
  "submissions",
  "submission_versions",
  "submission_answers",
  "participants",
  "submission_participants",
  "submission_secondary_contacts",
  "speaker_profiles",
  "sessions",
  "session_tracks",
  "session_speakers",
  "session_resources",
  "session_history",
  "review_plans",
  "review_rubrics",
  "review_rounds",
  "review_criteria",
  "review_criterion_options",
  "reviewer_pools",
  "reviewer_pool_members",
  "evaluation_decisions",
  "evaluation_decision_transitions",
  "agenda_states",
  "agenda_drafts",
  "agenda_revisions",
  "agenda_entries",
  "agenda_entry_tracks",
  "agenda_outbox_events",
  "audit_events",
  "crm_contacts",
  "crm_contact_tags",
  "airtable_connections",
  "airtable_record_mappings",
];
const order = new Map(ORDER.map((table, index) => [table, index]));

export function createDomainImportPlan(manifest) {
  const context = {
    operations: [],
    quarantine: [],
    organizations: new Set(),
    participants: new Set(),
    sessionStatuses: new Set(),
    taxonomy: new Map(),
    sessions: new Set(),
    eventOrganizations: new Map(),
  };
  const tables = manifest.tables.map((table) => ({
    ...table,
    records: table.records.map((record) => sourceRecord(table, record)),
  }));
  for (const table of tables)
    if (table.name === "Events")
      for (const source of table.records) {
        try {
          const payload = parse(source.fields, ["Settings JSON"]);
          context.eventOrganizations.set(
            text(payload.id, source.applicationId),
            scope(payload, source.fields).organizationId,
          );
        } catch {}
      }
  const tableOrder = [
    "Organizations",
    "Events",
    "Rooms",
    "Tracks",
    "Formats",
    "CFP Forms",
    "Submissions",
    "Speaker Profiles",
    "Sessions",
    "Review Plans",
    "Decisions",
    "Agenda Versions",
    "CRM Contacts",
  ];
  for (const name of tableOrder) {
    const table = tables.find((candidate) => candidate.name === name);
    if (!table) continue;
    for (const source of table.records) {
      try {
        TRANSFORMERS[name](context, source);
      } catch (error) {
        quarantine(
          context,
          source,
          `DOMAIN_TRANSFORM_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  const baseId = manifest.base?.id;
  for (const table of tables)
    for (const source of table.records) {
      const organizationId = (() => {
        try {
          const payload = parse(source.fields, [
            "Settings JSON",
            "Fields JSON",
            "Answers JSON",
            "Biography",
            "Metadata JSON",
            "Rounds JSON",
            "Contact JSON",
            "Conflicts JSON",
          ]);
          return scope(payload, source.fields).organizationId;
        } catch {
          return DEFAULT_ORGANIZATION;
        }
      })();
      ensureOrganization(context, organizationId, source);
      if (baseId && source.recordId) {
        const mappingId = `airtable-mapping:${sha256(`${baseId}:${source.tableId}:${source.recordId}`).slice(0, 32)}`;
        add(
          context,
          source,
          row(
            "airtable_record_mappings",
            {
              id: mappingId,
              organization_id: organizationId,
              connection_id: `airtable-import:${baseId}`,
              entity_type: source.tableName,
              application_id: source.applicationId,
              table_id: source.tableId,
              record_id: source.recordId,
              last_exported_version: null,
              last_exported_hash: null,
              last_observed_hash: source.rawHash,
              last_exported_at: null,
              mapping_version: 1,
              created_at: source.createdTime,
              updated_at: source.createdTime,
            },
            mappingId,
          ),
        );
      }
    }
  if (baseId) {
    const source = tables.flatMap((table) => table.records)[0];
    if (source)
      add(
        context,
        source,
        row(
          "airtable_connections",
          {
            id: `airtable-import:${baseId}`,
            organization_id: DEFAULT_ORGANIZATION,
            status: "disconnected",
            auth_mode: "pat",
            credential_reference: null,
            airtable_user_id: null,
            airtable_account_id: null,
            base_id: baseId,
            base_name: null,
            granted_scopes_json: "[]",
            access_token_expires_at: null,
            refresh_token_expires_at: null,
            connection_version: 1,
            refresh_owner: null,
            refresh_token: null,
            refresh_lease_expires_at: null,
            last_schema_check_at: null,
            last_success_at: null,
            last_error_code: null,
            last_error: null,
            created_at: source.createdTime,
            updated_at: source.createdTime,
            disconnected_at: source.createdTime,
          },
          `airtable-import:${baseId}`,
        ),
      );
  }
  const deduped = new Map();
  for (const operation of context.operations) {
    const key = `${operation.table}:${operation.id}`;
    if (!deduped.has(key)) deduped.set(key, operation);
  }
  const operations = [...deduped.values()]
    .sort(
      (left, right) =>
        (order.get(left.table) ?? 999) - (order.get(right.table) ?? 999) ||
        (left.table === "crm_contacts"
          ? Number(left.row.status === "merged") - Number(right.row.status === "merged")
          : 0) ||
        `${left.table}:${left.id}`.localeCompare(`${right.table}:${right.id}`, "en"),
    )
    .map((operation) => ({
      sourceKey: `${operation.source.tableId}:${operation.source.applicationId}`,
      targetTable: operation.table,
      targetId: operation.id,
      sourceHash: operation.source.rawHash,
      row: operation.row,
    }));
  return {
    format: "open-sessionboard.d1-import-plan",
    version: 1,
    sourceManifestHash: sha256(canonicalJson(manifest)),
    operations,
    quarantine: context.quarantine,
  };
}
