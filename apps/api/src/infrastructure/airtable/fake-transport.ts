import type {
  AirtableQueryValue,
  AirtableRecord,
  AirtableRequest,
  AirtableResponse,
  AirtableTransport,
} from "./types";

type FakeFields = Record<string, unknown>;
type FakeRecord = AirtableRecord<FakeFields>;
type QueuedResult =
  | { readonly kind: "response"; readonly response: AirtableResponse }
  | { readonly kind: "error"; readonly error: unknown };

export interface FakeAirtableSeedRecord {
  readonly baseId: string;
  readonly table: string;
  readonly fields: Readonly<FakeFields>;
  readonly recordId?: string;
  readonly createdTime?: string;
}

/** A deterministic in-memory Airtable transport for repository and feature tests. */
export class FakeAirtableTransport implements AirtableTransport {
  readonly requests: AirtableRequest[] = [];
  readonly #tables = new Map<string, FakeRecord[]>();
  readonly #queuedResults: QueuedResult[] = [];
  #nextRecordNumber = 1;

  seed(record: FakeAirtableSeedRecord): void {
    const table = this.#table(record.baseId, record.table);
    const id = record.recordId ?? this.#newRecordId();
    table.push({
      id,
      createdTime: record.createdTime ?? "2026-01-01T00:00:00.000Z",
      fields: cloneFields(record.fields),
    });
  }

  enqueueResponse(response: AirtableResponse): void {
    this.#queuedResults.push({ kind: "response", response });
  }

  enqueueError(error: unknown): void {
    this.#queuedResults.push({ kind: "error", error });
  }

  async request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>> {
    this.requests.push(copyRequest(request));

    const queued = this.#queuedResults.shift();
    if (queued?.kind === "error") {
      throw queued.error;
    }
    if (queued?.kind === "response") {
      return cloneResponse(queued.response) as AirtableResponse<TBody>;
    }

    const response = this.#handle(request);
    return cloneResponse(response) as AirtableResponse<TBody>;
  }

  #handle(request: AirtableRequest): AirtableResponse {
    const table = this.#table(request.baseId, request.table);
    switch (request.method) {
      case "GET":
        return this.#get(table, request);
      case "POST":
        return this.#create(table, request);
      case "PATCH":
        return this.#update(table, request);
      case "DELETE":
        return this.#delete(table, request);
    }
  }

  #get(table: FakeRecord[], request: AirtableRequest): AirtableResponse {
    if (request.recordId !== undefined) {
      const record = table.find(({ id }) => id === request.recordId);
      return record === undefined ? notFound() : ok(record);
    }

    let records = [...table];
    const formula = queryString(request.query?.filterByFormula);
    if (formula !== undefined) {
      const conditions = parseFilterFormula(formula);
      records = records.filter((record) =>
        conditions.some((condition) => matchesFilter(record, condition)),
      );
    }

    const sorts = parseSorts(request.query);
    if (sorts.length > 0) {
      records.sort((left, right) => compareRecords(left, right, sorts));
    }

    const start = parseOffset(queryString(request.query?.offset));
    const pageSize = parsePageSize(request.query?.pageSize);
    const page = records
      .slice(start, start + pageSize)
      .map((record) => projectRecord(record, queryStrings(request.query?.["fields[]"])));
    const body: { records: FakeRecord[]; offset?: string } = { records: page };
    if (start + pageSize < records.length) {
      body.offset = `offset:${start + pageSize}`;
    }
    return ok(body);
  }

  #create(table: FakeRecord[], request: AirtableRequest): AirtableResponse {
    const fields = requestFields(request.body);
    const record: FakeRecord = {
      id: this.#newRecordId(),
      createdTime: "2026-01-01T00:00:00.000Z",
      fields,
    };
    table.push(record);
    return { status: 201, headers: {}, body: record };
  }

  #update(table: FakeRecord[], request: AirtableRequest): AirtableResponse {
    const index = table.findIndex(({ id }) => id === request.recordId);
    const existing = table[index];
    if (existing === undefined) {
      return notFound();
    }
    const updated: FakeRecord = {
      ...existing,
      fields: { ...existing.fields, ...requestFields(request.body) },
    };
    table[index] = updated;
    return ok(updated);
  }

  #delete(table: FakeRecord[], request: AirtableRequest): AirtableResponse {
    const index = table.findIndex(({ id }) => id === request.recordId);
    const existing = table[index];
    if (existing === undefined) {
      return notFound();
    }
    table.splice(index, 1);
    return ok({ id: existing.id, deleted: true });
  }

  #table(baseId: string, table: string): FakeRecord[] {
    const key = `${baseId}\u0000${table}`;
    const existing = this.#tables.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created: FakeRecord[] = [];
    this.#tables.set(key, created);
    return created;
  }

  #newRecordId(): string {
    const id = `rec${String(this.#nextRecordNumber).padStart(14, "0")}`;
    this.#nextRecordNumber += 1;
    return id;
  }
}

