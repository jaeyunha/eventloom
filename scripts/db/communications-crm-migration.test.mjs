import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const migrationsDirectory = resolve("apps/api/migrations");
const wranglerPath = resolve("apps/api/node_modules/.bin/wrangler");
const senderMigrationName = "0020_self_hostable_communication_senders.sql";
const communicationIndexes = [
  "communication_templates_scope_uidx",
  "communication_templates_lookup_idx",
  "communication_previews_scope_uidx",
  "communication_previews_expiry_idx",
  "communication_preview_recipients_ordinal_uidx",
  "communication_recipients_scope_uidx",
  "communication_recipients_email_idx",
  "communication_recipients_participant_idx",
  "communication_recipient_audiences_reverse_idx",
  "communication_sends_idempotency_uidx",
  "communication_sends_status_idx",
  "communication_send_recipients_email_idx",
  "communication_deliveries_provider_uidx",
  "communication_delivery_history_id_uidx",
];

function sqlite(databasePath, sql) {
  const result = spawnSync("sqlite3", [databasePath], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function rejectsSql(databasePath, sql) {
  const result = spawnSync("sqlite3", [databasePath], { encoding: "utf8", input: sql });
  assert.notEqual(result.status, 0, "expected SQLite to reject invalid sender data");
}

function migration(name) {
  return readFileSync(join(migrationsDirectory, name), "utf8");
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function insertTemplate(id, sender) {
  return `INSERT INTO communication_templates
    (id, organization_id, event_id, version, name, purpose, status, sender, subject, html, text,
     variables_json, created_by, created_at, updated_at, approved_by, approved_at)
    VALUES (${sqlLiteral(id)}, 'org-1', 'event-1', 1, 'Template', 'receipt', 'draft', ${sqlLiteral(sender)},
      'Subject', '<p>Body</p>', 'Body', '[]', 'user-1', '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z', NULL, NULL);`;
}

function insertSend(id, templateId, sender, previewId = null) {
  return `INSERT INTO communication_sends
    (id, organization_id, event_id, purpose, audience, template_id, template_version,
     idempotency_key, preview_id, data_json, status, recipient_count, queued_count,
     delivered_count, failed_count, terminal, template_name, template_purpose, template_sender,
     template_subject, template_html, template_text, created_by, created_at, updated_at)
    VALUES (${sqlLiteral(id)}, 'org-1', 'event-1', 'receipt', 'all_participants', ${sqlLiteral(templateId)}, 1,
      ${sqlLiteral(`${id}-key`)}, ${previewId === null ? "NULL" : sqlLiteral(previewId)}, '{}', 'queued',
      1, 1, 0, 0, 0, 'Template', 'receipt', ${sqlLiteral(sender)}, 'Subject', '<p>Body</p>',
      'Body', 'user-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`;
}

function populatedCommunicationGraph() {
  return `
    ${insertTemplate("legacy-template", "speakers@sessionboard.namuh.co")}
    INSERT INTO communication_recipients
      (id, organization_id, event_id, participant_id, email, display_name, data_json, updated_at)
    VALUES
      ('recipient-1', 'org-1', 'event-1', 'participant-1', 'person@example.com', 'Person', '{}',
       '2026-01-01T00:00:00.000Z');
    INSERT INTO communication_recipient_audiences
      (organization_id, event_id, recipient_id, audience)
    VALUES ('org-1', 'event-1', 'recipient-1', 'all_participants');
    INSERT INTO communication_previews
      (id, organization_id, event_id, purpose, template_id, template_version, audience,
       render_data_json, recipient_count, subject, html, text, created_by, created_at, expires_at)
    VALUES
      ('preview-1', 'org-1', 'event-1', 'receipt', 'legacy-template', 1, 'all_participants',
       '{}', 1, 'Subject', '<p>Body</p>', 'Body', 'user-1', '2026-01-01T00:00:00.000Z',
       '2026-01-02T00:00:00.000Z');
    INSERT INTO communication_preview_recipients
      (preview_id, recipient_id, ordinal, participant_id, email, display_name, audiences_json,
       data_json, subject, html, text)
    VALUES
      ('preview-1', 'recipient-1', 0, 'participant-1', 'person@example.com', 'Person', '[]',
       '{}', 'Subject', '<p>Body</p>', 'Body');
    ${insertSend("legacy-send", "legacy-template", "speakers@sessionboard.namuh.co", "preview-1")}
    INSERT INTO communication_send_recipients
      (send_id, recipient_id, participant_id, email, display_name, audiences_json, data_json)
    VALUES
      ('legacy-send', 'recipient-1', 'participant-1', 'person@example.com', 'Person', '[]', '{}');
    INSERT INTO communication_deliveries
      (send_id, recipient_id, status, provider_message_id, failure_reason, attempts)
    VALUES ('legacy-send', 'recipient-1', 'queued', 'provider-message-1', NULL, 1);
    INSERT INTO communication_delivery_history
      (send_id, recipient_id, ordinal, id, status, occurred_at, provider_message_id, reason, actor_id)
    VALUES
      ('legacy-send', 'recipient-1', 0, 'history-1', 'queued', '2026-01-01T00:00:00.000Z',
       'provider-message-1', NULL, 'user-1');
  `;
}

function assertPopulatedGraph(databasePath) {
  assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  assert.equal(
    sqlite(
      databasePath,
      `SELECT
        (SELECT count(*) FROM communication_templates),
        (SELECT count(*) FROM communication_recipients),
        (SELECT count(*) FROM communication_recipient_audiences),
        (SELECT count(*) FROM communication_previews),
        (SELECT count(*) FROM communication_preview_recipients),
        (SELECT count(*) FROM communication_sends),
        (SELECT count(*) FROM communication_send_recipients),
        (SELECT count(*) FROM communication_deliveries),
        (SELECT count(*) FROM communication_delivery_history);`,
    ),
    "1|1|1|1|1|1|1|1|1",
  );
  assert.equal(
    sqlite(
      databasePath,
      "SELECT sender || '|' || template_sender FROM communication_templates JOIN communication_sends USING (organization_id, event_id);",
    ),
    "speakers@sessionboard.namuh.co|speakers@sessionboard.namuh.co",
  );
  assert.deepEqual(
    sqlite(
      databasePath,
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (${communicationIndexes
        .map(sqlLiteral)
        .join(", ")}) ORDER BY name;`,
    ).split("\n"),
    [...communicationIndexes].sort(),
  );
  assert.equal(
    sqlite(
      databasePath,
      `SELECT
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_recipient_audiences')) +
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_previews')) +
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_preview_recipients')) +
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_sends')) +
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_send_recipients')) +
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_deliveries')) +
        (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_delivery_history'));`,
    ),
    "8",
  );
}

function runWrangler(args) {
  const result = spawnSync(wranglerPath, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000,
  });
  assert.equal(
    result.status,
    0,
    `wrangler ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout;
}

function createWranglerProject(directory, includeSenderMigration) {
  const projectDirectory = join(directory, "project");
  const projectMigrations = join(projectDirectory, "migrations");
  mkdirSync(projectMigrations, { recursive: true });
  writeFileSync(
    join(projectDirectory, "worker.js"),
    "export default { fetch: () => new Response('ok') };\n",
  );
  writeFileSync(
    join(projectDirectory, "wrangler.toml"),
    `name = "sender-migration-regression"\nmain = "worker.js"\ncompatibility_date = "2026-08-08"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "sender-migration-regression"\ndatabase_id = "00000000-0000-0000-0000-000000000020"\nmigrations_dir = "migrations"\n`,
  );

  for (const name of readdirSync(migrationsDirectory).filter((entry) => entry.endsWith(".sql"))) {
    if (!includeSenderMigration && name === senderMigrationName) continue;
    copyFileSync(join(migrationsDirectory, name), join(projectMigrations, name));
  }

  return {
    configPath: join(projectDirectory, "wrangler.toml"),
    migrationsPath: projectMigrations,
    statePath: join(directory, "wrangler-state"),
  };
}

function wranglerArgs(project, ...args) {
  return [
    "d1",
    ...args,
    "sender-migration-regression",
    "--local",
    "--config",
    project.configPath,
    "--persist-to",
    project.statePath,
  ];
}

function wranglerQuery(project, sql) {
  const output = runWrangler([...wranglerArgs(project, "execute"), "--command", sql, "--json"]);
  const batches = JSON.parse(output);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].success, true);
  return batches[0].results;
}

const validSenders = [
  "mail@conference.example",
  "alerts@subdomain.example.org",
  "first.last+tag@example.co.uk",
  "operator_2@events-2026.example",
  "o'hara@example.com",
];

const invalidSenders = [
  "",
  "not-an-email",
  " sender@example.com ",
  ".sender@example.com",
  "sender.@example.com",
  "send..er@example.com",
  "sender@example.com.",
  "sender@example..com",
  "sender@-example.com",
  "sender@example-.com",
  "sender@exa_mple.com",
  "sender@exam!ple.com",
  "sender@example.c",
  "sender@example.c1om",
  "sender@127.0.0.1",
  "sender@example.com/path",
  "sender@@example.com",
];

test("sender migration preserves the populated communication graph, indexes, and foreign keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "eventloom-sender-migration-"));
  const databasePath = join(directory, "database.sqlite");

  try {
    sqlite(databasePath, migration("0011_content_communications_crm.sql"));
    sqlite(databasePath, `PRAGMA foreign_keys = ON; ${populatedCommunicationGraph()}`);
    sqlite(databasePath, `PRAGMA foreign_keys = ON; ${migration(senderMigrationName)}`);
    assertPopulatedGraph(databasePath);

    for (const [index, sender] of validSenders.entries()) {
      sqlite(
        databasePath,
        `${insertTemplate(`valid-template-${index}`, sender)}
         ${insertSend(`valid-send-${index}`, `valid-template-${index}`, sender)}`,
      );
    }

    for (const [index, sender] of invalidSenders.entries()) {
      rejectsSql(databasePath, insertTemplate(`invalid-template-${index}`, sender));
      rejectsSql(databasePath, insertSend(`invalid-send-${index}`, "legacy-template", sender));
    }
    assert.equal(sqlite(databasePath, "PRAGMA foreign_key_check;"), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("full migration chain applies to a fresh Wrangler local D1 database", () => {
  const directory = mkdtempSync(join(tmpdir(), "eventloom-sender-d1-fresh-"));

  try {
    const project = createWranglerProject(directory, true);
    runWrangler(wranglerArgs(project, "migrations", "apply"));
    assert.deepEqual(wranglerQuery(project, "PRAGMA foreign_key_check;"), []);
    assert.deepEqual(
      wranglerQuery(project, "SELECT count(*) AS count FROM communication_templates;"),
      [{ count: 0 }],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("populated Wrangler local D1 upgrades through the sender migration without disabling foreign keys", () => {
  const directory = mkdtempSync(join(tmpdir(), "eventloom-sender-d1-upgrade-"));

  try {
    const project = createWranglerProject(directory, false);
    runWrangler(wranglerArgs(project, "migrations", "apply"));

    const seedPath = join(directory, "seed.sql");
    writeFileSync(seedPath, populatedCommunicationGraph());
    runWrangler([...wranglerArgs(project, "execute"), "--file", seedPath]);

    copyFileSync(
      join(migrationsDirectory, senderMigrationName),
      join(project.migrationsPath, senderMigrationName),
    );
    runWrangler(wranglerArgs(project, "migrations", "apply"));

    assert.deepEqual(wranglerQuery(project, "PRAGMA foreign_key_check;"), []);
    assert.deepEqual(
      wranglerQuery(
        project,
        `SELECT
          (SELECT count(*) FROM communication_templates) AS templates,
          (SELECT count(*) FROM communication_recipients) AS recipients,
          (SELECT count(*) FROM communication_recipient_audiences) AS recipient_audiences,
          (SELECT count(*) FROM communication_previews) AS previews,
          (SELECT count(*) FROM communication_preview_recipients) AS preview_recipients,
          (SELECT count(*) FROM communication_sends) AS sends,
          (SELECT count(*) FROM communication_send_recipients) AS send_recipients,
          (SELECT count(*) FROM communication_deliveries) AS deliveries,
          (SELECT count(*) FROM communication_delivery_history) AS history;`,
      ),
      [
        {
          templates: 1,
          recipients: 1,
          recipient_audiences: 1,
          previews: 1,
          preview_recipients: 1,
          sends: 1,
          send_recipients: 1,
          deliveries: 1,
          history: 1,
        },
      ],
    );
    assert.deepEqual(
      wranglerQuery(
        project,
        "SELECT sender, template_sender FROM communication_templates JOIN communication_sends USING (organization_id, event_id);",
      ),
      [
        {
          sender: "speakers@sessionboard.namuh.co",
          template_sender: "speakers@sessionboard.namuh.co",
        },
      ],
    );
    assert.deepEqual(
      wranglerQuery(
        project,
        `SELECT count(*) AS count FROM sqlite_master WHERE type = 'index' AND name IN (${communicationIndexes
          .map(sqlLiteral)
          .join(", ")});`,
      ),
      [{ count: communicationIndexes.length }],
    );
    assert.deepEqual(
      wranglerQuery(
        project,
        `SELECT
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_recipient_audiences')) +
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_previews')) +
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_preview_recipients')) +
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_sends')) +
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_send_recipients')) +
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_deliveries')) +
          (SELECT count(DISTINCT id) FROM pragma_foreign_key_list('communication_delivery_history')) AS count;`,
      ),
      [{ count: 8 }],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
