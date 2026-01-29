import { PrismaClient, Prisma } from '../../generated/client';

/**
 * UserRepository
 *
 * ✔ Prisma ORM 접근 전용 계층
 * ✔ CRUD 및 조회 로직 캡슐화
 * ✔ Service 계층과 DB 스키마 사이의 경계 역할
 *
 * 설계 원칙:
 * - 이 계층에서는 DTO를 사용하지 않고 Prisma Generated Type 사용
 * - 비즈니스 규칙은 포함하지 않고 "데이터 접근"만 담당
 * - Soft Delete, select 범위 등 DB 정책을 이 계층에서 일관되게 유지
 */
export class UserRepository {
  /**
   * PrismaClient 인스턴스
   * - Fastify plugin 또는 DI 컨테이너에서 주입
   * - 테스트 시 mock 또는 test DB로 대체 가능
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 사용자 생성
   *
   * @param data Prisma UserCreateInput
   * - Service 계층에서 가공된 값
   * - Prisma 스키마 구조를 그대로 사용
   *
   * 구현 포인트:
   * - create 시 필요한 필드만 명시적으로 매핑 (무분별한 spread 방지)
   * - select를 사용해 외부로 노출할 필드 최소화
   */
  async createUser(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        phoneNumber: data.phoneNumber,
        displayName: data.displayName ?? null, // optional→ DB null 처리
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
      },
    });
  }

  /**
   * 사용자 단건 조회 (Profile 포함 여부 선택 가능)
   *
   * @param query.userId 조회할 사용자 ID (PK)
   * @param query.includeProfile Profile 조인 여부
   *
   * 구현 포인트:
   * - Soft Delete 레코드는 항상 제외 (deletedAt: null)
   * - include 대신 select + 조건부 spread 패턴 사용
   *   → 반환 타입과 조회 필드를 명확하게 제어 가능
   */
  async getUserById(query: { userId: number; includeProfile: boolean }) {
    const { userId, includeProfile = false } = query;

    return this.prisma.user.findUnique({
      where: {
        id: userId,
        deletedAt: null, // Soft Delete 제외 정책
      },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        displayName: true,
        createdAt: true,
        updatedAt: true,
        // Profile 포함 요청 시에만 relation select 추가
        ...(includeProfile && {
          profile: {
            select: {
              bio: true,
              avatarKey: true,
              avatarFileName: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        }),
      },
    });
  }

  /**
   * 이메일 중복 여부 확인
   *
   * 사용 시점:
   * - 회원 가입
   * - 이메일 변경 전 중복 체크
   *
   * 구현 포인트:
   * - count 사용 → 존재 여부만 필요할 때 가장 가벼운 쿼리
   * - Soft Delete 제외하여 탈퇴 계정은 재사용 가능하게 설계
   */
  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: {
        email,
        deletedAt: null, // Soft Delete 제외
      },
    });
    return count > 0;
  }

  /**
   * 휴대폰 번호 중복 여부 확인
   *
   * 사용 시점:
   * - 회원 가입
   * - 휴대폰 번호 변경 전 검증
   *
   * 구현 포인트:
   * - email과 동일한 패턴 유지 → Repository API 일관성
   * - unique 컬럼이라도 비즈니스 검증 로직은 Service에서 수행
   */
  async existsByPhoneNumber(phoneNumber: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: {
        phoneNumber,
        deletedAt: null, // Soft Delete 제외
      },
    });
    return count > 0;
  }
}
