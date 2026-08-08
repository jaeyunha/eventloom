import type {
  AirtableListOptions,
  AirtableMapper,
  AirtablePage,
  AirtableQueryValue,
  AirtableRecord,
  AirtableRecordPage,
  AirtableRequest,
  AirtableResponse,
  AirtableSort,
  AirtableTransport,
} from "./types";
import { AirtableRepositoryError } from "./types";

const AIRTABLE_RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const MAX_PAGE_SIZE = 100;

type UnknownFields = Record<string, unknown>;

export interface AirtableRepositoryOptions<
  TEntity,
  TCreate = TEntity,
  TUpdate = Partial<TEntity>,
  TFields extends object = UnknownFields,
> {
  readonly baseId: string;
  readonly table: string;
  readonly mapper: AirtableMapper<TEntity, TCreate, TUpdate, TFields>;
  readonly transport: AirtableTransport;
}

/**
 * Maps Airtable's internal record IDs to stable application IDs at the repository boundary.
 * Internal `rec...` identifiers are used only for Airtable mutations and are never returned.
 */
export class AirtableRepository<
  TEntity,
  TCreate = TEntity,
  TUpdate = Partial<TEntity>,
  TFields extends object = UnknownFields,
> {
  readonly #baseId: string;
  readonly #table: string;
  readonly #mapper: AirtableMapper<TEntity, TCreate, TUpdate, TFields>;
  readonly #transport: AirtableTransport;

  constructor(options: AirtableRepositoryOptions<TEntity, TCreate, TUpdate, TFields>) {
    this.#baseId = requiredValue(options.baseId, "baseId");
    this.#table = requiredValue(options.table, "table");
    this.#mapper = options.mapper;
    this.#transport = options.transport;
    requiredValue(options.mapper.applicationIdField, "applicationIdField");
  }

  async list(options: AirtableListOptions = {}): Promise<AirtablePage<TEntity>> {
    const page = await this.#requestPage(options);
    const items = page.records.map((record) => this.#decodeRecord(record));

    return page.offset === undefined ? { items } : { items, nextCursor: page.offset };
  }

  async find(applicationId: string, signal?: AbortSignal): Promise<TEntity | undefined> {
    const record = await this.#findRecord(applicationId, signal);
    return record === undefined ? undefined : this.#decodeRecord(record);
  }

  async get(applicationId: string, signal?: AbortSignal): Promise<TEntity> {
    const entity = await this.find(applicationId, signal);
    if (entity === undefined) {
      throw new AirtableRepositoryError(
        "NOT_FOUND",
        `No ${this.#table} record exists for the application ID.`,
      );
    }
    return entity;
  }

  async create(input: TCreate, signal?: AbortSignal): Promise<TEntity> {
    const applicationId = validateApplicationId(this.#mapper.applicationIdOf(input));
    const existing = await this.#findRecord(applicationId, signal);
    if (existing !== undefined) {
      throw new AirtableRepositoryError(
        "DUPLICATE_APPLICATION_ID",
        `A ${this.#table} record already exists for the application ID.`,
      );
    }

    const encoded = asFields(this.#mapper.encodeCreate(input));
    const fields = { ...encoded, [this.#mapper.applicationIdField]: applicationId };
    const request: AirtableRequest = {
      method: "POST",
      baseId: this.#baseId,
      table: this.#table,
      body: { fields },
      ...(signal === undefined ? {} : { signal }),
    };
    const response = await this.#transport.request<AirtableRecord<TFields>>(request);
    ensureSuccess(response);
    return this.#decodeRecord(parseRecord(response.body));
  }

  async update(
    applicationId: string,
    input: TUpdate,
    signal?: AbortSignal,
  ): Promise<TEntity> {
    const stableId = validateApplicationId(applicationId);
    const existing = await this.#findRecord(stableId, signal);
    if (existing === undefined) {
      throw new AirtableRepositoryError(
        "NOT_FOUND",
        `No ${this.#table} record exists for the application ID.`,
      );
    }

    const encoded = asFields(this.#mapper.encodeUpdate(input));
    const fields = { ...encoded, [this.#mapper.applicationIdField]: stableId };
    const request: AirtableRequest = {
      method: "PATCH",
      baseId: this.#baseId,
      table: this.#table,
      recordId: existing.id,
      body: { fields },
      ...(signal === undefined ? {} : { signal }),
    };
    const response = await this.#transport.request<AirtableRecord<TFields>>(request);
    ensureSuccess(response);
    return this.#decodeRecord(parseRecord(response.body));
  }

  async delete(applicationId: string, signal?: AbortSignal): Promise<boolean> {
    const stableId = validateApplicationId(applicationId);
    const existing = await this.#findRecord(stableId, signal);
    if (existing === undefined) {
      return false;
    }

    const request: AirtableRequest = {
      method: "DELETE",
      baseId: this.#baseId,
      table: this.#table,
      recordId: existing.id,
      ...(signal === undefined ? {} : { signal }),
    };
    const response = await this.#transport.request(request);
    ensureSuccess(response);
    return true;
  }

  async #findRecord(
    applicationId: string,
    signal?: AbortSignal,
  ): Promise<AirtableRecord<TFields> | undefined> {
    const stableId = validateApplicationId(applicationId);
    const options: AirtableListOptions = {
      pageSize: 2,
      filterByFormula: applicationIdFormula(this.#mapper.applicationIdField, stableId),
      ...(signal === undefined ? {} : { signal }),
    };
    const page = await this.#requestPage(options);

    if (page.records.length > 1) {
      throw new AirtableRepositoryError(
        "DUPLICATE_APPLICATION_ID",
        `Multiple ${this.#table} records use the same application ID.`,
      );
    }
    return page.records[0];
  }

  async #requestPage(options: AirtableListOptions): Promise<AirtableRecordPage<TFields>> {
    const query: Record<string, AirtableQueryValue | undefined> = {
      pageSize: validatePageSize(options.pageSize ?? MAX_PAGE_SIZE),
      offset: optionalNonEmpty(options.cursor, "cursor"),
      filterByFormula: options.filterByFormula,
    };

    if (options.fields !== undefined) {
      query["fields[]"] = options.fields;
    }
    const sort = options.sort ?? [
      { field: this.#mapper.applicationIdField, direction: "asc" } satisfies AirtableSort,
    ];
    sort.forEach((entry, index) => {
      query[`sort[${index}][field]`] = requiredValue(entry.field, "sort field");
      query[`sort[${index}][direction]`] = entry.direction ?? "asc";
    });

    const request: AirtableRequest = {
      method: "GET",
      baseId: this.#baseId,
      table: this.#table,
      query,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const response = await this.#transport.request<AirtableRecordPage<TFields>>(request);
    ensureSuccess(response);
    return parsePage(response.body);
  }

  #decodeRecord(record: AirtableRecord<TFields>): TEntity {
    try {
      return this.#mapper.decode(record.fields);
    } catch (cause) {
      throw new AirtableRepositoryError(
        "INVALID_RESPONSE",
        `A ${this.#table} record could not be decoded.`,
        { cause },
      );
    }
  }
}

export function applicationIdFormula(field: string, applicationId: string): string {
  const escapedField = requiredValue(field, "applicationIdField").replaceAll("}", "\\}");
  const escapedValue = validateApplicationId(applicationId)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
  return `{${escapedField}}='${escapedValue}'`;
}

export function validateApplicationId(applicationId: string): string {
  const value = requiredValue(applicationId, "applicationId");
  if (AIRTABLE_RECORD_ID.test(value)) {
    throw new TypeError("Airtable record IDs cannot be used as application IDs.");
  }
  return value;
}

function ensureSuccess(response: AirtableResponse): void {
  if (response.status >= 200 && response.status < 300) {
    return;
  }
  throw new AirtableRepositoryError(
    "REQUEST_FAILED",
    `Airtable request failed with status ${response.status}.`,
    {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    },
  );
}

function parsePage<TFields extends object>(body: unknown): AirtableRecordPage<TFields> {
  if (!isObject(body) || !Array.isArray(body.records)) {
    throw invalidResponse();
  }
  const records = body.records.map((record) => parseRecord<TFields>(record));
  if (body.offset !== undefined && typeof body.offset !== "string") {
    throw invalidResponse();
  }
  return body.offset === undefined ? { records } : { records, offset: body.offset };
}

function parseRecord<TFields extends object>(body: unknown): AirtableRecord<TFields> {
  if (
    !isObject(body) ||
    typeof body.id !== "string" ||
    typeof body.createdTime !== "string" ||
    !isObject(body.fields)
  ) {
    throw invalidResponse();
  }
  return {
    id: body.id,
    createdTime: body.createdTime,
    fields: body.fields as TFields,
  };
}

function asFields(value: object): UnknownFields {
  if (!isObject(value)) {
    throw new TypeError("Airtable field mappings must return an object.");
  }
  return value;
}

function isObject(value: unknown): value is UnknownFields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): AirtableRepositoryError {
  return new AirtableRepositoryError(
    "INVALID_RESPONSE",
    "Airtable returned an invalid record response.",
  );
}

function requiredValue(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} cannot be empty.`);
  }
  return value;
}

function optionalNonEmpty(value: string | undefined, name: string): string | undefined {
  return value === undefined ? undefined : requiredValue(value, name);
}

function validatePageSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new TypeError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return value;
}
