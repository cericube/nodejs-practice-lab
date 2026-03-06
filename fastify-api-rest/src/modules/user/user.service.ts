// src/module/user/user.service.ts
import type {
  UserCreateBodyDto,
  UserResponseDto,
  UserUpdateBodyDto,
  UserIdParamsDto,
  UserDetailResponseDto,
  UserQueryDto,
  UserListQueryDto,
  UserCountDto,
  UserExistsDto,
  UserListResponseDto,
  UserCountQueryDto,
} from './user.dto';
import type { UserRepository } from './user.repository';

/**
 * [Service Layer: 비즈니스 로직 계층, 비즈니스 오케스트레이션]
 * 1. 유스케이스(Use Case) 실행: 사용자 생성, 수정, 삭제 등의 비즈니스 규칙을 수행합니다.
 * 2. 데이터 변환(Mapping): DB에서 읽어온 로우(Row) 데이터를 클라이언트 응답 규격(DTO)으로 변환합니다.
 * 3. 흐름 제어: 페이징 여부에 따라 Repository의 서로 다른 메서드를 호출하는 등의 분기 처리를 담당합니다.
 */
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  /** 사용자를 생성하고 기본 응답 형태로 변환하여 반환합니다. */
  async createUser(input: UserCreateBodyDto): Promise<UserResponseDto> {
    const user = await this.repository.create(input);
    // 도메인 모델(Entity) -> 클라이언트 응답(DTO) 변환
    return toUserDetailResponse(user);
  }

  /** 활성화된 사용자의 정보를 수정합니다. (Soft Delete된 사용자는 수정 불가 정책) */
  async updateUser(userId: UserIdParamsDto, input: UserUpdateBodyDto): Promise<UserResponseDto> {
    const user = await this.repository.update(userId.id, input);
    return toUserDetailResponse(user);
  }

  /** 삭제(Soft Delete) 상태인 사용자를 다시 활성화합니다. */
  async restoreUser(userId: UserIdParamsDto): Promise<UserResponseDto> {
    const user = await this.repository.restore(userId.id);
    return toUserDetailResponse(user);
  }

  /** 사용자를 논리 삭제 처리합니다. (DB 레코드는 유지하되 deletedAt 기록) */
  async softDeleteUser(userId: UserIdParamsDto): Promise<UserResponseDto> {
    const user = await this.repository.softDelete(userId.id);
    return toUserDetailResponse(user);
  }

  /**
   * 특정 조건의 사용자 상세 정보를 조회합니다.
   * @param query - includeProfile 여부를 포함한 검색 조건
   */
  async getUser(query: UserQueryDto): Promise<UserDetailResponseDto> {
    /**
     * [exactOptionalPropertyTypes: true 정책 대응]
     * 1. 의미: 객체의 선택적 속성(?)에 명시적으로 'undefined'를 할당하는 것을 금지합니다.
     *   - { prop?: string } 일 때, { prop: undefined }는 에러이며 속성 자체가 없어야 합니다.
     * 2. 이유: Prisma 등 DB 라이브러리에서 '속성 부재'와 '값의 undefined'를 다르게 처리하여
     *   의도치 않게 컬럼값이 null로 덮어씌워지는 버그를 방지하기 위함입니다.
     * 3. 대응: 아래와 같이 구조 분해 할당 후 필요한 값만 새 객체에 담아 전달하는 방식을 권장합니다.
     */
    const { includeProfile, ...searchCondition } = query;
    const isIncludeProfile = String(includeProfile) === 'true';

    const user = await this.repository.selectOne({
      ...searchCondition,
      includeProfile: isIncludeProfile,
    });

    return toUserDetailResponse(user, isIncludeProfile);
  }

  /**
   * 사용자 목록을 조회하며, 페이징 요청 여부에 따라 응답 구조를 동적으로 결정합니다.
   * @param query - 검색 필터 및 페이징 옵션(skip, take)
   */
  async listUsers(query: UserListQueryDto): Promise<UserListResponseDto> {
    const { includeProfile, ...searchCondition } = query;
    const isIncludeProfile = String(includeProfile) === 'true';

    // 1. 페이지네이션 정보(skip 또는 take)가 존재하는 경우: 목록 + 메타데이터 반환
    if (query.skip !== undefined || query.take !== undefined) {
      const { data, total } = await this.repository.selectManyWithCount({
        ...searchCondition,
        includeProfile: isIncludeProfile,
      });

      return {
        data: data.map((user) => toUserDetailResponse(user, isIncludeProfile)),
        meta: {
          total: total,
          // 요청한 경우에만 skip, take 정보를 응답에 포함 (Spread 연산자 활용)
          ...(query.skip !== undefined && { skip: query.skip }),
          ...(query.take !== undefined && { take: query.take }),
        },
      };
    }

    // 2. 페이지네이션 정보가 없는 경우: 단순 목록 배열만 반환
    const users = await this.repository.selectMany({
      ...searchCondition,
      includeProfile: isIncludeProfile,
    });

    return {
      data: users.map((user) => toUserDetailResponse(user, isIncludeProfile)),
    };
  }

  /** 중복 체크 등 존재 여부 확인 로직 수행 */
  async existsUser(where: UserQueryDto): Promise<UserExistsDto> {
    // 존재 여부 확인 시에는 무거운 프로필 데이터 조회를 배제하여 성능 최적화
    const { includeProfile = false, ...pureWhere } = where;
    const exists = await this.repository.exists(pureWhere);
    return { exists: exists };
  }

  /** 특정 조건에 부합하는 전체 사용자 수 카운트 */
  async countUser(query: UserCountQueryDto): Promise<UserCountDto> {
    const { displayName = '' } = query ?? {};
    const count = await this.repository.count({ displayName: displayName });
    return { count: count };
  }
}

/**
 * [Helper: Data Mapper Function]
 * DB 엔티티 구조를 API 스펙에 맞는 DTO 구조로 변환하는 순수 함수입니다.
 * - 날짜 객체(Date)를 클라이언트 친화적인 ISO8601 문자열로 변환합니다.
 * - includeProfile 옵션에 따라 profile 필드를 조건부로 생성합니다.
 */
function toUserDetailResponse(
  user: UserRow,
  includeProfile: boolean = false,
): UserDetailResponseDto {
  return {
    id: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    // includeProfile이 true이고 DB에 profile 데이터가 존재할 때만 profile 객체 포함
    ...(includeProfile &&
      user.profile && {
        profile: {
          bio: user.profile.bio,
          avatarKey: user.profile.avatarKey,
          avatarFileName: user.profile.avatarFileName,
        },
      }),
  };
}

/** DB 조회 결과 데이터 타입 정의 (Select 절과 일치해야 함) */
type UserRow = {
  id: number;
  email: string;
  phoneNumber: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
  profile: {
    bio: string | null;
    avatarKey: string | null;
    avatarFileName: string | null;
  } | null;
};
