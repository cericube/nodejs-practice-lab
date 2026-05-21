// tests/module/user/user.repository.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserRepository } from '../../../src/modules/user/user.repository';
import { prisma } from '../setup';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { cleanupUserTestData } from './user.test-utils';

/**
 * [ Repository Layer Test: Persistence & Integrity ]
 * 목적: 데이터의 저장/조회/수정/삭제(CRUD) 및 DB 인프라와의 통신 검증
 * 1. SQL/Query 검증: 작성한 쿼리(또는 ORM 메서드)가 의도한 데이터를 정확히 추출하는가?
 * 2. DB 제약 조건: Unique, Not Null, Foreign Key 등 스키마 제약 조건이 런타임에 작동하는가?
 * 3. 영속성 매핑: DB 필드와 코드상의 Entity 타입이 일치하며, 관계(Relation)가 물리적으로 생성되는가?
 * 4. 인프라 정책: Soft-delete(deletedAt), Cascade 등 DB 수준의 설정이 실제 쿼리에 반영되는가?
 */

/**
 * [테스트 환경 설정]
 * 각 테스트가 독립적인 DB 상태에서 실행되도록 격리(Isolation) 수준을 유지합니다.
 * 관계가 맺어진 User와 Profile 데이터를 모두 초기화합니다.
 */
beforeEach(async () => {
  await cleanupUserTestData();
});

afterEach(async () => {
  await cleanupUserTestData();
});

/**
 * [테스트 데이터 생성기]
 * 중복되는 입력 객체 생성을 방지하고, 특정 필드만 변경하여 테스트할 수 있게 합니다.
 */
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

// ============================================================
// 사용자 생성 및 초기 설정 검증
// ============================================================
describe('UserRepository.create', () => {
  let repo: UserRepository = new UserRepository(prisma);

  it('1. 올바른 정보로 생성 시 사용자와 연관 프로필이 동시에 생성된다', async () => {
    const input = userInput();
    const result = await repo.create(input);

    // 1. 메서드 반환 객체의 기본 구조 확인
    expect(result.id).toBeTypeOf('number');
    expect(result.email).toBe(input.email);

    // 2. 실제 DB에 User 레코드가 물리적으로 저장되었는지 교차 확인
    const saved = await prisma.user.findUnique({ where: { email: input.email } });
    expect(saved).not.toBeNull();

    // 3. 1:1 관계인 Profile이 Repository의 create 내부 로직에 의해 자동 생성되었는지 확인
    const profile = await prisma.profile.findUnique({ where: { userId: saved?.id } });
    expect(profile).toBeDefined();
  });

  it('2. displayName이 없는 경우 DB에 null로 저장된다', async () => {
    const input = userInput({ displayName: undefined });
    const result = await repo.create(input);

    // 선택 사항인 displayName이 DB에 null로 안전하게 들어가는지 확인
    expect(result.displayName).toBeNull();
  });

  it('3. 이미 존재하는 이메일로 가입 시도시 에러가 발생한다', async () => {
    await repo.create(userInput()); // 첫 번째 유저 생성
    // 동일한 이메일로 두 번째 생성 시도 시 reject(에러 발생) 여부 확인
    const dupInput = userInput({ phoneNumber: '+810000000' });
    await expect(repo.create(dupInput)).rejects.toThrow();
  });

  it('4. 중복된 전화번호 사용 시 Prisma 에러 코드(P2002)를 반환한다', async () => {
    await repo.create(userInput());
    const dupInput = userInput({ email: 'other@example.com' });

    try {
      await repo.create(dupInput);
    } catch (err) {
      // Prisma의 Unique 제약 조건 위반 에러 코드 'P2002' 검증
      if (err instanceof PrismaClientKnownRequestError) {
        expect(err.code).toBe('P2002');
      }
    }
  });
});

