// src/module/user/user/repository.ts
import { PrismaClient, Prisma } from '../../generated/client';

/**
 * [Repository Layer: 데이터 영속성 계층]
 * 1. 데이터 소스 접근: Prisma Client를 사용하여 DB 쿼리를 직접 수행합니다.
 * 2. 쿼리 최적화: 필요한 필드만 선택(Select)하여 DB 부하 및 네트워크 트래픽을 최소화합니다.
 * 3. Soft Delete 구현: 물리적 삭제 대신 삭제 일시(deletedAt)를 관리하는 일관된 인터페이스를 제공합니다.
 */

/**
 * [Extended Where Unique 설명]
 * - 기존 규칙: findUnique, update, delete는 오직 @unique 설정이 된 단일 필드로만 대상을 찾아야 함.
 * - 확장 기능(Prisma 4.5+): Unique 필드(ID 등)와 일반 필터(deletedAt 등)를 'AND' 조건으로 결합 가능.
 * - 이점: "ID가 존재하더라도 삭제되지 않은(deletedAt: null) 상태여야만 한다"는
 *         비즈니스 조건을 DB 쿼리 레벨에서 강제함.
 */

/**
 * [UserBaseWhere: 조회 조건 타입 안전성 정의]
 * - id, email, phoneNumber 중 반드시 '하나'만 조회 조건으로 사용하도록 TypeScript의 Union Type 활용.
 * - searchCondition 전달 시 잘못된 필드 조합이 들어오는 것을 컴파일 단계에서 방지함.
 */
type UserBaseWhere =
  | { id: number; email?: never; phoneNumber?: never; includeProfile?: boolean }
  | { id?: never; email: string; phoneNumber?: never; includeProfile?: boolean }
  | { id?: never; email?: never; phoneNumber: string; includeProfile?: boolean };