interface ParsedSort {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

function parseSorts(
  query: Readonly<Record<string, AirtableQueryValue | undefined>> | undefined,
): ParsedSort[] {
  const sorts: ParsedSort[] = [];
  for (let index = 0; ; index += 1) {
    const field = queryString(query?.[`sort[${index}][field]`]);
    if (field === undefined) {
      return sorts;
    }
    const direction = queryString(query?.[`sort[${index}][direction]`]);
    sorts.push({ field, direction: direction === "desc" ? "desc" : "asc" });
  }
}

function compareRecords(left: FakeRecord, right: FakeRecord, sorts: readonly ParsedSort[]): number {
  for (const sort of sorts) {
    const comparison = compareValues(left.fields[sort.field], right.fields[sort.field]);
    if (comparison !== 0) {
      return sort.direction === "desc" ? -comparison : comparison;
    }
  }
  return left.id.localeCompare(right.id);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
}

interface ParsedFilter {
  readonly kind: "equals" | "contains";
  readonly field: string;
  readonly value: string;
}

function matchesFilter(record: FakeRecord, filter: ParsedFilter): boolean {
  const fieldValue = record.fields[filter.field];
  return filter.kind === "equals"
    ? fieldValue === filter.value
    : typeof fieldValue === "string" && fieldValue.includes(filter.value);
}

function parseEqualityFormula(formula: string): ParsedFilter {
  const match = /^\{(.+)\}='((?:\\.|[^'])*)'$/.exec(formula);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new TypeError(`The fake transport does not support formula: ${formula}`);
  }
  return {
    kind: "equals",
    field: unescapeFormula(match[1]),
    value: unescapeFormula(match[2]),
  };
}

function parseFindFormula(formula: string): ParsedFilter {
  const match = /^FIND\(("(?:\\.|[^"\\])*"),\{(.+)\}\)>0$/u.exec(formula);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new TypeError(`The fake transport does not support formula: ${formula}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(match[1]);
  } catch {
    throw new TypeError(`The fake transport does not support formula: ${formula}`);
  }
  if (typeof value !== "string") {
    throw new TypeError(`The fake transport does not support formula: ${formula}`);
  }
  return {
    kind: "contains",
    field: unescapeFormula(match[2]),
    value,
  };
}

function parseFilterClause(formula: string): ParsedFilter {
  return formula.startsWith("FIND(") ? parseFindFormula(formula) : parseEqualityFormula(formula);
}

function parseFilterFormula(formula: string): readonly ParsedFilter[] {
  if (!formula.startsWith("OR(") || !formula.endsWith(")")) {
    return [parseFilterClause(formula)];
  }
  const inner = formula.slice(3, -1);
  const clauses: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "'") {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      clauses.push(inner.slice(start, index));
      start = index + 1;
    }
  }
  clauses.push(inner.slice(start));
  if (quoted || clauses.some((clause) => clause.length === 0)) {
    throw new TypeError(`The fake transport does not support formula: ${formula}`);
  }
  return clauses.map(parseFilterClause);
}

function unescapeFormula(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

function parseOffset(value: string | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const match = /^offset:(\d+)$/.exec(value);
  const offset = match?.[1];
  if (offset === undefined) {
    throw new TypeError(`Invalid fake Airtable offset: ${value}`);
  }
  return Number(offset);
}

function parsePageSize(value: AirtableQueryValue | undefined): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 100;
}

function requestFields(body: unknown): FakeFields {
  if (!isObject(body) || !isObject(body.fields)) {
    throw new TypeError("The fake Airtable transport expected a fields body.");
  }
  return cloneFields(body.fields);
}

function projectRecord(record: FakeRecord, fields: readonly string[] | undefined): FakeRecord {
  if (fields === undefined) {
    return record;
  }
  const projected: FakeFields = {};
  for (const field of fields) {
    if (Object.hasOwn(record.fields, field)) {
      projected[field] = record.fields[field];
    }
  }
  return { ...record, fields: projected };
}

function queryString(value: AirtableQueryValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function queryStrings(value: AirtableQueryValue | undefined): readonly string[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : undefined;
}

function ok(body: unknown): AirtableResponse {
  return { status: 200, headers: {}, body };
}

function notFound(): AirtableResponse {
  return {
    status: 404,
    headers: {},
    body: { error: { type: "NOT_FOUND", message: "Record not found" } },
  };
}

function copyRequest(request: AirtableRequest): AirtableRequest {
  return {
    ...request,
    ...(request.query === undefined ? {} : { query: { ...request.query } }),
    ...(request.body === undefined ? {} : { body: structuredClone(request.body) }),
  };
}

function cloneResponse(response: AirtableResponse): AirtableResponse {
  return {
    status: response.status,
    headers: { ...response.headers },
    body: structuredClone(response.body),
  };
}

function cloneFields(fields: Readonly<FakeFields>): FakeFields {
  return structuredClone(fields);
}

function isObject(value: unknown): value is FakeFields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