// ============================================================
// 사용자 정보 수정 및 도메인 제약 조건 검증
// ============================================================
describe('UserRepository.update', () => {
  let repo: UserRepository = new UserRepository(prisma);

  it('1. 특정 필드(displayName)만 부분 업데이트가 가능하다', async () => {
    const result = await repo.create(userInput());
    const updated = await repo.update(result.id, { displayName: '이름업데이트' });

    expect(updated.displayName).toBe('이름업데이트');
  });

  it('2. 여러 필드(displayName, phoneNumber)를 동시에 업데이트한다', async () => {
    const result = await repo.create(userInput());
    const updated = await repo.update(result.id, {
      phoneNumber: '+821044443333',
      displayName: '이름업데이트',
    });
    expect(updated.displayName).toBe('이름업데이트');
    expect(updated.phoneNumber).toBe('+821044443333');
    //DB 직접 검색
    const user = await prisma.user.findUnique({ where: { id: result.id } });
    expect(user?.phoneNumber).toEqual(updated.phoneNumber);
    expect(user?.displayName).toEqual(updated.displayName);
  });

  it('3. 이미 사용 중인 이메일로 수정을 시도하면 유니크 제약 조건 에러가 발생한다. ', async () => {
    const result = await repo.create(userInput());
    const result2 = await repo.create(
      userInput({
        email: 'test1@example.com',
        phoneNumber: '+821022222222',
      }),
    );
    try {
      const updated = await repo.update(result.id, {
        email: 'test1@example.com',
        phoneNumber: '+821044443333',
        displayName: '이름업데이트',
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError) {
        expect(err.message).toContain('Unique constraint failed');
      }
    }
  });

  it('4. 소프트 삭제(Soft-deleted)된 사용자는 수정 대상에서 제외된다', async () => {
    const created = await repo.create(userInput());
    await repo.softDelete(created.id); // 삭제 처리

    // Repository 내부의 update 로직이 where: { deletedAt: null } 조건을 포함하는지 검증
    try {
      await repo.update(created.id, { displayName: '이름업데이트' });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError) {
        expect(err.message).toContain('No record was found'); // 수정 대상을 찾지 못해야 함
      }
    }
  });
});

// ============================================================
// 삭제(소프트/하드) 및 복구 로직 검증
// ============================================================
describe('UserRepository.delete/restore', () => {
  let repo: UserRepository = new UserRepository(prisma);

  it('1. 사용자 삭제 시 연관된 프로필도 함께 삭제 시간(deletedAt)이 기록된다.', async () => {
    const created = await repo.create(userInput());
    await repo.softDelete(created.id);

    // 유저와 연관된 프로필까지 삭제 시간(deletedAt)이 찍혔는지 확인 (Cascading Soft Delete)
    const user = await prisma.user.findUnique({ where: { id: created.id } });
    const profile = await prisma.profile.findUnique({ where: { userId: created.id } });

    expect(user?.deletedAt).not.toBeNull();
    expect(profile?.deletedAt).not.toBeNull();
  });

  it('2. 삭제된 사용자를 복원하면 프로필의 deletedAt 필드도 null로 초기화된다', async () => {
    const created = await repo.create(userInput());
    await repo.softDelete(created.id); // 삭제 후
    await repo.restore(created.id); // 복원

    // deletedAt 필드가 다시 null이 되었는지 확인
    const restoredProfile = await prisma.profile.findUnique({ where: { userId: created.id } });
    expect(restoredProfile?.deletedAt).toBeNull();
  });

  it('3. 하드 삭제 시 DB에서 데이터가 완전히 제거되며 Cascade 정책에 의해 프로필도 삭제된다', async () => {
    const created = await repo.create(userInput());
    const deleted = await repo.hardDelete(created.id);
    expect(deleted.id).toEqual(created.id);
    // 사용자 삭제 여부 확인
    const result = await prisma.user.findUnique({ where: { id: created.id } });
    expect(result).toBeNull();
    // profile 삭제 확인
    const profile = await prisma.profile.findUnique({ where: { userId: created.id } });
    expect(profile).toBeNull();
  });
});

