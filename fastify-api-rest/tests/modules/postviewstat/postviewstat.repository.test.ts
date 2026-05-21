// ./tests/modules/postviewstat/postviewstat.repository.test.ts
//
// Vitest API 사용 흐름
// - describe(): 관련 테스트들을 하나의 그룹으로 묶습니다.
// - it(): 실제 테스트 케이스 하나를 정의합니다. test()와 같은 역할입니다.
// - beforeAll(): 현재 describe 그룹의 모든 테스트 실행 전에 한 번만 실행됩니다.
// - beforeEach(): 각 it() 테스트 실행 전에 매번 실행됩니다.
// - afterEach(): 각 it() 테스트 실행 후에 매번 실행됩니다.
// - afterAll(): 현재 describe 그룹의 모든 테스트 실행 후에 한 번만 실행됩니다.
// - expect(): 실제 결과가 기대 결과와 같은지 검증하는 assertion API입니다.
// - vi(): Vitest의 mocking/spy/timer 유틸입니다. 여기서는 시스템 시간을 고정하는 데 사용합니다.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BucketType,
  PostViewStatRepository,
  truncateUtcDate,
} from '../../../src/modules/postviewstat/postviewstat.repository';
import { prisma } from '../setup';

// describe()는 테스트 스위트(test suite)를 만듭니다.
// 이 블록 안의 beforeAll/beforeEach/afterEach/afterAll은 이 describe 범위에만 적용됩니다.
describe('PostViewStatRepository', () => {
  let authorId: number;
  let postIds: number[];
  const repo = new PostViewStatRepository(prisma);

  // beforeAll()은 이 describe 안의 it()들이 실행되기 전에 딱 한 번 실행됩니다.
  // 여러 테스트가 공통으로 사용하는 사용자/게시글 같은 기준 데이터를 만들 때 적합합니다.
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `postviewstat_${Date.now()}@test.com`,
        phoneNumber: `+8210${Date.now().toString().slice(-8)}`,
        displayName: '조회수 통계 테스트',
      },
    });
    authorId = user.id;

    const posts = [];
    for (let index = 0; index < 4; index++) {
      const post = await prisma.post.create({
        data: {
          authorId,
          title: `조회수 통계 테스트 게시글 ${index + 1}`,
          content: `조회수 통계 테스트 본문 ${index + 1}`,
          published: true,
          publishedAt: new Date(),
        },
      });
      posts.push(post);
    }

    postIds = posts.map((post) => post.id);
  });

  // beforeEach()는 각 it() 실행 직전에 매번 실행됩니다.
  // 테스트 간 데이터 간섭을 막기 위해 조회수 통계 테이블을 비웁니다.
  beforeEach(async () => {
    await prisma.postViewStat.deleteMany();
  });

  // afterEach()는 각 it() 실행 직후 매번 실행됩니다.
  // vi.useFakeTimers()로 바꾼 타이머 설정을 원래 실제 시간으로 되돌립니다.
  // 이렇게 해두면 한 테스트의 fake timer가 다음 테스트에 영향을 주지 않습니다.
  afterEach(() => {
    vi.useRealTimers();
  });

  // afterAll()은 이 describe 안의 모든 it() 실행이 끝난 뒤 한 번 실행됩니다.
  // beforeAll()에서 만든 공통 테스트 데이터를 정리하는 데 사용합니다.
  afterAll(async () => {
    await prisma.postViewStat.deleteMany();
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.user.delete({ where: { id: authorId } });
  });

  // it()은 테스트 케이스 하나를 정의합니다.
  // 첫 번째 인자는 테스트 이름이고, 두 번째 인자는 테스트 본문 함수입니다.
  // DB 작업처럼 Promise를 반환하는 코드는 async 함수를 사용합니다.
  it('1. 게시글 조회수를 현재 UTC 기준 HOURLY/DAILY/MONTHLY 버킷에 생성하고 다시 호출하면 증가시킨다.', async () => {
    const now = new Date('2026-05-19T14:37:25.123Z');

    // vi.useFakeTimers()는 Date, setTimeout 같은 시간 관련 API를 Vitest가 제어하게 만듭니다.
    // vi.setSystemTime()은 new Date()가 반환할 "현재 시각"을 테스트용 값으로 고정합니다.
    // createPostViewStat() 내부에서 new Date()를 사용하므로, 버킷 시간이 흔들리지 않게 고정합니다.
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await repo.createPostViewStat(postIds[0]);
    await repo.createPostViewStat(postIds[0]);

    const stats = await prisma.postViewStat.findMany({
      where: { postId: postIds[0] },
      orderBy: { bucketType: 'asc' },
    });

    // expect()는 실제 값(stats)을 검증합니다.
    // toHaveLength(3)은 배열 길이가 3인지 확인하는 matcher입니다.
    expect(stats).toHaveLength(3);

    // toEqual()은 객체/배열의 구조와 값을 깊게 비교합니다.
    // toBe()가 원시값 또는 같은 참조를 비교하는 것과 다릅니다.
    expect(stats.map((stat) => stat.bucketType).sort()).toEqual([
      BucketType.DAILY,
      BucketType.HOURLY,
      BucketType.MONTHLY,
    ]);

    for (const bucketType of [BucketType.HOURLY, BucketType.DAILY, BucketType.MONTHLY]) {
      const stat = stats.find((row) => row.bucketType === bucketType);

      // toBeDefined()는 값이 undefined가 아닌지 확인합니다.
      expect(stat).toBeDefined();

      // toBe()는 숫자, 문자열, boolean 같은 원시값 비교에 주로 사용합니다.
      expect(stat?.bucketAt.getTime()).toBe(truncateUtcDate(now, bucketType).getTime());
      expect(stat?.viewCount).toBe(2);
    }
  });

  // 각 it()은 독립적으로 읽히는 것이 좋습니다.
  // 그래서 필요한 통계 데이터는 테스트 안에서 직접 준비하고, expect()로 결과만 검증합니다.
  it('2. 지정한 버킷 기간의 조회수 합계를 반환하고 범위 밖 데이터는 제외한다.', async () => {
    await prisma.postViewStat.createMany({
      data: [
        {
          postId: postIds[0],
          bucketType: BucketType.HOURLY,
          bucketAt: new Date('2026-05-19T10:00:00.000Z'),
          viewCount: 3,
        },
        {
          postId: postIds[0],
          bucketType: BucketType.HOURLY,
          bucketAt: new Date('2026-05-19T11:00:00.000Z'),
          viewCount: 7,
        },
        {
          postId: postIds[0],
          bucketType: BucketType.HOURLY,
          bucketAt: new Date('2026-05-19T12:00:00.000Z'),
          viewCount: 11,
        },
        {
          postId: postIds[0],
          bucketType: BucketType.DAILY,
          bucketAt: new Date('2026-05-19T00:00:00.000Z'),
          viewCount: 100,
        },
        {
          postId: postIds[1],
          bucketType: BucketType.HOURLY,
          bucketAt: new Date('2026-05-19T11:00:00.000Z'),
          viewCount: 100,
        },
      ],
    });

    const result = await repo.getPostViewCountSumByBucketPeriod({
      postId: postIds[0],
      bucketType: BucketType.HOURLY,
      startAt: new Date('2026-05-19T10:30:00.000Z'),
      endAt: new Date('2026-05-19T13:00:00.000Z'),
    });

    // repository가 startAt/endAt을 버킷 단위로 자른 뒤
    // gte/lt 조건으로 조회하는지 결과 합계로 검증합니다.
    expect(result).toBe(21);
  });

  it('3. 합산할 조회수 데이터가 없으면 0을 반환한다.', async () => {
    const result = await repo.getPostViewCountSumByBucketPeriod({
      postId: postIds[0],
      bucketType: BucketType.DAILY,
      startAt: new Date('2026-05-01T00:00:00.000Z'),
      endAt: new Date('2026-05-02T00:00:00.000Z'),
    });

    // aggregate 결과가 null인 경우 repository가 0으로 바꾸어 반환하는지 확인합니다.
    expect(result).toBe(0);
  });

  it('4. 지정한 기간의 버킷별 조회수 목록을 bucketAt 오름차순으로 반환한다.', async () => {
    const expected = [
      { bucketAt: new Date('2026-05-17T00:00:00.000Z'), viewCount: 5 },
      { bucketAt: new Date('2026-05-18T00:00:00.000Z'), viewCount: 8 },
      { bucketAt: new Date('2026-05-19T00:00:00.000Z'), viewCount: 13 },
    ];

    await prisma.postViewStat.createMany({
      data: [
        {
          postId: postIds[0],
          bucketType: BucketType.DAILY,
          bucketAt: new Date('2026-05-19T00:00:00.000Z'),
          viewCount: 13,
        },
        {
          postId: postIds[0],
          bucketType: BucketType.DAILY,
          bucketAt: new Date('2026-05-17T00:00:00.000Z'),
          viewCount: 5,
        },
        {
          postId: postIds[0],
          bucketType: BucketType.DAILY,
          bucketAt: new Date('2026-05-18T00:00:00.000Z'),
          viewCount: 8,
        },
        {
          postId: postIds[0],
          bucketType: BucketType.DAILY,
          bucketAt: new Date('2026-05-20T00:00:00.000Z'),
          viewCount: 21,
        },
      ],
    });

    const result = await repo.getPostViewCountsByBucketPeriod({
      postId: postIds[0],
      bucketType: BucketType.DAILY,
      startAt: new Date('2026-05-17T15:00:00.000Z'),
      endAt: new Date('2026-05-20T09:00:00.000Z'),
    });

    // Date 객체가 들어 있는 배열도 toEqual()로 깊은 비교가 가능합니다.
    // Prisma가 반환한 Date 값과 expected의 Date 값이 같은 시각이면 통과합니다.
    expect(result).toEqual(expected);
  });

  it('5. 특정 버킷 시점의 조회수 상위 게시글을 조회수 내림차순, postId 오름차순으로 반환한다.', async () => {
    const bucketAt = new Date('2026-05-19T00:00:00.000Z');

    await prisma.postViewStat.createMany({
      data: [
        { postId: postIds[0], bucketType: BucketType.DAILY, bucketAt, viewCount: 20 },
        { postId: postIds[1], bucketType: BucketType.DAILY, bucketAt, viewCount: 50 },
        { postId: postIds[2], bucketType: BucketType.DAILY, bucketAt, viewCount: 50 },
        { postId: postIds[3], bucketType: BucketType.DAILY, bucketAt, viewCount: 10 },
        {
          postId: postIds[0],
          bucketType: BucketType.DAILY,
          bucketAt: new Date('2026-05-18T00:00:00.000Z'),
          viewCount: 100,
        },
        {
          postId: postIds[1],
          bucketType: BucketType.MONTHLY,
          bucketAt: new Date('2026-05-01T00:00:00.000Z'),
          viewCount: 100,
        },
      ],
    });

    const result = await repo.getTopViewPostListByBucket({
      bucketType: BucketType.DAILY,
      date: new Date('2026-05-19T18:30:00.000Z'),
      limit: 3,
    });

    // 조회수 동률일 때 postId 오름차순으로 정렬되는지까지 배열 순서로 검증합니다.
    expect(result).toEqual([
      { postId: postIds[1], viewCount: 50 },
      { postId: postIds[2], viewCount: 50 },
      { postId: postIds[0], viewCount: 20 },
    ]);
  });

  it('6. 상위 게시글 조회 limit이 1보다 작으면 최소 1개를 조회한다.', async () => {
    const bucketAt = new Date('2026-05-01T00:00:00.000Z');

    await prisma.postViewStat.createMany({
      data: [
        { postId: postIds[0], bucketType: BucketType.MONTHLY, bucketAt, viewCount: 1 },
        { postId: postIds[1], bucketType: BucketType.MONTHLY, bucketAt, viewCount: 2 },
      ],
    });

    const result = await repo.getTopViewPostListByBucket({
      bucketType: BucketType.MONTHLY,
      date: new Date('2026-05-19T00:00:00.000Z'),
      limit: 0,
    });

    // limit이 0이어도 repository 내부에서 Math.max(limit, 1)을 적용하므로 1개만 반환됩니다.
    expect(result).toEqual([{ postId: postIds[1], viewCount: 2 }]);
  });
});
