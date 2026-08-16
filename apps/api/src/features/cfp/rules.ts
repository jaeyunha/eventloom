import type {
  CfpForm,
  ConditionGroup,
  ConditionPredicate,
  FormField,
  FormRuleAction,
  RoutingTarget,
  SubmissionParticipant,
} from "./model";
import { cfpFormSchema } from "./model";

export interface FormValidationIssue {
  path: string;
  code:
    | "duplicate"
    | "invalid_reference"
    | "invalid_options"
    | "missing_builtin"
    | "rule_cycle"
    | "schema";
  message: string;
}

export interface EvaluatedFormState {
  fields: Record<string, { visible: boolean; required: boolean; skipped: boolean }>;
  sections: Record<string, { visible: boolean; skipped: boolean }>;
  routes: RoutingTarget[];
  matchedRuleIds: string[];
}

export interface AnswerValidationIssue {
  path: string;
  code: "required" | "invalid_type" | "invalid_option";
  message: string;
}

function collectPredicates(condition: ConditionGroup): ConditionPredicate[] {
  const predicates: ConditionPredicate[] = [];
  for (const child of condition.conditions) {
    if (child.type === "predicate") {
      predicates.push(child);
    } else {
      predicates.push(...collectPredicates(child));
    }
  }
  return predicates;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function actionTarget(action: FormRuleAction): string | undefined {
  switch (action.type) {
    case "show_field":
    case "hide_field":
    case "require_field":
    case "skip_field":
      return `field:${action.fieldKey}`;
    case "show_section":
    case "hide_section":
    case "skip_section":
      return `section:${action.sectionId}`;
    case "route":
      return undefined;
  }
}

function findCycle(graph: Map<string, Set<string>>): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];

  const visit = (node: string): string[] | undefined => {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      return [...path.slice(cycleStart), node];
    }
    if (visited.has(node)) {
      return undefined;
    }

    visiting.add(node);
    path.push(node);
    for (const target of graph.get(node) ?? []) {
      const cycle = visit(target);
      if (cycle) {
        return cycle;
      }
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return undefined;
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) {
      return cycle;
    }
  }
  return undefined;
}

