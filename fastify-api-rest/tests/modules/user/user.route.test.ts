// tests/module/user/user.route.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../../../src/app';
import { Response } from 'light-my-request';
import { cleanupUserTestData } from './user.test-utils';

/**
 * [ User Route Test: Interface & Integration Layer ]
 * 목적: 외부 클라이언트와의 통신 규약(API Specification) 및 통합 흐름 검증
 * 1. HTTP 프로토콜: 적절한 메서드(GET/POST 등)와 상태 코드(200/400/404/409) 반환 여부 확인
 * 2. 입력 유효성(Validation): 잘못된 요청 본문(Body)이나 쿼리 파라미터 차단 및 에러 메시지 검증
 * 3. 응답 캡슐화: 공통 응답 구조(success, body, code) 준수 및 DTO 직렬화 상태 확인
 * 4. 엔드투엔드(E2E): HTTP 요청 진입부터 DB 처리 후 최종 응답까지의 전체 사이클 통합 검증
 * 5. 경로 처리: 동적 경로(/users/:id) 및 특수 경로(/restore)의 라우팅 매핑 확인
 */

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await createApp();
  await app.ready();
});

beforeEach(async () => {
  await cleanupUserTestData();
});

afterAll(async () => {
  await cleanupUserTestData();
  if (app) await app.close();
});

describe('UserRoute - 사용자 입력 테스트 ', () => {
  it('1. 올바른 정보를 입력하면 새로운 사용자를 생성한다', async () => {
    const email = 'test1@example.com';
    const phoneNumber = '+821012341234';
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: email,
        phoneNumber: phoneNumber,
      },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toHaveProperty('success', true); //처리 결과
    expect(json).toHaveProperty('body'); //응답 body
    expect(json.body).toHaveProperty('id');
    expect(json.body).toHaveProperty('email', email);
    expect(json.body).toHaveProperty('phoneNumber', phoneNumber);
    expect(json.body).toHaveProperty('displayName', null);
    expect(json.body).toHaveProperty('createdAt');
    expect(json.body).toHaveProperty('updatedAt');
    expect(isDateTime(json.body.createdAt)).toBe(true);
    expect(isDateTime(json.body.updatedAt)).toBe(true);
  });

  it('2. 필수 필드(phoneNumber)가 누락되면 400 에러를 반환한다. ', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: 'test1@example.com',
      },
    });
    //1. 입력 형식 검증 에러
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('3. 유효하지 않은 전화번호 형식 입력 시 400 에러를 반환한다. ', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: 'test1@example.com',
        phoneNumber: '+8821244ㅈ21',
      },
    });
    //1. 포맷 에러
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
  });

  it('4. 이미 가입된 이메일로 등록 시도 시 409 에러를 반환한다. ', async () => {
    const email = 'test1@example.com';
    const phoneNumber = '+821012341234';
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: email,
        phoneNumber: phoneNumber,
      },
    });
    //1. 정상 등록확인
    expect(res.statusCode).toBe(200);
    //
    const dupEmail = 'test1@example.com';
    const dupPhoneNumber = '+821012341234';
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: dupEmail,
        phoneNumber: dupPhoneNumber,
      },
    });

    //2. 중복 등록 test
    expect(dupRes.statusCode).toBe(409);
    const dupJson = dupRes.json();
    expect(dupJson.success).toBe(false);
    expect(dupJson.code).toBe('ALREADY_EXISTS');
  });

  it('5. 존재하지 않는 API 엔드포인트 요청 시 404 에러를 반환한다 ', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user/',
      payload: {
        email: 'test1@example.com',
        phoneNumber: '+821012341234',
      },
    });
    //장못된 URL
    expect(res.statusCode).toBe(404);
    const dupJson = res.json();
    expect(dupJson.success).toBe(false);
    expect(dupJson.code).toBe('NOT_FOUND');
  });
});

