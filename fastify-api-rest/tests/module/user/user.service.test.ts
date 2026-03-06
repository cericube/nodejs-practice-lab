// tests/module/user/user.service.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserService } from '../../../src/modules/user/user.service';

import { prisma } from '../setup';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { UserRepository } from '../../../src/modules/user/user.repository';

/**
 * [ Service Layer Test: Business Logic & Workflow ]
 * 목적: 비즈니스 요구사항 수행 및 클라이언트용 응답(DTO) 가공 로직 검증
 * 1. 비즈니스 규칙: 도메인 정책(예: 삭제 유저는 조회 불가)에 따른 로직 분기가 정확한가?
 * 2. 응답 규격(DTO) 가공: Repository의 Raw 데이터를 클라이언트 규격(Response Dto)에 맞춰 변환하는가?
 * 3. 프로세스 흐름: 여러 Repository 호출을 조합하여 하나의 완성된 비즈니스 시나리오를 완성하는가?
 * 4. 예외/유효성 처리: 잘못된 요청에 대해 적절한 비즈니스 에러를 던지고, 필수 값을 검증하는가?
 */

beforeEach(async () => {
  // User와 Profile은 1:1 관계이므로 데이터 무결성을 위해 모두 삭제
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();
});

afterEach(async () => {
  // 테스트 완료 후 잔여 데이터를 정리하여 다음 테스트 세트에 영향을 주지 않도록 함
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();
});

