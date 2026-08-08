export type AirtableMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type AirtableQueryValue = string | number | boolean | readonly string[];

export interface AirtableRequest {
  readonly method: AirtableMethod;
  readonly baseId: string;
  readonly table: string;
  readonly recordId?: string;
  readonly query?: Readonly<Record<string, AirtableQueryValue | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface AirtableResponse<TBody = unknown> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: TBody;
}

export interface AirtableTransport {
  request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>>;
}

export interface AirtableRecord<TFields extends object = Record<string, unknown>> {
  readonly id: string;
  readonly createdTime: string;
  readonly fields: TFields;
}

export interface AirtableRecordPage<TFields extends object = Record<string, unknown>> {
  readonly records: readonly AirtableRecord<TFields>[];
  readonly offset?: string;
}

export interface AirtablePage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface AirtableSort {
  readonly field: string;
  readonly direction?: "asc" | "desc";
}

export interface AirtableListOptions {
  readonly cursor?: string;
  readonly pageSize?: number;
  readonly fields?: readonly string[];
  readonly filterByFormula?: string;
  readonly sort?: readonly AirtableSort[];
  readonly signal?: AbortSignal;
}

export interface AirtableMapper<
  TEntity,
  TCreate = TEntity,
  TUpdate = Partial<TEntity>,
  TFields extends object = Record<string, unknown>,
> {
  /** A dedicated Airtable field containing the stable, application-owned ID. */
  readonly applicationIdField: string;
  applicationIdOf(input: TCreate): string;
  encodeCreate(input: TCreate): TFields;
  encodeUpdate(input: TUpdate): Partial<TFields>;
  decode(fields: Readonly<TFields>): TEntity;
}

export type AirtableRepositoryErrorCode =
  | "NOT_FOUND"
  | "DUPLICATE_APPLICATION_ID"
  | "INVALID_RESPONSE"
  | "REQUEST_FAILED";

export class AirtableRepositoryError extends Error {
  readonly code: AirtableRepositoryErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: AirtableRepositoryErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AirtableRepositoryError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) {
      this.status = options.status;
    }
  }
}