describe('UserRoute - 사용자 정보 업데이트 테스트 ', () => {
  //
  it('1. 유효한 ID와 변경 정보로 요청 시 사용자 정보를 갱신한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: 'test@example.com',
        phoneNumber: '+821012341234',
      },
    });
    //1. 정상 등록확인
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.body.id).toBeDefined();
    //
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/users/${json.body.id}`,
      payload: {
        email: 'test22@example.com',
        displayName: '업 사용자',
      },
    });
    expect(updated.statusCode).toBe(200);
    const updatedJson = updated.json();
    expect(updatedJson.body.email).toEqual('test22@example.com');
    expect(updatedJson.body.displayName).toEqual('업 사용자');
    expect(updatedJson.body).toHaveProperty('createdAt');
    expect(updatedJson.body).toHaveProperty('updatedAt');

    expect(updatedJson.body.createdAt).toEqual(json.body.createdAt);
    expect(updatedJson.body.updatedAt).not.toEqual(json.body.updatedAt);
  });

  it('2. 존재하지 않는 사용자 ID로 업데이트 요청 시 404 에러를 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: 'test@example.com',
        phoneNumber: '+821012341234',
      },
    });
    //1. 정상 등록확인
    expect(res.statusCode).toBe(200);
    const json = res.json();
    //
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/users/1`,
      payload: {
        email: 'test22@example.com',
        displayName: '업 사용자',
      },
    });
    // 2. 존재하지 ID 업데이트 시도.
    expect(updated.statusCode).toBe(404);
    const updatedJson = updated.json();
    expect(updatedJson.success).toBe(false);
    expect(updatedJson.code).toBe('NOT_FOUND');
  });

  it('3. 유효하지 않은 형식(전화번호 등)으로 수정 시도 시 400 에러를 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: 'test@example.com',
        phoneNumber: '+821012341234',
      },
    });
    //1. 정상 등록확인
    expect(res.statusCode).toBe(200);
    const json = res.json();
    //
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/users/${json.body.id}`,
      payload: {
        //email: 'test22example.com',
        phoneNumber: '+88101010348',
        displayName: '업 사용자',
      },
    });
    // 2. 이메일/폰 번호 형식이 잘모되었음
    expect(updated.statusCode).toBe(400);
    const updatedJson = updated.json();
    expect(updatedJson.success).toBe(false);
    expect(updatedJson.code).toBe('VALIDATION_ERROR');
  });
});

describe('UserRoute - 사용자 정보 조회 테스트', () => {
  // 사용자를 등록한다.
  // beforeEach가 sync 함수이면
  // 테스트 러너는 해당 Promise가 resolve될 때까지 기다린 후 it을 실행합니다.
  let created: Response;

  beforeEach(async () => {
    created = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: {
        email: 'test@example.com',
        phoneNumber: '+821012341234',
      },
    });
    expect(created.statusCode).toBe(200); // 생성 실패 조기 탐지
  });

  it('1. 유효한 ID로 조회 시 가입 정보와 일치하는 사용자를 반환한다. ', async () => {
    const createdJson = created.json();
    const user = await app.inject({
      method: 'GET',
      url: `/api/users?id=${createdJson.body.id}`,
    });
    expect(user.statusCode).toEqual(200);
    const userJson = user.json();
    expect(createdJson).toEqual(userJson);
  });

  it('2. 이메일과 profile 포함 옵션(includeProfile) 요청 시 프로필 정보를 함께 반환한다. ', async () => {
    const createdJson = created.json();
    const user = await app.inject({
      method: 'GET',
      url: `/api/users?email=${createdJson.body.email}&includeProfile=true`,
    });
    expect(user.statusCode).toEqual(200);
    const userJson = user.json();
    expect(userJson).toHaveProperty('success', true);
    expect(userJson.body).toHaveProperty('profile');
  });

  it('3. 복합 조건(이메일, 전화번호) 조회 시 우선순위에 따라 검색 결과를 반환한다. ', async () => {
    const createdJson = created.json();
    const user = await app.inject({
      method: 'GET',
      url: `/api/users?email=${createdJson.body.email}&phoneNumber=${createdJson.body.phoneNumber}&includeProfile=false`,
    });
    expect(user.statusCode).toEqual(200);
    const userJson = user.json();
    expect(createdJson).toEqual(userJson);
  });

  it('4.허용되지 않은 검색 파라미터로 조회 시 400 에러를 반환한다. ', async () => {
    const createdJson = created.json();
    const user = await app.inject({
      method: 'GET',
      url: `/api/users?email2=${createdJson.body.email}`,
    });
    expect(user.statusCode).toEqual(400);
    const userJson = user.json();
    expect(userJson.code).toEqual('VALIDATION_ERROR');
  });
});

describe('UserRoute - Soft 삭제, 복구 요청/응답 구조 테스트', () => {
  let created: Response;

  beforeEach(async () => {
    created = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: {
        email: 'test@example.com',
        phoneNumber: '+821012341234',
      },
    });
    //1. 정상 등록확인
    expect(created.statusCode).toBe(200);
  });

  it('1.사용자 삭제(Soft Delete) 후 조회 시 404 에러를 반환한다.', async () => {
    const createdJson = created.json();
    //1. 삭제
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/users/${createdJson.body.id}`,
    });

    expect(deleted.statusCode).toBe(200);
    const deletedJson = deleted.json();

    expect(deletedJson.body).toHaveProperty('id', createdJson.body.id);
    expect(deletedJson.body.updatedAt).not.toEqual(createdJson.body.updatedAt);

    // 삭제 사용자 정보 조회 요청
    const user = await app.inject({
      method: 'GET',
      url: `/api/users?id=${deletedJson.body.id}`,
    });
    expect(user.statusCode).toBe(404);
    const userJson = user.json();
    expect(userJson).toHaveProperty('success', false);
    expect(userJson.code).toEqual('NOT_FOUND');
  });

  it('2. 삭제된 사용자를 복구(Restore)하면 다시 조회가 가능하다.', async () => {
    const createdJson = created.json();
    //1. 삭제
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/users/${createdJson.body.id}`,
    });

    expect(deleted.statusCode).toBe(200);

    //2. 복구
    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/users/${createdJson.body.id}/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const restoredJson = restored.json();
    expect(restoredJson).toHaveProperty('success', true);

    // 3. 복구 조회 해 보기
    const user = await app.inject({
      method: 'GET',
      url: `/api/users?id=${restoredJson.body.id}`,
    });
    expect(user.statusCode).toBe(200);
    const userJson = user.json();
    expect(userJson).toHaveProperty('success', true);
  });
});

async function makeUsers() {
  // 정상 20명 유저
  for (let i = 10; i <= 29; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: `user${i}@test.com`,
        phoneNumber: `+82101234${i}34`,
        displayName: `홍길동${i}`,
      },
    });
    expect(res.statusCode).toEqual(200);
  }
  // // 삭제 5명 유저/
  for (let i = 41; i <= 45; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users/',
      payload: {
        email: `deleted${i}@test.com`,
        phoneNumber: `+82102101${i}22`,
      },
    });
    expect(res.statusCode).toEqual(200);
    const json = res.json();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/users/${json.body.id}`,
    });
    expect(deleted.statusCode).toEqual(200);
  }
}

