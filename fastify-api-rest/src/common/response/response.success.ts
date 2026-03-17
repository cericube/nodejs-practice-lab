// src/common/response/response.success.ts
import { Type, type TSchema } from '@sinclair/typebox';

/**
 * [SuccessResponseSchema]
 * 역할: TypeBox 기반의 응답 스키마 생성기 (JSON Schema)
 * - 목적: Fastify의 response schema 정의 시, 실제 데이터(dataSchema)를 표준 응답 래퍼로 감쌉니다.
 * - 검증: additionalProperties: false 설정을 통해 정의되지 않은 필드가 노출되는 것을 방지합니다.
 * * @param dataSchema - body 필드에 들어갈 데이터 구조 (DTO 스키마)
 */
export function SuccessResponseSchema<T extends TSchema>(dataSchema: T) {
  return Type.Object(
    {
      success: Type.Literal(true), // 응답 성공 시 항상 true 값 고정
      body: dataSchema, // 실제 비즈니스 데이터가 담기는 공간
    },
    {
      additionalProperties: false, // 스키마 외 데이터 유출 방지 (보안/최적화)
    },
  );
}

/**
 * [SuccessResponseDto]
 * 역할: 성공 응답의 정적 타입 정의 (TypeScript Type)
 * - 목적: 코드 레벨에서 성공 응답 객체의 타입을 추론하기 위해 사용합니다.
 */
export type SuccessResponseDto<T> = {
  success: true;
  body: T;
};

/**
 * [success]
 * 역할: 성공 응답 객체 생성 팩토리 함수
 * - 목적: Controller에서 결과를 반환할 때 일일이 객체를 생성하지 않고, 이 함수를 통해 규격화된 객체를 생성합니다.
 * - 사용 예시: return success(userData); -> { success: true, body: userData }
 * * @param data - 클라이언트에게 전달할 실제 데이터
 */
export function success<T>(data: T): SuccessResponseDto<T> {
  return {
    success: true,
    body: data,
  };
}
