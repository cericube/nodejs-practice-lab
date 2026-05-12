// src/common/errors/http.error.ts

import { ErrorCode } from './error.codes';

// BusinessError는 바로 이 역할을 수행하는 애플리케이션 내부 전용 에러 프로토콜로,
// Service → Handler 간에 에러의 의미와 종류를 명확하게 전달하는 데 사용됩니다.
// 클라이언트는 BusinessError 자체를 직접 보지 않으며,
// Handler 레이어에서 이를 해석해 정제된 JSON 응답(에러 코드, 메시지 등)으로 변환된 결과만을 전달받는 구조입니다

// details가 없을 수도 있으므로 기본값은 unknown으로 설정
export class BusinessError<T = unknown> extends Error {
  constructor(
    public errorCode: ErrorCode,
    public message: string,
    public statusCode: number = 400,
    public details?: T, // any 대신 제네릭 T 사용
  ) {
    super(message);
    // 이 클래스의 인스턴스임을 명확히 함 (TS에서 instanceof 체크를 위해 필요)
    Object.setPrototypeOf(this, BusinessError.prototype);
    this.name = this.constructor.name;
  }
}