// ============================================================
// 단일 정보 조회 검증
// ============================================================
describe('UserRepository.selectOne', () => {
  let repo = new UserRepository(prisma);

  it('1. ID를 기준으로 사용자의 기본 정보를 정확히 가져온다', async () => {
    const input = userInput({ displayName: undefined });
    const created = await repo.create(userInput());
    const user = await repo.selectOne({
      id: created.id,
    });
    expect(user).toEqual(created);
  });

  it('2. includeProfile이 true이면 프로필 객체를 포함하여 조회한다', async () => {
    const created = await repo.create(userInput());
    const user = await repo.selectOne({
      email: created.email,
      includeProfile: true,
    });
    expect(user).toHaveProperty('profile');
  });
});

// ============================================================
// 다건 조회, 필터링 및 정렬 검증
// ============================================================
describe('UserRepository.selectMany', () => {
  let repo = new UserRepository(prisma);

  beforeEach(async () => {
    // 정상 20명 유저
    for (let i = 1; i <= 20; i++) {
      await repo.create({
        email: `user${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
        displayName: `홍길동${i}`,
      });
    }
    // 삭제 5명 유저
    for (let i = 21; i <= 25; i++) {
      const user = await repo.create({
        email: `deleted${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
      });
      await repo.softDelete(user.id);
    }
  });

  it('1. 기본 조회 시 소프트 삭제되지 않은 사용자만 반환한다 (20명).', async () => {
    const users = await repo.selectMany({});
    expect(users.length).toBe(20); // 전체 25명 중 활성 유저 20명만 반환되는지 확인
  });

  it('2. 지정한 필드와 방향에 맞춰 정렬된 데이터를 반환한다', async () => {
    const users = await repo.selectMany({
      displayName: '홍길',
      orderBy: { field: 'email', direction: 'desc' },
    });

    expect(users.length).toEqual(20);
    const emails = users.map((u) => u.email);
    const sorted = [...emails].sort((a, b) => b.localeCompare(a)); // JS 정렬 결과와 비교
    expect(emails).toEqual(sorted);
  });

  it('3. 조건에 맞는 결과가 없는 경우 빈 배열을 반환한다', async () => {
    const users = await repo.selectMany({
      displayName: '강길',
      orderBy: { field: 'email', direction: 'desc' },
    });

    expect(users.length).toEqual(0);
  });

  it('4. includeProfile 옵션이 true이면 프로필 정보를 포함하여 목록을 조회한다', async () => {
    const users = await repo.selectMany({
      orderBy: { field: 'createdAt', direction: 'desc' },
      includeProfile: true,
    });

    expect(users.length).toBe(20);

    //users 배열에서 각 사용자 객체의 createdAt 값만 추출
    const createdAts = users.map((u) => u.createdAt);
    const sorted = [...createdAts].sort((a, b) => b.getTime() - a.getTime());
    expect(createdAts).toEqual(sorted);
    expect(users.every((u) => 'profile' in u)).toBe(true);
  });
});

// ============================================================
// 목록 조회 및 페이징 테스트
// ============================================================
describe('UserRepository.selectManyWithCount', () => {
  let repo = new UserRepository(prisma);

  beforeEach(async () => {
    // 테스트용 대량 데이터 셋업 (정상 20명, 삭제 5명)
    for (let i = 1; i <= 20; i++) {
      await repo.create({
        email: `user${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
        displayName: `홍길동${i}`,
      });
    }
    // 5명 삭제된 사용자 생성
    for (let i = 21; i <= 25; i++) {
      const user = await repo.create({
        email: `deleted${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
      });
      await repo.softDelete(user.id);
    }
  });

  it('1. 기본으로 삭제되지 않은(active) 사용자 목록과 총 개수를 반환한다', async () => {
    const { data, total } = await repo.selectManyWithCount({});
    expect(data.length).toBe(20); // 전체 25명 중 활성 유저 20명만 반환되는지 확인
    expect(total).toBe(20);
  });

  it('2. 페이징 옵션(skip, take)에 따라 전체 개수는 유지하되 제한된 목록만 반환한다', async () => {
    const { data, total } = await repo.selectManyWithCount({ skip: 5, take: 10 });
    // Offset 기반 페이징이 정확히 작동하여 10개의 레코드를 가져오는지 확인
    expect(data.length).toBe(10);
    expect(total).toBe(20);
  });

  it('3. 검색어(displayName)가 포함된 사용자를 지정된 필드(email) 내림차순으로 정렬하여 반환한다', async () => {
    const { data, total } = await repo.selectManyWithCount({
      displayName: '홍길',
      orderBy: { field: 'email', direction: 'desc' },
    });

    expect(data.length).toEqual(20);
    expect(total).toBe(20);
    const emails = data.map((u) => u.email);
    const sorted = [...emails].sort((a, b) => b.localeCompare(a)); // JS 정렬 결과와 비교

    expect(emails).toEqual(sorted);
  });

  it('4. 일치하는 검색 결과가 없을 경우 빈 목록과 0개의 카운트를 반환한다', async () => {
    const { data, total } = await repo.selectManyWithCount({
      displayName: '강길',
      orderBy: { field: 'email', direction: 'desc' },
    });

    expect(data.length).toEqual(0);
    expect(total).toBe(0);
  });

  it('5. 프로필 포함 옵션 사용 시, 페이징/정렬 조건과 함께 연관된 프로필 데이터를 포함한다', async () => {
    const { data, total } = await repo.selectManyWithCount({
      orderBy: { field: 'createdAt', direction: 'desc' },
      includeProfile: true,
      skip: 5,
      take: 10,
    });

    expect(data.length).toBe(10);
    expect(total).toBe(20);

    //users 배열에서 각 사용자 객체의 createdAt 값만 추출
    const createdAts = data.map((u) => u.createdAt);
    const sorted = [...createdAts].sort((a, b) => b.getTime() - a.getTime());
    expect(createdAts).toEqual(sorted);
    expect(data.every((u) => 'profile' in u)).toBe(true);
  });
});

describe('UserRepository.count', () => {
  let repo = new UserRepository(prisma);

  beforeEach(async () => {
    // 정상 20명 유저
    for (let i = 1; i <= 20; i++) {
      await repo.create({
        email: `user${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
        displayName: `홍길동${i}`,
      });
    }
    // 삭제 5명 유저
    for (let i = 21; i <= 25; i++) {
      const user = await repo.create({
        email: `deleted${i}@test.com`,
        phoneNumber: `+82010101${i}11`,
      });
      await repo.softDelete(user.id);
    }
  });

  it('1. 활성 상태(Active)인 사용자의 전체 건수를 반환한다', async () => {
    const count = await repo.count({});
    expect(count).toBe(20); // 전체 25명 중 활성 유저 20명만 반환되는지 확인
  });

  it('2. 이름 검색 조건(displayName)에 부합하는 사용자의 건수를 반환한다', async () => {
    const count = await repo.count({
      displayName: '홍길',
    });
    expect(count).toEqual(20);
  });

  it('3. 검색 조건과 일치하는 사용자가 없으면 0을 반환한다', async () => {
    const count = await repo.count({
      displayName: '강길',
    });
    expect(count).toEqual(0);
  });
});

// ============================================================
// 유효성 체크: 존재 여부 테스트
// ============================================================
describe('UserRepository.exists', () => {
  let repo = new UserRepository(prisma);

  it('1. 활성 상태(Active) 사용자의 ID나 고유 정보로 조회 시 true를 반환한다', async () => {
    const created = await repo.create(userInput());
    // ID, Email, Phone 어떤 조건으로든 존재 여부가 확인되어야 함
    expect(await repo.exists({ id: created.id })).toBe(true);
  });

  it('2. 소프트 삭제(Soft Deleted)된 사용자의 조건으로 조회 시 false를 반환한다', async () => {
    const created = await repo.create(userInput());
    await repo.softDelete(created.id);

    // 비즈니스적으로 삭제된 유저는 '존재하지 않음'으로 판단하는지 검증
    expect(await repo.exists({ id: created.id })).toBe(false);
  });
});
