import type { UserCreateBodyDto, UserResponseDto } from './user.dto';
import type { UserRepository } from './user.repository';

/**
 * UserService
 *
 * ✔ 핵심 비즈니스 로직 계층
 * ✔ 여러 Repository 조합 및 트랜잭션 흐름 제어
 * ✔ 도메인 규칙 검증 및 정책 적용
 * ✔ 외부 계층(Controller)과 내부 계층(Repository) 사이의 중재자
 *
 * 책임 분리:
 * - Controller: HTTP 해석 및 응답 구성
 * - Service: 비즈니스 규칙, 흐름 제어, 정책 판단
 * - Repository: 순수 DB 접근 로직
 */
export class UserService {
  /**
   * UserRepository 의존성 주입
   *
   * - DB 접근 구현을 Service에서 분리
   * - 테스트 시 mock repository 주입 가능
   */
  constructor(private readonly repository: UserRepository) {}

  /**
   * 회원 가입 비즈니스 유스케이스
   *
   * 처리 흐름(예상 확장):
   * 1. 입력 DTO 검증 (형식 검증은 Route 단계에서 완료)
   * 2. 도메인 규칙 검증 (중복 이메일, 번호 등)
   * 3. 사용자 생성
   * 4. 후처리 (이벤트 발행, 환영 메일, 로그 등)
   * 5. Response DTO 변환
   *
   * @param input UserCreateBodyDto
   * - API 요청 스키마와 1:1 매칭되는 입력 DTO
   *
   * @returns UserResponseDto
   * - API 응답 스키마와 1:1 매칭되는 출력 DTO
   */
  async register(input: UserCreateBodyDto): Promise<UserResponseDto> {
    /**
     * Repository 호출 시 Prisma Generated Type 형태로 변환
     *
     * - Service → Repository 경계에서 ORM 타입으로 매핑
     * - DTO가 DB 계층으로 직접 내려가지 않도록 차단
     */
    const result = await this.repository.createUser({
      email: input.email,
      phoneNumber: input.phoneNumber,
      displayName: input.displayName ?? null,
    });

    /**
     * ORM 결과 → Response DTO 변환
     *
     * Prisma는 Date 객체를 반환하지만,
     * API 스키마(TypeBox)는 ISO 문자열(date-time)을 요구하므로
     * Service 계층에서 직렬화 책임을 가진다.
     *
     * → Controller는 데이터 변환 로직을 몰라도 됨
     */
    return {
      ...result,
      createdAt: result.createdAt.toISOString(), // 기존 값 덮어 씀
    };
    // return {
    //   id: result.id,
    //   email: result.email,
    //   displayName: result.displayName,
    //   createdAt: result.createdAt.toISOString(),
    // };
  }
}