/** [공통 Select 설정] 보안을 위해 패스워드 등 민감 필드는 제외하고 필수 필드만 명시 */
const userBaseSelect: Prisma.UserSelect = {
  id: true,
  email: true,
  phoneNumber: true,
  displayName: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

/** [프로필 전용 Select 설정] */
const profileSelect: Prisma.ProfileSelect = {
  bio: true,
  avatarKey: true,
  avatarFileName: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
};

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** [Create] 사용자 생성: 1:1 관계인 Profile 레코드를 항상 함께 생성하여 정합성 유지 */
  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data: {
        ...data,
        profile: { create: {} }, // 빈 프로필 객체 동시 생성
      },
      select: userBaseSelect,
    });
  }

  /**
   * [Update: Extended Where Unique 활용]
   * - Unique 필드(id)와 필터(deletedAt: null)를 조합하여 '살아있는 레코드'만 수정 가능하도록 보장.
   */
  async update(userId: number, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: {
        id: userId,
        deletedAt: null, // 삭제된 데이터에 대한 수정 시도를 DB 레벨에서 차단
      },
      data: data,
      select: userBaseSelect,
    });
  }

  /** [Restore] Soft Delete된 사용자와 연관 프로필을 다시 활성 상태로 복구 */
  async restore(userId: number) {
    return this.prisma.user.update({
      where: {
        id: userId,
        deletedAt: { not: null }, // 삭제된 상태인 유저만 타겟팅
      },
      data: {
        deletedAt: null,
        profile: {
          update: { deletedAt: null },
        },
      },
      select: userBaseSelect,
    });
  }

  /**
   * [Soft Delete] 사용자를 논리 삭제 처리.
   * - User와 Profile의 삭제 시각을 일치시켜 데이터 연관성 보호.
   */
  async softDelete(userId: number) {
    const date = new Date();
    return this.prisma.user.update({
      where: {
        id: userId,
        deletedAt: null,
      },
      data: {
        deletedAt: date,
        profile: {
          update: { deletedAt: date }, // 부모 객체 삭제 시 자식 객체도 연쇄 삭제 처리
        },
      },
      select: userBaseSelect,
    });
  }

  /** [Hard Delete] DB에서 데이터를 영구적으로 제거 */
  async hardDelete(userId: number) {
    return this.prisma.user.delete({
      where: { id: userId },
      select: { id: true },
    });
  }

  /**
   * [SelectOne: 고유 식별자 기반 상세 조회]
   * 1. 전략적 설계 (Extended Where Unique):
   * - Prisma의 'findUnique' 계열은 보통 @unique 필드로만 조회 가능하지만,
   *   4.5+ 버전부터는 여기에 일반 필터(deletedAt)를 결합할 수 있습니다.
   * - 이를 통해 "ID는 맞지만 이미 삭제된 데이터"가 조회되는 것을 DB 레벨에서 원천 차단합니다.
   * 2. 예외 처리 (findUniqueOrThrow):
   * - 데이터가 존재하지 않거나 deletedAt이 null이 아닐 경우 즉시 예외(P2025)를 던집니다.
   * - 서비스 계층에서 번거로운 'if (!user)' 체크 로직을 생략하게 해줍니다.
   */
  async selectOne(where: UserBaseWhere) {
    //1. 옵션 분리: includeProfile 필터와 실제 DB 검색 조건(id, email 등)을 분리합니다.
    const { includeProfile = false, ...searchCondition } = where;
    return this.prisma.user.findUniqueOrThrow({
      // 2. 검색 조건: searchCondition(Unique Key)과
      // deletedAt(Filter)을 'AND' 조건으로 결합합니다.
      where: {
        ...searchCondition, // id, email, phoneNumber 중 제공된 필드 전개
        deletedAt: null, // 반드시 활성화된 레코드만 타겟팅
      },
      // 3. 필드 선택 (Data Shaping): 네트워크 부하를 줄이기 위해 필요한 필드만 선별하여 가져옵니다.
      select: {
        ...userBaseSelect, // 미리 정의된 사용자 기본 필드 (password 제외)
        // 4.조건부 조인 (Conditional Join): includeProfile이 true일 때만
        // profile 관계 데이터를 병합합니다.
        ...(includeProfile && {
          profile: {
            select: { ...profileSelect }, // 프로필 테이블 내에서도 필요한 컬럼만 추출
          },
        }),
      },
    });
  }

  /**
   * [SelectMany: 사용자 목록 검색 및 다중 조회]
   * 1. 조건 검색: 표시 이름(displayName)을 포함한 부분 일치 검색을 수행합니다.
   * 2. 데이터 무결성: 논리 삭제되지 않은(deletedAt: null) 유효한 사용자만 걸러냅니다.
   * 3. 정렬 옵션: 클라이언트가 지정한 필드와 방향에 따라 정렬하며, 기본값은 ID 오름차순입니다.
   */
  async selectMany(options?: {
    includeProfile?: boolean;
    displayName?: string;
    orderBy?: { field: string; direction?: string };
  }) {
    /**
     * 구조 분해 할당]
     * 1. options ?? {}: 인자가 생략(null/undefined)되어도 빈 객체를 참조하게 하여 런타임 에러 방지
     * 2. 기본값 설정 (=): 객체에 해당 속성이 없을 경우, 지정된 기본값(false 또는 undefined)을 안전하게 할당
     */
    const { includeProfile = false, displayName = undefined, orderBy = undefined } = options ?? {};

    // 2. 정렬 조건(OrderBy) 동적 구성:
    // - 클라이언트 요청이 있으면 해당 필드(예: createdAt)와 방향(desc/asc)을 사용합니다.
    // - 요청이 없으면 시스템 기본값인 { id: 'asc' }를 적용하여 일관된 순서를 보장합니다.
    const orderByClause: Prisma.UserOrderByWithRelationInput = orderBy
      ? { [orderBy.field]: orderBy.direction }
      : { id: 'asc' };

    return this.prisma.user.findMany({
      // 3. 필터 조건 (Where):
      where: {
        // displayName이 존재할 때만 'contains'(SQL의 LIKE %text%) 검색 조건을 추가합니다.
        ...(displayName && { displayName: { contains: displayName } }),
        deletedAt: null,
      },
      // 구성된 정렬 조건을 쿼리에 반영합니다.
      orderBy: orderByClause,
      select: {
        ...userBaseSelect, // 공통 사용자 필드 포함
        // includeProfile이 true일 때만 연관된 Profile 데이터를 JOIN 하여 가져옵니다.
        ...(includeProfile && {
          profile: { select: profileSelect },
        }),
      },
    });
  }

  /**
   * [Count: 조건 부합 사용자 수 집계]
   * 1. 필터링된 총 레코드 수 계산: 특정 검색 조건(displayName)에 맞는 활성 사용자 수를 반환합니다.
   * - 실제 데이터 레코드를 불러오지 않고 DB 엔진 수준에서 숫자만 계산하므로 매우 빠르고 효율적입니다.
   */
  async count(options?: { displayName?: string }) {
    /**
     * [구조 분해 할당]
     * 1. options ?? {}: options가 null/undefined인 경우 빈 객체를 할당하여 에러 방지
     * 2. { displayName = undefined }: 객체 내 속성이 없으면 명시적으로 undefined 부여
     */
    const { displayName = undefined } = options ?? {};
    return this.prisma.user.count({
      where: {
        // 검색어가 입력된 경우, 해당 이름을 포함하는(LIKE) 사용자만 카운트에 포함합니다.
        ...(displayName && { displayName: { contains: displayName } }),
        deletedAt: null,
      },
    });
  }

  /**
   * [SelectManyWithCount: 페이지네이션 기반 목록 조회]
   * 1. 데이터 목록(data)과 조건에 맞는 총 개수(total)를 동시에 반환합니다.
   * 2. 검색, 정렬, 페이징(skip/take) 처리를 통합 수행합니다.
   * 핵심 기술 ($transaction):
   * - 목록 조회와 카운트 쿼리를 하나의 트랜잭션으로 묶어, 찰나의 순간에 데이터가 추가/삭제되어
   *   목록과 전체 개수가 불일치하는 현상(Read Inconsistency)을 방지합니다.
   */
  async selectManyWithCount(options?: {
    includeProfile?: boolean;
    displayName?: string;
    skip?: number;
    take?: number;
    orderBy?: { field: string; direction?: string };
  }) {
    // 1. 옵션 구조 분해 할당: 인자 미전달 시 에러 방지 및 기본값 설정
    const { includeProfile = false, displayName = undefined, skip, take, orderBy } = options ?? {};

    // 2. 공통 필터 조건 정의: 목록 조회와 카운트 쿼리에서 동일한 필터를 사용하여 정합성 유지
    const where: Prisma.UserWhereInput = {
      // displayName이 있으면 부분 일치 검색(LIKE %value%) 적용
      ...(displayName && { displayName: { contains: displayName } }),
      deletedAt: null,
    };
    // 3. 정렬 로직: 클라이언트 지정 정렬이 있으면 적용, 없으면 ID 오름차순 기본값 사용
    const orderByClause: Prisma.UserOrderByWithRelationInput = orderBy
      ? { [orderBy.field]: orderBy.direction ?? 'asc' }
      : { id: 'asc' };

    // 4.병렬 쿼리 실행 ($transaction): 두 쿼리를 한 번에 실행하여 데이터 일관성 확보
    // $transaction은 배열 안의 쿼리들이 모두 성공해야 완료됩니다.
    // 여기서는 쓰기 트랜잭션보다는 '조회 시점 일치(Read Consistency)'을 위해 사용되었습니다.
    const [data, total] = await this.prisma.$transaction([
      // 1. 실제 사용자 목록 조회
      this.prisma.user.findMany({
        where: where,
        ...(skip !== undefined && { skip }), // 페이징 시작 위치 (Offset)
        ...(take !== undefined && { take }), // 가져올 데이터 개수 (Limit)
        orderBy: orderByClause,
        select: {
          ...userBaseSelect,
          // 요청 시에만 관계 데이터(Profile) 포함 (Lazy Join 효과)
          ...(includeProfile && {
            profile: { select: profileSelect },
          }),
        },
      }),
      // 2. 전체 레코드 개수 카운트 (페이징과 관계없이 필터 조건에 맞는 총합)
      this.prisma.user.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * [Exists: 존재 여부 확인 최적화]
   * - count 대신 findFirst를 사용하는 이유:
   *   전체 개수를 세지 않고, 조건을 만족하는 첫 번째 레코드를 찾는 즉시
   *   쿼리를 종료(Early Exit)하여 성능을 극대화합니다.
   * - select: { id: true }:
   *   실제 데이터가 아닌 ID 존재 여부만 확인하여 네트워크 부하를 최소화합니다.
   */
  async exists(where: UserBaseWhere): Promise<boolean> {
    const { includeProfile = false, ...existwhere } = where;
    const user = await this.prisma.user.findFirst({
      where: {
        ...existwhere,
        deletedAt: null,
      },
      select: { id: true }, // 데이터 부하 최소화
    });

    return user !== null;
  }
}
