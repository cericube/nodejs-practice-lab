// tests/modules/postviewstat/postviewstat.route.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../../../src/app';
import { prisma } from '../setup';

// PostViewStatRoute 조회수 통계 API 라우트 테스트
// ------------------------------------------------
// Fastify app.inject()로 실제 HTTP 요청과 비슷하게 라우트를 호출해
// /api/viewstats 아래의 조회수 통계 API가 성공 응답 포맷과 검증 에러 포맷을
// 올바르게 반환하는지 확인합니다.
//
// 테스트 대상 API 함수 흐름:
// 1. GET /api/viewstats/count/sum
//    - controller.getPostViewCountSumByBucketPeriod()
//    - service.getPostViewCountSumByBucketPeriod()
//    - 특정 게시글, 버킷 타입, 기간 조건에 맞는 조회수 합계를 { count }로 반환합니다.
// 2. GET /api/viewstats/count/list
//    - controller.getPostViewCountListByBucketPeriod()
//    - service.getPostViewCountListByBucketPeriod()
//    - 특정 게시글의 기간별 버킷 조회수 목록을 bucketAt ISO 문자열과 viewCount로 반환합니다.
// 3. GET /api/viewstats/top-viewed
//    - controller.getTopViewPostListByBucket()
//    - service.getTopViewPostListByBucket()
//    - 특정 버킷 시점에서 조회수가 높은 게시글을 limit 개수만큼 내림차순으로 반환합니다.
describe('PostViewStatRoute 조회수 통계', () => {
  let app: FastifyInstance;
  let authorId: number;
  let postIds: number[];

  // 테스트에서 공통으로 사용할 작성자와 게시글 3개를 만들고,
  // 실제 라우트 등록이 끝난 Fastify 앱을 준비합니다.
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `postviewstat_route_${Date.now()}@test.com`,
        phoneNumber: `+8210${Date.now().toString().slice(-8)}`,
        displayName: '조회수 통계 라우트 테스트',
      },
    });
    authorId = user.id;

    const posts = [];
    for (let index = 0; index < 3; index++) {
      const post = await prisma.post.create({
        data: {
          authorId,
          title: `조회수 통계 라우트 테스트 게시글 ${index + 1}`,
          content: `조회수 통계 라우트 테스트 본문 ${index + 1}`,
          published: true,
          publishedAt: new Date(),
        },
      });
      posts.push(post);
    }
    postIds = posts.map((post) => post.id);

    app = await createApp();
    await app.ready();
  });

  // 각 테스트는 조회수 통계 데이터만 새로 구성하므로
  // 테스트 간 결과가 섞이지 않도록 PostViewStat 테이블을 비웁니다.
  beforeEach(async () => {
    await prisma.postViewStat.deleteMany();
  });

  // 테스트가 만든 통계, 게시글, 작성자, Fastify 앱 자원을 정리합니다.
  afterAll(async () => {
    await prisma.postViewStat.deleteMany();
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.user.delete({ where: { id: authorId } });
    await app.close();
  });

  // /count/sum API는 postId, bucketType, startAt, endAt을 받아
  // 해당 기간의 조회수 합계를 표준 성공 응답의 body.count에 담아 반환합니다.
  // 이 테스트는 HOURLY 데이터만 합산되고 DAILY 데이터는 제외되는지 함께 검증합니다.
  it('1. /count/sum 요청시 기간 내 조회수 합계를 성공 응답 객체로 반환한다.', async () => {
    await prisma.postViewStat.createMany({
      data: [
        {
          postId: postIds[0],
          bucketType: 'HOURLY',
          bucketAt: new Date('2026-05-19T10:00:00.000Z'),
          viewCount: 3,
        },
        {
          postId: postIds[0],
          bucketType: 'HOURLY',
          bucketAt: new Date('2026-05-19T11:00:00.000Z'),
          viewCount: 7,
        },
        {
          postId: postIds[0],
          bucketType: 'DAILY',
          bucketAt: new Date('2026-05-19T00:00:00.000Z'),
          viewCount: 100,
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url:
        `/api/viewstats/count/sum?postId=${postIds[0]}` +
        '&bucketType=HOURLY' +
        '&startAt=2026-05-19T10:00:00.000Z' +
        '&endAt=2026-05-19T12:00:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    expect(json.body).toEqual({ count: 10 });
  });

  // /count/list API는 postId, bucketType, startAt, endAt을 받아
  // 기간 안에 있는 버킷별 조회수 목록을 시간순으로 반환합니다.
  // 응답의 bucketAt은 API 응답 DTO에 맞춰 ISO 문자열인지 확인합니다.
  it('2. /count/list 요청시 기간별 조회수 목록을 성공 응답 객체로 반환한다.', async () => {
    await prisma.postViewStat.createMany({
      data: [
        {
          postId: postIds[0],
          bucketType: 'DAILY',
          bucketAt: new Date('2026-05-17T00:00:00.000Z'),
          viewCount: 5,
        },
        {
          postId: postIds[0],
          bucketType: 'DAILY',
          bucketAt: new Date('2026-05-18T00:00:00.000Z'),
          viewCount: 8,
        },
        {
          postId: postIds[0],
          bucketType: 'DAILY',
          bucketAt: new Date('2026-05-19T00:00:00.000Z'),
          viewCount: 13,
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url:
        `/api/viewstats/count/list?postId=${postIds[0]}` +
        '&bucketType=DAILY' +
        '&startAt=2026-05-17T00:00:00.000Z' +
        '&endAt=2026-05-20T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toHaveProperty('success', true);
    expect(json.body).toEqual([
      { bucketAt: '2026-05-17T00:00:00.000Z', viewCount: 5 },
      { bucketAt: '2026-05-18T00:00:00.000Z', viewCount: 8 },
      { bucketAt: '2026-05-19T00:00:00.000Z', viewCount: 13 },
    ]);
  });

  // /top-viewed API는 bucketType, bucketAt, limit을 받아
  // 해당 버킷에서 조회수가 높은 게시글을 viewCount 내림차순으로 반환합니다.
  // bucketAt은 repository/service 계층에서 bucketType 기준 시각으로 정규화되어 조회됩니다.
  it('3. /top-viewed 요청시 조회수 상위 게시글 목록을 성공 응답 객체로 반환한다.', async () => {
    const bucketAt = new Date('2026-05-19T00:00:00.000Z');
    await prisma.postViewStat.createMany({
      data: [
        { postId: postIds[0], bucketType: 'DAILY', bucketAt, viewCount: 20 },
        { postId: postIds[1], bucketType: 'DAILY', bucketAt, viewCount: 50 },
        { postId: postIds[2], bucketType: 'DAILY', bucketAt, viewCount: 10 },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url:
        '/api/viewstats/top-viewed?bucketType=DAILY' +
        '&bucketAt=2026-05-19T18:30:00.000Z' +
        '&limit=2',
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toHaveProperty('success', true);
    expect(json.body).toEqual([
      { postId: postIds[1], viewCount: 50 },
      { postId: postIds[0], viewCount: 20 },
    ]);
  });

  // Fastify TypeBox 스키마가 필수 쿼리 파라미터를 검증하는지 확인합니다.
  // bucketType을 누락하면 라우트 핸들러가 실행되기 전에 400 VALIDATION_ERROR가 반환되어야 합니다.
  it('4. 필수 쿼리 값이 없으면 400 에러와 VALIDATION_ERROR 코드를 반환한다.', async () => {
    const response = await app.inject({
      method: 'GET',
      url:
        `/api/viewstats/count/sum?postId=${postIds[0]}` +
        '&startAt=2026-05-19T10:00:00.000Z' +
        '&endAt=2026-05-19T12:00:00.000Z',
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
  });
});
