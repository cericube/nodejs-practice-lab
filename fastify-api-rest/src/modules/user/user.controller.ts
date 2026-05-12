// src/module/user/user.controller.ts
import type {
  UserCountDto,
  UserCountQueryDto,
  UserCreateBodyDto,
  UserDetailResponseDto,
  UserExistsDto,
  UserIdParamsDto,
  UserListQueryDto,
  UserListResponseDto,
  UserQueryDto,
  UserResponseDto,
  UserUpdateBodyDto,
} from './user.dto';
import type { UserService } from './user.service';

/**
 * [Controller Layer: 실행 조정 계층]
 * - Route 계층으로부터 전달받은 순수 데이터(DTO)를 비즈니스 로직에 매핑합니다.
 * - HTTP 프로토콜의 복잡함(request, reply)을 제거하여 서비스 로직을 순수하게 유지합니다.
 * - 로직(if, loop 등) 없이 요청을 서비스로 전달만 하므로 테스트 생략 권장..
 */
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** 사용자를 생성하고 그 결과를 반환 (POST 대응) */
  createUser(data: UserCreateBodyDto): Promise<UserResponseDto> {
    return this.userService.createUser(data);
  }

  /** 사용자의 일부 정보를 수정 (PATCH 대응) */
  updateUser(userId: UserIdParamsDto, input: UserUpdateBodyDto): Promise<UserResponseDto> {
    return this.userService.updateUser(userId, input);
  }

  /** 삭제(Soft-deleted)된 사용자를 다시 활성화 (PATCH restore 대응) */
  restoreUser(userId: UserIdParamsDto): Promise<UserResponseDto> {
    return this.userService.restoreUser(userId);
  }

  /** 사용자를 시스템상에서 '삭제' 상태로 변경 (DELETE 대응) */
  softDeleteUser(userId: UserIdParamsDto): Promise<UserResponseDto> {
    return this.userService.softDeleteUser(userId);
  }

  /** 검색 조건에 맞는 특정 사용자 정보를 가져옴 (GET 대응) */
  getUser(query: UserQueryDto): Promise<UserDetailResponseDto> {
    return this.userService.getUser(query);
  }

  /** 다수의 사용자 목록을 필터링하여 가져옴 (GET list 대응) */
  listUsers(query: UserListQueryDto): Promise<UserListResponseDto> {
    return this.userService.listUsers(query);
  }

  /** 조건에 맞는 사용자가 데이터베이스에 있는지 확인 (GET exists 대응) */
  existsUser(where: UserQueryDto): Promise<UserExistsDto> {
    return this.userService.existsUser(where);
  }

  /** 특정 조건의 사용자가 총 몇 명인지 계산 (GET count 대응) */
  countUser(query: UserCountQueryDto): Promise<UserCountDto> {
    return this.userService.countUser(query);
  }
}
