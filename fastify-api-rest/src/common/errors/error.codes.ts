/**
 * 시스템 전반에서 공통으로 사용하는 에러 코드 정의
 *
 * 목적:
 * - 프론트엔드 분기 처리 기준
 * - 로그/모니터링 집계 키
 * - 다국어 메시지 매핑 키
 *
 * 규칙:
 * - 대문자 + SNAKE_CASE
 * - HTTP Status 와 직접 1:1 매핑하지 않음 (의미 기준)
 */
export enum ErrorCode {
  // =========================
  // COMMON
  // =========================
  UNKNOWN = 'UNKNOWN',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',

  // =========================
  // AUTH / SECURITY
  // =========================
  UNAUTHORIZED = 'UNAUTHORIZED', // 인증 실패
  FORBIDDEN = 'FORBIDDEN', // 권한 없음
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',

  // =========================
  // VALIDATION / INPUT
  // =========================
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  MISSING_PARAMETER = 'MISSING_PARAMETER',

  // =========================
  // RESOURCE
  // =========================
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',

  // =========================
  // BUSINESS RULE
  // =========================
  INVALID_STATE = 'INVALID_STATE',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // =========================
  // DATABASE
  // =========================
  DB_ERROR = 'DB_ERROR',
  DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  DB_RECORD_NOT_FOUND = 'DB_RECORD_NOT_FOUND',

  // =========================
  // EXTERNAL SERVICE
  // =========================
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  EXTERNAL_TIMEOUT = 'EXTERNAL_TIMEOUT',
}
