// src/common/errors/error.handler.ts

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from './http.error';
import { ErrorCode } from './error.codes';

/**
 * 클라이언트로 내려보내는 에러 응답의 공통 스키마
 * - code: 프론트/클라이언트에서 분기 처리용 에러 코드
 * - message: 사용자 또는 개발자에게 노출할 메시지
 */
export interface ErrorResponse {
  code?: string;
  message: string;
}

/**
 * Fastify 전역 에러 핸들러
 * - 모든 throw / reject 된 에러는 이 함수로 집결됨
 * - 여기서 "어떤 에러를 어떤 HTTP 응답으로 변환할지" 최종 결정
 */
export function errorHandler(
  error: unknown, // 어떤 타입의 에러도 올 수 있으므로 unknown
  request: FastifyRequest, // 요청 컨텍스트 (로깅, trace id 등 포함)
  reply: FastifyReply, // HTTP 응답 객체
) {
  /**
   * =========================
   * 1. 비즈니스 로직 에러 처리
   * =========================
   * 서비스 / 도메인 레이어에서 의도적으로 throw 한 에러
   * → 이미 statusCode, code, message가 정의되어 있음
   */
  if (error instanceof HttpError) {
    // warn: 서버 장애는 아니지만, 정상 흐름은 아닌 경우
    request.log.warn({
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details, // (있다면) 디버깅용 추가 정보
    });

    // 클라이언트에는 필요한 정보만 내려줌
    return reply.status(error.statusCode).send({
      code: error.code ?? ErrorCode.UNKNOWN,
      message: error.message,
    } satisfies ErrorResponse);
    // satisfies:
    // - 실제 타입은 그대로 유지
    // - ErrorResponse 형태를 만족하는지만 컴파일 타임에 체크
  }

  /**
   * =========================
   * 2. 요청 검증(Validation) 에러
   * =========================
   * Fastify schema / Zod / AJV 등에 의해 자동 발생한 에러
   * → 주로 400 Bad Request 로 처리
   */
  const validationError = error as FastifyError;

  if (validationError.validation) {
    // info: 클라이언트 입력 문제이므로 서버 에러 레벨은 아님
    request.log.info({
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation Error',
      details: validationError.validation, // 어떤 필드가 실패했는지
    });

    return reply.status(400).send({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation Error',
    } satisfies ErrorResponse);
  }

  /**
   * =========================
   * 3. 그 외 모든 예외 (시스템 에러)
   * =========================
   * - null reference
   * - DB 연결 오류
   * - 라이브러리 내부 에러
   * - 잡히지 않은 throw
   *
   * → 반드시 서버 로그에 full stack 남겨야 함
   */
  request.log.error(
    { err: error }, // Fastify/Pino가 stack trace 포함해서 기록
    'Unhandled internal server error',
  );

  // 클라이언트에는 내부 구조를 노출하지 않고 일반 메시지만 전달
  reply.status(500).send({
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: 'Internal Server Error',
  } satisfies ErrorResponse);
}