describe('UserRoute - Count/Exist 테스트 ', () => {
  beforeEach(async () => {
    await makeUsers();
  });

  it('1. 조건에 맞는 사용자의 총 인원수(Count)를 정확히 반환한다. ', async () => {
    const countResult = await app.inject({
      method: 'GET',
      url: '/api/users/count?displayName=길동',
    });
    expect(countResult.statusCode).toBe(200);
    const json = countResult.json();
    expect(json.success).toBe(true);
    expect(json.body.count).toBe(20);

    // 결과 없을때
    const rs = await app.inject({
      method: 'GET',
      url: '/api/users/count?displayName=ㅁ길동',
    });
    expect(rs.statusCode).toBe(200);
    const jsonZero = rs.json();
    expect(jsonZero.success).toBe(true);
    expect(jsonZero.body.count).toBe(0);
  });

  it('2. 특정 조건(이메일 등)을 만족하는 사용자의 존재 여부(exists)를 확인한다. ', async () => {
    const one = await app.inject({
      method: 'GET',
      url: `/api/users/exists?email=user21@test.com`,
    });

    expect(one.statusCode).toBe(200);
    const oneJson = one.json();
    expect(oneJson.success).toBe(true);
    expect(oneJson.body.exists).toBe(true);
  });

  it('3. 유효하지 않은 옵션(includeProfile)이 포함되어도 이를 무시하고 정상 응답한다.', async () => {
    const one = await app.inject({
      method: 'GET',
      url: `/api/users/exists?email=user21@test.com&includeProfile=true`,
    });

    expect(one.statusCode).toBe(200);
    const oneJson = one.json();
    expect(oneJson.success).toBe(true);
    expect(oneJson.body.exists).toBe(true);
  });
});

describe('사용자 목촉 조회 테스트.', () => {
  beforeEach(async () => {
    await makeUsers();
  });

  it('1. 사용자 목록 기본 조회 시 요약된 정보(Array)를 반환한다.', async () => {
    const users = await app.inject({
      method: 'GET',
      url: '/api/users/list',
    });

    const usersJson = users.json();
    expect(users.statusCode).toBe(200);
    expect(usersJson.success).toEqual(true);
    expect(usersJson).toHaveProperty('body');
    expect(usersJson.body).toHaveProperty('data');
    expect(usersJson.body.data).toBeInstanceOf(Array);
    expect(usersJson.body.data[0]).toHaveProperty('id');
    expect(usersJson.body.data[0]).not.toHaveProperty('profile'); //상세 정보 아님
  });

  it('2. 페이징 파라미터 적용 시 조건에 맞는 데이터와 메타데이터를 반환한다.', async () => {
    const users = await app.inject({
      method: 'GET',
      url: '/api/users/list?skip=1&take=5&includeProfile=true',
    });
    const usersJson = users.json();
    expect(users.statusCode).toBe(200);
    expect(usersJson.success).toEqual(true);
    expect(usersJson).toHaveProperty('body');
    expect(usersJson.body).toHaveProperty('data');
    expect(usersJson.body.data).toBeInstanceOf(Array);
    expect(usersJson.body.data[0]).toHaveProperty('id');
    expect(usersJson.body.data[0]).toHaveProperty('profile'); //상세 정보 포함
    expect(usersJson.body.meta).toHaveProperty('total', 20);
    expect(usersJson.body.meta).toHaveProperty('skip', 1);
    expect(usersJson.body.meta).toHaveProperty('take', 5);
  });
});
