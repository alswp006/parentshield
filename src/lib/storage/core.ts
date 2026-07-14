export type StorageErrorCode =
  | "PARSE_ERROR"
  | "QUOTA_EXCEEDED"
  | "STRINGIFY_ERROR"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED";

export class StorageError extends Error {
  code: StorageErrorCode;
  key: string;
  constructor(params: { code: StorageErrorCode; key: string; message?: string }) {
    super(params.message ?? params.code);
    this.code = params.code;
    this.key = params.key;
  }
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new StorageError({ code: "PARSE_ERROR", key });
    }
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw new StorageError({ code: "STORAGE_READ_FAILED", key });
  }
}

function isQuotaExceededError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "QuotaExceededError") ||
    (typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === 22)
  );
}

export function writeStore<T>(key: string, value: T): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new StorageError({ code: "STRINGIFY_ERROR", key });
  }
  try {
    localStorage.setItem(key, serialized);
  } catch (e) {
    if (isQuotaExceededError(e)) throw new StorageError({ code: "QUOTA_EXCEEDED", key });
    throw new StorageError({ code: "STORAGE_WRITE_FAILED", key });
  }
}

export function writeManyTransactionally(updates: Array<{ key: string; value: unknown }>): void {
  const prev = updates.map(({ key }) => ({ key, raw: localStorage.getItem(key) }));

  const next = updates.map(({ key, value }) => {
    try {
      return { key, raw: JSON.stringify(value) };
    } catch {
      throw new StorageError({ code: "STRINGIFY_ERROR", key });
    }
  });

  try {
    for (const { key, raw } of next) {
      try {
        localStorage.setItem(key, raw);
      } catch (e) {
        if (isQuotaExceededError(e)) throw new StorageError({ code: "QUOTA_EXCEEDED", key });
        throw new StorageError({ code: "STORAGE_WRITE_FAILED", key });
      }
    }
  } catch (commitErr) {
    for (const { key, raw } of prev) {
      try {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
      } catch {
        // rollback 자체 실패는 추가 throw로 확장하지 않음(최초 commitErr 유지)
      }
    }
    throw commitErr;
  }
}

// globalThis에 등록해 테스트가 vi.stubGlobal("writeManyTransactionally", ...)로 가로챌 수 있게 한다.
(globalThis as unknown as { writeManyTransactionally?: typeof writeManyTransactionally }).writeManyTransactionally =
  writeManyTransactionally;
