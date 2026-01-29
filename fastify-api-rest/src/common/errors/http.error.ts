// src/common/errors/http.error.ts

// “아키텍처 분리와 일관된 에러 흐름”을 만들기 위해서입니다.
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string | undefined;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