export function validateCfpForm(
  input: unknown,
): { success: true; form: CfpForm } | { success: false; issues: FormValidationIssue[] } {
  const parsed = cfpFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: "schema" as const,
        message: issue.message,
      })),
    };
  }

  const form = parsed.data;
  const issues: FormValidationIssue[] = [];
  const fields = [...form.submissionFields, ...form.participantFields];
  const fieldKeys = new Set(fields.map((field) => field.key));
  const sectionIds = new Set(form.sections.map((section) => section.id));

  for (const duplicate of duplicateValues(form.sections.map((section) => section.id))) {
    issues.push({
      path: "sections",
      code: "duplicate",
      message: `Section id '${duplicate}' is duplicated.`,
    });
  }
  for (const duplicate of duplicateValues(fields.map((field) => field.id))) {
    issues.push({
      path: "fields",
      code: "duplicate",
      message: `Field id '${duplicate}' is duplicated.`,
    });
  }
  for (const duplicate of duplicateValues(fields.map((field) => field.key))) {
    issues.push({
      path: "fields",
      code: "duplicate",
      message: `Field key '${duplicate}' is duplicated.`,
    });
  }
  for (const duplicate of duplicateValues(form.rules.map((rule) => rule.id))) {
    issues.push({
      path: "rules",
      code: "duplicate",
      message: `Rule id '${duplicate}' is duplicated.`,
    });
  }

  for (const field of fields) {
    if (!sectionIds.has(field.sectionId)) {
      issues.push({
        path: `fields.${field.key}.sectionId`,
        code: "invalid_reference",
        message: `Field '${field.key}' references an unknown section.`,
      });
    }
    const needsOptions = field.kind === "select" || field.kind === "multi_select";
    if (needsOptions && field.options.length === 0) {
      issues.push({
        path: `fields.${field.key}.options`,
        code: "invalid_options",
        message: `Field '${field.key}' requires at least one option.`,
      });
    }
  }

  const builtins = new Map(form.participantFields.map((field) => [field.key, field]));
  const requiredBuiltins: Array<[string, FormField["kind"]]> = [
    ["firstName", "text"],
    ["lastName", "text"],
    ["email", "email"],
  ];
  for (const [key, kind] of requiredBuiltins) {
    const field = builtins.get(key);
    if (!field || field.kind !== kind || !field.required) {
      issues.push({
        path: "participantFields",
        code: "missing_builtin",
        message: `Required participant field '${key}' must use kind '${kind}'.`,
      });
    }
  }

  const graph = new Map<string, Set<string>>();
  for (const rule of form.rules) {
    const predicates = collectPredicates(rule.when);
    for (const predicate of predicates) {
      if (!fieldKeys.has(predicate.fieldKey)) {
        issues.push({
          path: `rules.${rule.id}.when`,
          code: "invalid_reference",
          message: `Rule '${rule.id}' references unknown field '${predicate.fieldKey}'.`,
        });
      }
    }

    for (const action of rule.actions) {
      const target = actionTarget(action);
      if (target?.startsWith("field:") && !fieldKeys.has(target.slice("field:".length))) {
        issues.push({
          path: `rules.${rule.id}.actions`,
          code: "invalid_reference",
          message: `Rule '${rule.id}' targets an unknown field.`,
        });
      }
      if (target?.startsWith("section:") && !sectionIds.has(target.slice("section:".length))) {
        issues.push({
          path: `rules.${rule.id}.actions`,
          code: "invalid_reference",
          message: `Rule '${rule.id}' targets an unknown section.`,
        });
      }
      if (!target) {
        continue;
      }
      for (const predicate of predicates) {
        const source = `field:${predicate.fieldKey}`;
        const targets = graph.get(source) ?? new Set<string>();
        targets.add(target);
        graph.set(source, targets);
      }
    }
  }

  const cycle = findCycle(graph);
  if (cycle) {
    issues.push({
      path: "rules",
      code: "rule_cycle",
      message: `Conditional rules form a cycle: ${cycle.join(" -> ")}.`,
    });
  }

  return issues.length === 0 ? { success: true, form } : { success: false, issues };
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function evaluatePredicate(
  predicate: ConditionPredicate,
  answers: Record<string, unknown>,
): boolean {
  const actual = answers[predicate.fieldKey];
  const expected = predicate.value;

  switch (predicate.operator) {
    case "equals":
      return Object.is(actual, expected);
    case "not_equals":
      return !Object.is(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((value) => Object.is(value, actual));
    case "not_in":
      return !Array.isArray(expected) || !expected.some((value) => Object.is(value, actual));
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      return Array.isArray(actual) && actual.some((value) => Object.is(value, expected));
    case "is_empty":
      return isEmpty(actual);
    case "is_not_empty":
      return !isEmpty(actual);
  }
}

export function evaluateCondition(
  condition: ConditionGroup,
  answers: Record<string, unknown>,
): boolean {
  const results = condition.conditions.map((child) =>
    child.type === "predicate"
      ? evaluatePredicate(child, answers)
      : evaluateCondition(child, answers),
  );
  return condition.operator === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function evaluateFormRules(
  form: CfpForm,
  answers: Record<string, unknown>,
): EvaluatedFormState {
  const fields: EvaluatedFormState["fields"] = {};
  const sections: EvaluatedFormState["sections"] = {};
  for (const field of [...form.submissionFields, ...form.participantFields]) {
    fields[field.key] = { visible: true, required: field.required, skipped: false };
  }
  for (const section of form.sections) {
    sections[section.id] = { visible: true, skipped: false };
  }

  const routes: RoutingTarget[] = [];
  const matchedRuleIds: string[] = [];
  const rules = [...form.rules].sort((left, right) => left.priority - right.priority);
  for (const rule of rules) {
    if (!evaluateCondition(rule.when, answers)) {
      continue;
    }
    matchedRuleIds.push(rule.id);
    for (const action of rule.actions) {
      switch (action.type) {
        case "show_field": {
          const field = fields[action.fieldKey];
          if (field) {
            field.visible = true;
            field.skipped = false;
          }
          break;
        }
        case "hide_field": {
          const field = fields[action.fieldKey];
          if (field) {
            field.visible = false;
          }
          break;
        }
        case "require_field": {
          const field = fields[action.fieldKey];
          if (field) {
            field.required = true;
          }
          break;
        }
        case "skip_field": {
          const field = fields[action.fieldKey];
          if (field) {
            field.visible = false;
            field.skipped = true;
          }
          break;
        }
        case "show_section":
          sections[action.sectionId] = { visible: true, skipped: false };
          break;
        case "hide_section": {
          const section = sections[action.sectionId];
          if (section) {
            section.visible = false;
          }
          break;
        }
        case "skip_section":
          sections[action.sectionId] = { visible: false, skipped: true };
          break;
        case "route":
          routes.push({
            queue: action.queue,
            ...(action.format ? { format: action.format } : {}),
            ...(action.track ? { track: action.track } : {}),
            ...(action.category ? { category: action.category } : {}),
            tags: action.tags,
          });
          break;
      }
    }
  }
  return { fields, sections, routes, matchedRuleIds };
}

function validateFieldValue(field: FormField, value: unknown): AnswerValidationIssue | undefined {
  if (isEmpty(value)) {
    return undefined;
  }
  const path = `answers.${field.key}`;
  switch (field.kind) {
    case "text":
    case "rich_text":
      return typeof value === "string"
        ? undefined
        : { path, code: "invalid_type", message: `${field.label} must be text.` };
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? undefined
        : { path, code: "invalid_type", message: `${field.label} must be a valid email.` };
    case "url": {
      if (typeof value !== "string") {
        return {
          path,
          code: "invalid_type",
          message: `${field.label} must be a valid HTTP or HTTPS URL.`,
        };
      }
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:"
          ? undefined
          : {
              path,
              code: "invalid_type",
              message: `${field.label} must be a valid HTTP or HTTPS URL.`,
            };
      } catch {
        return {
          path,
          code: "invalid_type",
          message: `${field.label} must be a valid HTTP or HTTPS URL.`,
        };
      }
    }
    case "boolean":
      return typeof value === "boolean"
        ? undefined
        : { path, code: "invalid_type", message: `${field.label} must be true or false.` };
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? undefined
        : { path, code: "invalid_type", message: `${field.label} must be a number.` };
    case "select":
      return typeof value === "string" && field.options.includes(value)
        ? undefined
        : { path, code: "invalid_option", message: `${field.label} has an invalid option.` };
    case "multi_select":
      return Array.isArray(value) &&
        value.every((option) => typeof option === "string" && field.options.includes(option))
        ? undefined
        : { path, code: "invalid_option", message: `${field.label} has invalid options.` };
  }
}

function validateFieldSet(
  fields: FormField[],
  form: CfpForm,
  answers: Record<string, unknown>,
  pathPrefix: string,
): AnswerValidationIssue[] {
  const state = evaluateFormRules(form, answers);
  const issues: AnswerValidationIssue[] = [];
  for (const field of fields) {
    const fieldState = state.fields[field.key];
    const sectionState = state.sections[field.sectionId];
    if (!fieldState || !sectionState) {
      continue;
    }
    if (
      fieldState.skipped ||
      !fieldState.visible ||
      !sectionState.visible ||
      sectionState.skipped
    ) {
      continue;
    }
    const value = answers[field.key];
    if (fieldState.required && isEmpty(value)) {
      issues.push({
        path: `${pathPrefix}.${field.key}`,
        code: "required",
        message: `${field.label} is required.`,
      });
      continue;
    }
    const issue = validateFieldValue(field, value);
    if (issue) {
      issues.push({ ...issue, path: `${pathPrefix}.${field.key}` });
    }
  }
  return issues;
}

export function validateSubmissionAnswerCompatibility(
  form: CfpForm,
  answers: Record<string, unknown>,
  participants: SubmissionParticipant[],
): AnswerValidationIssue[] {
  const issues: AnswerValidationIssue[] = [];
  for (const field of form.submissionFields) {
    const issue = validateFieldValue(field, answers[field.key]);
    if (issue) issues.push(issue);
  }
  for (const [index, participant] of participants.entries()) {
    const participantAnswers: Record<string, unknown> = {
      ...participant.answers,
      firstName: participant.firstName,
      lastName: participant.lastName,
      email: participant.email,
    };
    for (const field of form.participantFields) {
      const issue = validateFieldValue(field, participantAnswers[field.key]);
      if (issue) {
        issues.push({ ...issue, path: `participants.${index}.${field.key}` });
      }
    }
  }
  return issues;
}

export function validateSubmissionAnswers(
  form: CfpForm,
  answers: Record<string, unknown>,
  participants: SubmissionParticipant[],
): AnswerValidationIssue[] {
  const issues = validateFieldSet(form.submissionFields, form, answers, "answers");
  for (const [index, participant] of participants.entries()) {
    const participantAnswers = {
      ...participant.answers,
      firstName: participant.firstName,
      lastName: participant.lastName,
      email: participant.email,
    };
    issues.push(
      ...validateFieldSet(
        form.participantFields,
        form,
        { ...answers, ...participantAnswers },
        `participants.${index}`,
      ),
    );
  }
  return issues;
}
