import type { UserCreateBodyDto, UserResponseDto } from './user.dto';
import type { UserService } from './user.service';

/**
 * UserController
 *
 * ✔ HTTP 계층 전용 책임
 * ✔ Request → DTO 해석
 * ✔ Service 호출
 * ✔ Response DTO 반환
 *
 * Controller의 역할:
 * - HTTP 프레임워크(Fastify, Express 등)와 가장 가까운 계층
 * - 비즈니스 로직을 직접 수행하지 않음
 * - 입력/출력 타입을 DTO로 고정하여 API 계약(Contract) 역할 수행
 *
 * 계층 흐름:
 * Route → Controller → Service → Repository → DB
 */
export class UserController {
  /**
   * UserService 의존성 주입
   *
   * - 실제 구현체는 app bootstrap 또는 DI 컨테이너에서 주입
   * - 테스트 시 mock service로 대체 가능
   */
  constructor(private readonly userService: UserService) {}

  /**
   * 사용자 생성 API 핸들러 (비즈니스 진입점)
   *
   * @param data UserCreateBodyDto
   * - Route 계층에서 이미 Schema 검증 완료된 데이터
   * - Controller에서는 추가 검증 없이 그대로 Service로 전달
   *
   * @returns UserResponseDto
   * - API 응답 스키마와 1:1 매칭되는 DTO
   * - 내부 엔티티/ORM 타입을 외부로 노출하지 않음
   *
   * 구현 원칙:
   * - 비즈니스 규칙 포함 ❌
   * - 트랜잭션, 중복 체크 등은 Service 책임
   * - Controller는 흐름 오케스트레이션만 담당
   */
  async createUser(data: UserCreateBodyDto): Promise<UserResponseDto> {
    return await this.userService.register(data);
  }
}

/*
────────────────────────────────────────────────────────────
메서드 선언 방식에 대한 보충 설명
────────────────────────────────────────────────────────────

현재 방식:

  async createUser(...) { ... }

✔ 이 메서드는 UserController.prototype에 존재
✔ 모든 인스턴스가 동일한 함수 객체를 공유
✔ 메모리 효율적이며 일반적인 클래스 메서드 패턴

대안 방식:

  createUser = async (...) => { ... }

✔ this가 렉시컬 바인딩되어 Fastify handler로 바로 전달 가능
❌ 인스턴스마다 함수가 새로 생성됨

실무 기준 권장:
- Router에서 controller.createUser(...) 형태로 감싸서 호출 → 현재 방식 권장
- handler로 직접 바인딩해야 하면 arrow function 방식 고려
*/
