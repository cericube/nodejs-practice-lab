export enum ErrorCode {
  // =========================
  // COMMON / SYSTEM
  // =========================
  UNKNOWN = 'UNKNOWN', // 분류되지 않은 알 수 없는 오류
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR', // 서버 내부 처리 중 예외

  // =========================
  // AUTHENTICATION / AUTHORIZATION
  // =========================
  UNAUTHORIZED = 'UNAUTHORIZED', // 인증 정보 없음 또는 인증 실패
  FORBIDDEN = 'FORBIDDEN', // 인증은 되었으나 접근 권한 없음

  TOKEN_EXPIRED = 'TOKEN_EXPIRED', // 토큰 만료
  TOKEN_INVALID = 'TOKEN_INVALID', // 토큰 형식 또는 서명 오류
  TOKEN_REVOKED = 'TOKEN_REVOKED', // 서버에서 폐기된 토큰

  // =========================
  // VALIDATION / INPUT
  // =========================
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 입력 값 형식 또는 스키마 검증 실패

  // =========================
  // RESOURCE / DOMAIN
  // =========================
  NOT_FOUND = 'NOT_FOUND', // 요청한 리소스를 찾을 수 없음
  ALREADY_EXISTS = 'ALREADY_EXISTS', // 이미 존재하는 리소스

  // =========================
  // DATABASE (Prisma / Persistence)
  // =========================
  //DB_ERROR = 'DB_ERROR', // 데이터베이스 처리 중 일반 오류
  //DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION', // 유니크 / FK / 제약조건 위반
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED', // 트랜잭션 처리 실패

  // =========================
  // EXTERNAL / INTEGRATION
  // =========================
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR', // 외부 API 호출 실패
  EXTERNAL_TIMEOUT = 'EXTERNAL_TIMEOUT', // 외부 서비스 응답 지연
  EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE', // 외부 서비스 장애
}