function userInput(
  overrides?: Partial<{ email?: string; phoneNumber?: string; displayName?: string }>,
) {
  return {
    email: 'test@example.com',
    phoneNumber: '+821012345678',
    displayName: '홍길동',
    ...overrides, // 인자로 받은 값이 있으면 기본값을 덮어씀
  };
}

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('UserService 응답은 DTO 포맷 구조로 반환한다.', () => {
  let repository: UserRepository = new UserRepository(prisma);
  let service: UserService = new UserService(repository);

  beforeEach(async () => {
    // 정상 20명 유저
    for (let i = 1; i <= 20; i++) {
      await service.createUser({
        email: `user${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
        displayName: `홍길동${i}`,
      });
    }
    // 삭제 5명 유저
    for (let i = 21; i <= 25; i++) {
      const user = await service.createUser({
        email: `deleted${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
      });
      await service.softDeleteUser({ id: user.id });
    }
  });

  it('1. 사용자 생성, 삭제, 갱신 시 UserResponseDto 구조의 응답을 반환한다', async () => {
    // 1. 사용자 생성
    const input = userInput();
    const result = await service.createUser(input);
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
    //
    expect(typeof result.id).toBe('number');

    expect(result.id).not.toBeNull();
    expect(result.email).not.toBeNull();
    expect(result.displayName).not.toBeNull();

    expect(isDateTime(result.createdAt)).toBe(true);
    expect(isDateTime(result.updatedAt)).toBe(true);

    //2. 업데이트
    const updated = await service.updateUser(
      { id: result.id },
      {
        displayName: '업데이트 이름',
      },
    );
    expect(updated).toHaveProperty('id');
    expect(updated).toHaveProperty('email');
    expect(updated).toHaveProperty('displayName');
    expect(updated).toHaveProperty('createdAt');
    expect(updated).toHaveProperty('updatedAt');
    expect(updated.id).not.toBeNull();
    expect(updated.email).not.toBeNull();
    expect(updated.displayName).not.toBeNull();
    expect(updated.displayName).toEqual('업데이트 이름');
    //
    //3. 삭제. (업데이트 결과도 확인)
    const deleted = await service.softDeleteUser({ id: result.id });
    expect(deleted).toHaveProperty('id');
    expect(deleted).toHaveProperty('email');
    expect(deleted).toHaveProperty('displayName');
    expect(deleted).toHaveProperty('createdAt');
    expect(deleted).toHaveProperty('updatedAt');
    expect(deleted.id).not.toBeNull();
    expect(deleted.email).not.toBeNull();
    expect(deleted.displayName).not.toBeNull();
    expect(deleted.displayName).toEqual('업데이트 이름');
    //
    //4. 삭제 되었는지 확인
    try {
      const selectOne = await service.getUser({
        id: result.id,
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError) {
        expect(err.message).toContain('No record was found');
      }
    }

    // 5. 복구
    const restored = await service.restoreUser({ id: result.id });
    expect(restored).toHaveProperty('id');
    expect(restored).toHaveProperty('email');
    expect(restored).toHaveProperty('displayName');
    expect(restored).toHaveProperty('createdAt');
    expect(restored).toHaveProperty('updatedAt');
    expect(restored.id).not.toBeNull();
    expect(restored.email).not.toBeNull();
    expect(restored.displayName).not.toBeNull();
    expect(restored.displayName).toEqual('업데이트 이름');

    //6. 복구 되었는지 확인
    const selectOne = await service.getUser({
      id: result.id,
    });
    expect(selectOne.id).toEqual(result.id);
  });

  it('2. 사용자 이름 없이 등록하여도 응답 구조에 displayName 항목이 있다', async () => {
    const input = userInput({
      displayName: undefined,
    });
    const result = await service.createUser(input);

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('displayName');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
    expect(result.id).not.toBeNull();
    expect(result.email).not.toBeNull();
    expect(result.displayName).toBeNull(); // displayName만 null이어야 한다.

    expect(isDateTime(result.createdAt)).toBe(true);
    expect(isDateTime(result.updatedAt)).toBe(true);
  });

  it('3. 사용저 기본 정보 조회시 profile 정보 없이 응답한다.', async () => {
    const email = 'user3@test.com';
    const user = await service.getUser({
      email: email,
    });
    //1. 기본 정보 조회(profile 이 없다.)
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('displayName');
    expect(user).toHaveProperty('createdAt');
    expect(user).toHaveProperty('updatedAt');
    expect(user.id).not.toBeNull();
    expect(user.email).not.toBeNull();
    expect(isDateTime(user.createdAt)).toBe(true);
    expect(isDateTime(user.updatedAt)).toBe(true);

    expect(user.profile).toBeUndefined();
  });

  it('4. 사용저 상세 정보 조회시 profile 정보를 포함하여 응답한다.', async () => {
    const email = 'user3@test.com';
    const user = await service.getUser({
      email: email,
      includeProfile: 'true',
    });
    //1. 상세 정보 조회(profile 포함)
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('displayName');
    expect(user).toHaveProperty('createdAt');
    expect(user).toHaveProperty('updatedAt');
    expect(user.id).not.toBeNull();
    expect(user.email).not.toBeNull();
    expect(isDateTime(user.createdAt)).toBe(true);
    expect(isDateTime(user.updatedAt)).toBe(true);

    expect(user.profile).toBeDefined();
  });

  it('5. 페이지 정보가 없는 사용자 목록을 조회시 data 항목만 반환한다 ', async () => {
    const users = await service.listUsers({});
    expect(users).toHaveProperty('data');
    expect(users.data.length).toBe(20);
    expect(users.data[0]).toHaveProperty('email');
    expect(users.data[0]).toHaveProperty('phoneNumber');
    expect(users.data[0]).toHaveProperty('displayName');
    expect(users.data[0]).toHaveProperty('createdAt');
    expect(users.data[0]).toHaveProperty('updatedAt');
    //TODO meta가 없어야 한다.
  });

  it('6. 페이지 있는 사용자목록 조회시 data + meta정보를 반환한다.', async () => {
    const users = await service.listUsers({
      orderBy: { field: 'createdAt', direction: 'desc' },
      includeProfile: 'true',
      skip: 5,
      take: 10,
    });
    expect(users).toHaveProperty('data');
    expect(users).toHaveProperty('meta');
    expect(users.meta).toHaveProperty('total', 20);
    expect(users.meta).toHaveProperty('skip', 5);
    expect(users.meta).toHaveProperty('take', 10);
    expect(users.data.length).toBe(10);
    expect(users.data[0]).toHaveProperty('profile');
  });

  it('7. 결과가 없을때 data 는 빈 배열이다.', async () => {
    const users = await service.listUsers({
      displayName: '강길',
      orderBy: { field: 'createdAt', direction: 'desc' },
      includeProfile: 'true',
      skip: 5,
      take: 10,
    });
    expect(users).toHaveProperty('data');
    expect(users.data).toBeInstanceOf(Array);
    expect(users.data).toHaveLength(0);
    expect(users).toHaveProperty('meta');
    expect(users.meta).toHaveProperty('total', 0);
    expect(users.meta).toHaveProperty('skip', 5);
    expect(users.meta).toHaveProperty('take', 10);
    expect(users.data.length).toBe(0);
  });

  it('8. Count 조회시 UserCountDto 구조를 반환한다. ', async () => {
    const count = await service.countUser({});
    expect(count).toHaveProperty('count', 20);
    //
    const count2 = await service.countUser({
      displayName: '',
    });
    expect(count2).toHaveProperty('count', 20);

    const whereCount = await service.countUser({
      displayName: '길동2', // 홍길동2, 홍길동20
    });

    expect(whereCount).toHaveProperty('count', 2);
  });

  it('9. exist 조회시 UserExistsDto 구조를 반환한다.', async () => {
    const exist = await service.existsUser({
      email: 'user3@test.com',
    });
    expect(exist).toHaveProperty('exists', true);

    const notExist = await service.existsUser({
      email: 'aauser3@test.com',
    });
    expect(notExist).toHaveProperty('exists', false);
  });
});
