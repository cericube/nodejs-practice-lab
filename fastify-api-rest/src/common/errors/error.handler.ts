// src/common/errors/error.handler.ts

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from './error.codes';
import { BusinessError } from './business.error';
import { env } from '../../config/env';
import { Prisma } from '../../generated/client';

/**
 * 클라이언트로 내려보내는 에러 응답의 공통 스키마
 * - success: false
 * - code: 프론트/클라이언트에서 분기 처리용 에러 코드
 * - message: 사용자 또는 개발자에게 노출할 메시지
 */
interface ErrorResponse {
  success: false;
  code: string;
  message: string;
}

/**
 * Fastify 전역 에러 핸들러
 *
 * 역할
 * 1. 모든 throw / reject 된 에러를 한 곳에서 수집
 * 2. "이 에러를 어떤 HTTP 응답으로 변환할지" 최종 결정
 * 3. 로그 포맷을 표준화하여 Observability 확보
 *
 * Fastify 설정 예시:
 * fastify.setErrorHandler(errorHandler)
 */
export function errorHandler(
  error: unknown, // 어떤 타입의 에러도 올 수 있으므로 unknown
  request: FastifyRequest, // 요청 컨텍스트 (로깅, trace id 등 포함)
  reply: FastifyReply, // HTTP 응답 객체
) {
  /**
   * 기본값 (Fail-safe)
   * - 어떤 분기에도 걸리지 않으면 무조건 500으로 처리
   */
  let statusCode = 500;
  let errorCode: string = ErrorCode.INTERNAL_SERVER_ERROR;
  let message = '서버에서 알 수 없는 오류가 발생했습니다.';
  let details: unknown = null;

  /**
   * BusinessError
   * - 도메인/비즈니스 레이어에서 "의도적으로" 던진 예외
   * - 이미 HTTP status / errorCode / message가 결정되어 있음
   */
  if (error instanceof BusinessError) {
    statusCode = error.statusCode;
    errorCode = error.errorCode;
    message = error.message;
    details = error.details ?? null;
  } else if (error !== null && typeof error === 'object' && 'validation' in error) {
    /**
     * Fastify Validation Error
     * - 요청 바디 / 쿼리 / 파라미터가 JSON Schema 검증에 실패한 경우
     * - Fastify는 validation 속성을 가진 에러 객체를 던진다
     *
     * 타입 가드:
     * - `in` 연산자를 사용해 안전하게 타입 narrowing
     */
    statusCode = 400;
    errorCode = ErrorCode.VALIDATION_ERROR;
    message = '입력 형식이 올바르지 않습니다.';
    details = (error as { validation: unknown }).validation;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    /**
     * Prisma Known Request Error
     *
     * - Prisma에서 정의한 "알려진" DB 에러
     * - error.code(P2002, P2025 등)를 기준으로
     *   HTTP 에러로 변환
     */
    // 위에서 작성한 Prisma 매핑 로직이 이 자리에 들어갑니다.
    const mapping = mapPrismaError(error);
    statusCode = mapping.status;
    errorCode = mapping.code;
    message = mapping.message;
    details = mapping.details;
  }

  /**
   * 표준 로그 페이로드
   *
   * 설계 원칙:
   * - 로그는 "구조화(JSON)" 되어야 한다
   * - traceId 기준으로 요청 단위 추적 가능해야 한다
   * - 클라이언트에는 숨긴 details를 로그에는 남긴다
   */
  const logPayload = {
    level: statusCode >= 500 ? 'error' : 'info', // 서버 장애 여부 기준
    timestamp: new Date().toISOString(),
    service: env.SERVICE_NAME,
    traceId: request.id,
    context: {
      path: request.url,
      method: request.method,
    },
    error: {
      code: errorCode,
      message: message,
      details: details, // 내부 분석용 (클라이언트 미노출)
    },
    request: {
      body: request.body, // 개인정보 포함 가능 → 마스킹 고려
      query: request.query,
    },
  };

  /**
   * 로그 기록
   * - 5xx : error
   * - 4xx : info (또는 warn)
   */
  // request.log[logPayload.level as 'error' | 'info'](logPayload);
  // request.log['error'](logPayload);
  if (statusCode >= 500) {
    request.log.error(logPayload);
  } else {
    request.log.info(logPayload);
  }

  /**
   * 클라이언트 응답
   *
   * 원칙:
   * - 내부 에러 구조, stack trace 노출 금지
   * - 항상 동일한 포맷 유지
   */

  return reply.status(statusCode).send({
    success: false,
    code: errorCode,
    message: message,
  } satisfies ErrorResponse);
}

/**
 * Prisma 에러 → HTTP 에러 매핑 헬퍼
 * - DB 레이어의 에러를 API 레벨 의미로 번역
 * - 이 함수만 보면 "DB 에러 정책"을 한눈에 파악 가능
 */
function mapPrismaError(error: Prisma.PrismaClientKnownRequestError) {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      return {
        status: 409,
        code: ErrorCode.ALREADY_EXISTS,
        message: '중복된 데이터가 존재합니다.',
        details: error.meta,
      };
    case 'P2025': // Record not found
      return {
        status: 404,
        code: ErrorCode.NOT_FOUND,
        message: '데이터를 찾을 수 없습니다.',
        details: null,
      };
    default:
      return {
        status: 500, //그 외 Prisma 에러
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: '데이터베이스 오류가 발생했습니다.',
        details: { prismaCode: error.code },
      };
  }
}
