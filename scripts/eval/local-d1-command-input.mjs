const LOCAL_ENVIRONMENT = "local";

export function createCommandInputNormalizer({ fail, requiredString }) {
  function commandObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("COMMAND_INVALID", "A D1 command is required.");
    }
    return value;
  }

  function assertLocal(command) {
    const target = command.environment ?? command.targetEnvironment;
    if (target === undefined) return;
    if (typeof target !== "string" || target.trim().toLowerCase() !== LOCAL_ENVIRONMENT) {
      fail("LOCAL_ONLY", "This D1 command adapter rejects non-local command targets.");
    }
  }

  function command(value) {
    const input = commandObject(value);
    assertLocal(input);
    return input;
  }

  function methodCommand(value, type) {
    const input = command(value);
    if (input.type !== undefined && input.type !== type) {
      fail("COMMAND_INVALID", "The D1 command type does not match the adapter method.");
    }
    return { ...input, type };
  }

  function idempotencyKey(command) {
    const organizationId = requiredString(command.organizationId, "Organization ID");
    const userId = requiredString(command.userId, "User ID");
    switch (command.type) {
      case "membership":
        return `eval-persona:${organizationId}:membership:${userId}`;
      case "speaker-grant":
        return `eval-persona:${organizationId}:${requiredString(command.eventId, "Event ID")}:speaker-grant:${userId}`;
      case "account-verification":
        return `eval-persona:${organizationId}:verification:${userId}`;
      default:
        fail("COMMAND_UNSUPPORTED", "The local D1 command type is unsupported.");
    }
  }

  function provisioningCommand(value, type) {
    const input = methodCommand(value, type);
    return input.idempotencyKey === undefined
      ? { ...input, idempotencyKey: idempotencyKey(input) }
      : input;
  }

  return Object.freeze({ command, methodCommand, provisioningCommand });
}
