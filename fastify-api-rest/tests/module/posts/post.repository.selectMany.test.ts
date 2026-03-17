import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { PostRepository } from '../../../src/modules/post/post.repository';
import { prisma } from '../setup';
import { seedUsers, seedPosts } from './post.seed';
import type { User, Post } from '../../../src/generated/client';

function assertSorted<T>(arr: T[], cmp: (a: T, b: T) => number) {
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i];
    const b = arr[i + 1];
    const r = cmp(a, b); //(a, b) => b.id - a.id
    //
    // 원하는 sort 가 아니면 에러
    if (r > 0) {
      throw new Error(`Not sorted at index ${i}`);
    }
  }
}

let globalUsers: User[] = [];
let globalPosts: Post[] = [];

let testUserId: number;
beforeAll(async () => {
  // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();

  globalUsers = await seedUsers();
  globalPosts = await seedPosts(globalUsers);
  testUserId = globalUsers[0].id;
});

afterAll(async () => {
  // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();
});

describe('PostRepository.selectMany: 기본동작/Sort 검증', () => {
  const repo = new PostRepository(prisma);

  it('1.페이지 옵션을 주지 않으면 최신순으로 take+1(기본 10+1)개를 조회한다', async () => {
    const posts = await repo.selectMany({});
    // 기본 take 값 + 1 개가 조회 되어야 함
    expect(posts.length).toEqual(11);
    // 최신순(id desc) b < a 이어야 한다.
    assertSorted(posts, (a, b) => b.id - a.id);
    // 결과 구조 확인
    const post = posts[0];
    expect(post).not.toHaveProperty('content');
    expect(post).not.toHaveProperty('updatedAt');
    expect(post).not.toHaveProperty('publishedAt');
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('title');
    expect(post).toHaveProperty('published');
    //
    expect(post).toHaveProperty('author');
    expect(post.author).toHaveProperty('id');
    expect(post.author).toHaveProperty('displayName');

    expect(post).toHaveProperty('createdAt');
    //
    expect(post).toHaveProperty('viewCount');
    expect(post).toHaveProperty('likeCount');
    expect(post).toHaveProperty('replyCount');
  });

  it('2.take=1로 조회하면 take+1(2)개를 최신순으로 반환한다', async () => {
    const posts = await repo.selectMany({ page: { take: 1 } });
    // 기본 take 값 + 1 개가 조회 되어야 함
    expect(posts.length).toEqual(2);
    // 최신순(id desc) b < a 이어야 한다.
    assertSorted(posts, (a, b) => b.id - a.id);
  });

  it('3.take가 전체 데이터 수보다 크면 전체 데이터를 최신순으로 반환한다', async () => {
    const posts = await repo.selectMany({ page: { take: 100 } }); //
    // 기본 take 값 + 1 개가 조회 되어야 함
    expect(posts.length).toEqual(30); // 전체 데이터는 30이다.
    // 최신순(id desc) b < a 이어야 한다.
    assertSorted(posts, (a, b) => b.id - a.id);
  });

  it('4.sort=latest로 조회하면 id 내림차순으로 take+1개를 반환한다', async () => {
    const posts = await repo.selectMany({
      page: {
        take: 10,
        sort: 'latest',
      },
    }); //
    expect(posts.length).toEqual(11); // take+1
    // 최신순(id desc) b < a 이어야 한다.
    assertSorted(posts, (a, b) => b.id - a.id);
  });

  it('5.sort=oldest로 조회하면 id 오름차순으로 take+1개를 반환한다', async () => {
    const posts = await repo.selectMany({
      page: {
        take: 5,
        sort: 'oldest',
      },
    });
    expect(posts.length).toEqual(6);
    // id 기준 asc
    assertSorted(posts, (a, b) => a.id - b.id);
  });

  it('6.sort=mostViewed로 조회하면 viewCount 내림차순(동률이면 id 내림차순)으로 take+1개를 반환한다', async () => {
    const posts = await repo.selectMany({
      page: {
        take: 20,
        sort: 'mostViewed',
      },
    });
    expect(posts.length).toEqual(21);
    // viewCount가 desc순 이어야 한다.
    assertSorted(posts, (a, b) => b.viewCount - a.viewCount);

    // 동일한 viewCont이면 id desc여야 한다.
    const viewCount = posts[0].viewCount;
    const filteredPost = posts.filter((post) => post.viewCount === viewCount);
    assertSorted(filteredPost, (a, b) => b.id - a.id);
  });

  it('7.sort=mostLiked로 조회하면 likeCount 내림차순(동률이면 id 내림차순)으로 take+1개를 반환한다', async () => {
    const posts = await repo.selectMany({
      page: {
        take: 20,
        sort: 'mostLiked',
      },
    });
    expect(posts.length).toEqual(21);
    // likeCount가 desc순 이어야 한다.
    assertSorted(posts, (a, b) => b.likeCount - a.likeCount);
    // 동일한 likeCount이면 id desc여야 한다.
    const likeCount = posts[0].likeCount;
    const filteredPost = posts.filter((post) => post.likeCount === likeCount);
    assertSorted(filteredPost, (a, b) => b.id - a.id);
  });

  it('8.sort=mostReplied로 조회하면 replyCount 내림차순(동률이면 id 내림차순)으로 take+1개를 반환한다', async () => {
    const posts = await repo.selectMany({
      page: {
        take: 20,
        sort: 'mostReplied',
      },
    });
    expect(posts.length).toEqual(21);
    // replyCount가 desc순 이어야 한다.
    assertSorted(posts, (a, b) => b.replyCount - a.replyCount);

    // 동일한 replyCount이면 id desc여야 한다.
    const replyCount = posts[0].replyCount;
    const filteredPost = posts.filter((post) => post.replyCount === replyCount);
    assertSorted(filteredPost, (a, b) => b.id - a.id);
  });
});

//
describe('PostRepository.selectMany: 기본필터(searchFilterBase) 검증', () => {
  const repo = new PostRepository(prisma);
  //
  it('1.authorId만 지정해 조회하면 해당 사용자의 공개/비공개 글을 모두 반환한다 ', async () => {
    const posts = await repo.selectMany({
      filter: {
        authorId: testUserId,
      },
      page: {
        take: 10,
      },
    });
    expect(posts.length).toEqual(11); //take + 1
    //
    const publishedPosts = posts.filter((post) => post.published === true);
    const draftPosts = posts.filter((post) => post.published === false);
    //
    // status 값이 없느면 공개, 비공개 갯수를 확인한다.
    // seed생성시 랜덤으로 생성되므로 오류가 발생할 수 있다. 데이터 확인 바람(대부분 5:5 임)
    expect(publishedPosts.length + draftPosts.length).toEqual(posts.length);
    expect(publishedPosts.length).toBeGreaterThan(0);
    expect(draftPosts.length).toBeGreaterThan(0);
    // 검색 결과가 모두 test 와 같다.
    const filteredPosts = posts.filter((post) => post.author.id === testUserId);
    expect(posts.length).toEqual(filteredPosts.length);
  });

  it('2.status=published로 조회하면 공개 글만 반환한다', async () => {
    const posts = await repo.selectMany({
      filter: {
        status: 'published',
      },
    });

    const publishedPosts = posts.filter((post) => post.published === true);
    expect(posts.length).toEqual(publishedPosts.length);
  });

  it('3.authorId와 status=draft로 조회하면 해당 사용자의 비공개 글만 반환하고 정렬 옵션도 적용된다', async () => {
    const posts = await repo.selectMany({
      filter: {
        authorId: testUserId, // 사용자도 테스트
        status: 'draft',
      },
      page: {
        sort: 'mostLiked',
      },
    });

    // 전부 지정사용자 글인지 판단
    const filteredPosts = posts.filter((post) => post.author.id === testUserId);
    expect(posts.length).toEqual(filteredPosts.length);

    //전부 draft인지 판단
    const draftPosts = posts.filter((post) => post.published === false);
    expect(posts.length).toEqual(draftPosts.length);
    //
    // likeCount가 desc순 이어야 한다.
    assertSorted(posts, (a, b) => b.likeCount - a.likeCount);
    // 동일한 likeCount이면 id desc여야 한다.
    const likeCount = posts[0].likeCount;
    const filteredPost = posts.filter((post) => post.likeCount === likeCount);
    assertSorted(filteredPost, (a, b) => b.id - a.id);
  });

  it('4.keyword를 titleOnly=true(기본)로 조회하면 제목에서만 키워드를 검색해 조건에 맞는 글만 반환한다', async () => {
    const posts = await repo.selectMany({
      filter: {
        keyword: '수학',
        status: 'published',
      },
      page: {
        sort: 'mostViewed',
      },
    });

    //전체가 공개글인지 확인
    const publishedPosts = posts.filter((post) => post.published === true);
    expect(posts.length).toEqual(publishedPosts.length);
    //전체가 수학을 포함하는지
    const keysCount = posts.filter((post) => post.title.includes('수학'));
    expect(posts.length).toEqual(keysCount.length);

    //
    // viewCount가 desc순 이어야 한다.
    assertSorted(posts, (a, b) => b.viewCount - a.viewCount);
    // 동일한 viewCount이면 id desc여야 한다.
    const viewCount = posts[0].viewCount;
    const filteredPost = posts.filter((post) => post.viewCount === viewCount);
    assertSorted(filteredPost, (a, b) => b.id - a.id);
  });

  it('5.authorId와 keyword를 titleOnly=false로 조회하면 해당 사용자의 글 중 제목 또는 본문에 키워드가 포함된 글만 반환한다', async () => {
    const posts = await repo.selectMany({
      filter: {
        authorId: testUserId, // 사용자도 테스트
        keyword: '수학',
        titleOnly: false,
      },
      page: {
        sort: 'mostViewed',
      },
    });

    // 전부 지정사용자 글인지 판단
    const filteredPosts = posts.filter((post) => post.author.id === testUserId);
    expect(posts.length).toEqual(filteredPosts.length);

    // DB내용 직접 조회해서, 제목과, 본문에 모두 수학이 포함하는지 확인
    // posts 배열 안에 있는 각 post 객체에서 id 값만 꺼내서 새로운 배열을 만드는 코드
    const ids = posts.map((post) => post.id);
    const fullPosts = await prisma.post.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        title: true,
        content: true,
      },
    });

    const allMatched = fullPosts.every(
      (post) => post.title.includes('수학') || (post.content?.includes('수학') ?? false),
    );

    expect(allMatched).toBe(true);
  });
});

describe('PostRepository.selectMany: 범위필터(searchFilterRange) 검증', () => {
  const repo = new PostRepository(prisma);
  //
  it('1.viewCount 범위를 지정하면 해당 범위(gte~lte)에 포함된 글만 조회된다', async () => {
    const minValue = 50;
    const maxValue = 110;
    const posts = await repo.selectMany({
      ranges: {
        viewCount: { min: minValue, max: maxValue },
      },
    });

    // 최신순(id desc) b < a 이어야 한다. 조회시 기본값
    let expectedValues = [...globalPosts]; // 원본 보호
    expectedValues = expectedValues.sort((a, b) => b.id - a.id);
    // 조건을 충족하는 원시 데이터 추출
    expectedValues = expectedValues.filter((p) => {
      return p.viewCount >= minValue && p.viewCount <= maxValue;
    });
    // 조회시 기본값
    expectedValues = expectedValues.slice(0, 11); // take(10+ 1)

    expect(expectedValues.length).toEqual(posts.length);

    posts.forEach((p) => {
      expect(p.viewCount).toBeGreaterThanOrEqual(minValue);
      expect(p.viewCount).toBeLessThanOrEqual(maxValue);
    });
  });

  //
  it('2.likeCount 범위를 지정하면 해당 범위(gte~lte)에 포함된 글만 조회된다.', async () => {
    const minValue = 3;
    const maxValue = 20;
    const posts = await repo.selectMany({
      ranges: {
        likeCount: { min: minValue, max: maxValue },
      },
    });

    // 최신순(id desc) b < a 이어야 한다.
    // 조회시 기본값
    let expectedValues = [...globalPosts]; // 원본 보호
    expectedValues = expectedValues
      .sort((a, b) => b.id - a.id)
      .filter((p) => {
        return p.likeCount >= minValue && p.likeCount <= maxValue;
      })
      .slice(0, 11); // take(10+ 1)
    expect(expectedValues.length).toEqual(posts.length);

    posts.forEach((p) => {
      expect(p.likeCount).toBeGreaterThanOrEqual(minValue);
      expect(p.likeCount).toBeLessThanOrEqual(maxValue);
    });
  });
  //

  it('3.replyCount 범위를 지정하면 해당 범위(gte~lte)에 포함된 글만 조회된다.', async () => {
    const minValue = 2;
    const maxValue = 6;
    const posts = await repo.selectMany({
      ranges: {
        replyCount: { min: minValue, max: maxValue },
      },
    });
    //
    let expectedValues = [...globalPosts]
      .sort((a, b) => b.id - a.id)
      .filter((p) => {
        return p.replyCount >= minValue && p.replyCount <= maxValue;
      })
      .slice(0, 11); // take(10 + 1)
    //
    expect(expectedValues.length).toEqual(posts.length);
    posts.forEach((p) => {
      expect(p.replyCount).toBeGreaterThanOrEqual(minValue);
      expect(p.replyCount).toBeLessThanOrEqual(maxValue);
    });
  });

  it('4.createdAt 기간(from~to)을 지정하면 해당 기간에 생성된 글만 조회된다', async () => {
    //  테스트용 post 생성 규칙
    const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
    const ONE_HOUR = 60 * 60 * 1000;
    //  const createdAt = new Date(baseTime - i * ONE_HOUR);

    const from = new Date(baseTime - 6 * ONE_HOUR).toISOString();
    const to = new Date(baseTime - 3 * ONE_HOUR).toISOString();

    const posts = await repo.selectMany({
      ranges: {
        createdAt: { from: from, to: to },
      },
      filter: {
        status: 'published',
      },
    });

    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();

    posts.forEach((p) => {
      expect(new Date(p.createdAt).getTime()).toBeGreaterThanOrEqual(fromTime);
      expect(new Date(p.createdAt).getTime()).toBeLessThanOrEqual(toTime);
      expect(p.published).toBe(true);
    });
  });

  it('5.publishedAt 기간(from~to)을 지정하면 해당 기간에 게시된 글만 조회된다.', async () => {
    //  테스트용 post 생성 규칙
    const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
    const ONE_HOUR = 60 * 60 * 1000;
    // const createdAt = new Date(baseTime - i * ONE_HOUR);
    // publishedAt: published ? createdAt : null,

    const from = new Date(baseTime - 6 * ONE_HOUR).toISOString();
    const to = new Date(baseTime - 3 * ONE_HOUR).toISOString();

    const posts = await repo.selectMany({
      ranges: {
        publishedAt: { from: from, to: to },
      },
    });

    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();

    let expectedValues = [...globalPosts]
      .sort((a, b) => b.id - a.id)
      .filter((p) => {
        if (p.publishedAt) {
          const publishedTime = new Date(p.publishedAt).getTime();
          return publishedTime >= fromTime && publishedTime <= toTime;
        }
        return false;
      })
      .slice(0, 11) // take(10 + 1)
      .map((p) => p.id);
    //
    expect(expectedValues.length).toEqual(posts.length);

    posts.forEach((p) => {
      expect(p.published).toBe(true);
      expect(expectedValues).toContain(p.id);
    });
  });

  it('6.여러 범위 필터를 함께 지정하면 모든 조건을 만족하는 글만 조회된다(AND 조건)', async () => {
    //  테스트용 post 생성 규칙
    const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
    const ONE_HOUR = 60 * 60 * 1000;
    //  const createdAt = new Date(baseTime - i * ONE_HOUR);

    const from = new Date(baseTime - 6 * ONE_HOUR).toISOString();

    const posts = await repo.selectMany({
      ranges: {
        viewCount: { min: 30 },
        createdAt: { from: from },
      },
    });
    //
    posts.forEach((p) => {
      expect(p.viewCount).toBeGreaterThanOrEqual(30);
      expect(new Date(p.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(from).getTime());
    });
  });
});

describe('PostRepository.selectMany: keyset 테스트', () => {
  const repo = new PostRepository(prisma);

  it('1.latest 정렬에서 cursor.id를 기준으로 다음 페이지를 조회하면 cursor.id보다 작은 id 데이터만 반환된다', async () => {
    const take = 5;
    const first = await repo.selectMany({
      page: {
        sort: 'latest',
        take: take,
      },
    });
    // take+1 확인
    expect(first.length).toBeLessThanOrEqual(take + 1);

    if (first.length <= take)
      throw Error('응답값이 (take+1) 보다 작아서 cursor 테스트를 수행할 수 없습니다. ');

    // take 마지막에 해당하는 id
    const cursor = { id: first[take - 1].id };
    const second = await repo.selectMany({
      page: {
        sort: 'latest',
        take: take,
        cursor,
      },
    });

    // take+1 확인
    expect(second.length).toBeLessThanOrEqual(take + 1);
    //take 갯수 만큼으로 검증한다.
    const firstIds = first.slice(0, take).map((p) => p.id);
    second.slice(0, take).forEach((p) => {
      expect(firstIds).not.contain(p.id);
      expect(p.id).toBeLessThan(cursor.id);
    });
  });

  it('2.oldest 정렬에서 cursor.id를 기준으로 다음 페이지를 조회하면 cursor.id보다 큰 id 데이터만 반환된다.', async () => {
    const take = 5;
    const first = await repo.selectMany({
      page: {
        sort: 'oldest',
        take: take,
      },
    });
    //
    if (first.length <= take)
      throw Error('응답값이 (take+1) 보다 작아서 cursor 테스트를 수행할 수 없습니다. ');
    const cursor = { id: first[take - 1].id };
    const second = await repo.selectMany({
      page: {
        sort: 'oldest',
        take: take,
        cursor: cursor,
      },
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(first);
    // console.log('커서, ', cursor);
    // console.log(second);
    //
    //take+1 만큼 조회 되므로, take 갯수 만 검증한다.
    const firstIds = first.slice(0, take).map((p) => p.id);
    second.slice(0, take).forEach((p) => {
      expect(firstIds).not.contain(p.id);
      expect(p.id).toBeGreaterThan(cursor.id);
    });
  });

  it('3.mostViewed 정렬에서 cursor(viewCount,id) 이후 데이터를 조회하면 viewCount DESC, id DESC 정렬이 유지된다.', async () => {
    const take = 15;

    const first = await repo.selectMany({
      page: {
        sort: 'mostViewed',
        take: take,
      },
    }); //take + 1 개가 조회된다.

    if (first.length <= take)
      throw Error('응답값이 (take+1) 보다 작아서 cursor 테스트를 수행할 수 없습니다. ');
    const cursor = {
      id: first[take - 1].id,
      value: first[take - 1].viewCount,
    };

    const second = await repo.selectMany({
      page: {
        sort: 'mostViewed',
        take: take,
        cursor: cursor,
      },
    });

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(first);
    // console.log(`cursor: ${cursor}`);
    // console.log(second);

    //take+1 만큼 조회 되므로, take 갯수 만 검증한다.
    const firstIds = first.slice(0, take).map((p) => p.id);

    // cursor 부터 이후 데이터는 viewCount로 정렬되어 있다.
    second.slice(0, take).forEach((p) => {
      expect(firstIds).not.contain(p.id); // first에 id 중복 안되고
      expect(p.viewCount).toBeLessThanOrEqual(cursor.value); //viewCount 정렬 확인
    });

    // 두개를 합쳤을때 viewCount는 DESC여야 하며
    // 만약 viewCount 가 같으면 id DESC이어야 한다.
    const merged = [...first.slice(0, take - 1), ...second];
    for (let i = 0; i < merged.length - 1; i++) {
      const current = merged[i];
      const next = merged[i + 1];
      // viewCount가 다른 경우 → viewCount DESC
      if (current.viewCount !== next.viewCount) {
        expect(current.viewCount).toBeGreaterThan(next.viewCount);
      }
      // viewCount가 같으면 → id DESC (tie-breaker)
      else {
        expect(current.id).toBeGreaterThan(next.id);
      }
    }
  });

  it('4.mostLiked 정렬에서 cursor(likeCount,id) 이후 데이터를 조회하면 likeCount DESC, id DESC 정렬이 유지된다.', async () => {
    const take = 9;
    const first = await repo.selectMany({
      page: {
        sort: 'mostLiked',
        take: take,
      },
    }); // take + 1 개가 조회된다.

    if (first.length <= take)
      throw Error('응답값이 (take+1) 보다 작아서 cursor 테스트를 수행할 수 없습니다. ');
    const cursor = {
      id: first[take - 1].id,
      value: first[take - 1].likeCount,
    };

    const second = await repo.selectMany({
      page: {
        sort: 'mostLiked',
        take: take,
        cursor: cursor,
      },
    });
    //
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(first);
    // console.log('커서, ', cursor);
    // console.log(second);

    //take+1 만큼 조회 되므로, take 갯수 만 검증한다.
    const firstIds = first.slice(0, take).map((p) => p.id);

    // cursor 부터 이후 데이터는 likeCount로 정렬되어 있다.
    second.slice(0, take).forEach((p) => {
      expect(firstIds).not.contain(p.id); // first에 id 중복 안되고
      expect(p.likeCount).toBeLessThanOrEqual(cursor.value); //likeCount
    });

    // 두개를 합쳤을때 likeCount는 DESC여야 하며
    // 만약 likeCount 가 같으면 id DESC이어야 한다.
    const merged = [...first.slice(0, take - 1), ...second];
    for (let i = 0; i < merged.length - 1; i++) {
      const current = merged[i];
      const next = merged[i + 1];
      // likeCount가 다른 경우 → likeCount DESC
      if (current.likeCount !== next.likeCount) {
        expect(current.likeCount).toBeGreaterThan(next.likeCount);
      }
      // likeCount가 같으면 → id DESC (tie-breaker)
      else {
        expect(current.id).toBeGreaterThan(next.id);
      }
    }
  });

  it('5.mostReplied 정렬에서 cursor(replyCount,id) 이후 데이터를 조회하면 replyCount DESC, id DESC 정렬이 유지된다', async () => {
    const take = 9;
    const first = await repo.selectMany({
      page: {
        sort: 'mostReplied',
        take: take,
      },
    }); // take + 1 개가 조회된다.

    if (first.length <= take)
      throw Error('응답값이 (take+1) 보다 작아서 cursor 테스트를 수행할 수 없습니다. ');
    const cursor = {
      id: first[take - 1].id,
      value: first[take - 1].replyCount,
    };

    const second = await repo.selectMany({
      page: {
        sort: 'mostReplied',
        take: take,
        cursor: cursor,
      },
    });
    //
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(first);
    // console.log('커서, ', cursor);
    // console.log(second);

    //take+1 만큼 조회 되므로, take 갯수 만 검증한다.
    const firstIds = first.slice(0, take).map((p) => p.id);

    // cursor 부터 이후 데이터는 replyCount로 정렬되어 있다.
    second.slice(0, take).forEach((p) => {
      expect(firstIds).not.contain(p.id); // first에 id 중복 안되고
      expect(p.replyCount).toBeLessThanOrEqual(cursor.value); //replyCount
    });

    // 두개를 합쳤을때 replyCount는 DESC여야 하며
    // 만약 replyCount 가 같으면 id DESC이어야 한다.
    const merged = [...first.slice(0, take - 1), ...second];
    for (let i = 0; i < merged.length - 1; i++) {
      const current = merged[i];
      const next = merged[i + 1];
      // replyCount가 다른 경우 → replyCount DESC
      if (current.replyCount !== next.replyCount) {
        expect(current.replyCount).toBeGreaterThan(next.replyCount);
      }
      // replyCount가 같으면 → id DESC (tie-breaker)
      else {
        expect(current.id).toBeGreaterThan(next.id);
      }
    }
  });

  //
  it('6.viewCount와 likeCount 조건을 함께 지정해도, Keyset 커서가 정상 동작한다.', async () => {
    const take = 7;
    const first = await repo.selectMany({
      ranges: {
        viewCount: { min: 45 },
        likeCount: { min: 12 },
      },
      page: {
        sort: 'mostViewed',
        take,
      },
    });

    expect(first.length).toBeLessThanOrEqual(take + 1);

    if (first.length <= take)
      throw Error('응답값이 (take+1) 보다 작아서 cursor 테스트를 수행할 수 없습니다. ');

    // 결과 값이 take  보다 작으면 여기서 에러남,
    const cursor = {
      id: first[take - 1].id,
      value: first[take - 1].viewCount,
    };

    const second = await repo.selectMany({
      ranges: {
        viewCount: { min: 45 },
        likeCount: { min: 12 },
      },
      page: {
        sort: 'mostViewed',
        take,
        cursor,
      },
    });

    expect(second.length).toBeLessThanOrEqual(take + 1);

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(first);
    // console.log('커서, ', cursor);
    // console.log(second);

    // 필터 조건 유지 확인
    second.forEach((p) => {
      expect(p.viewCount).toBeGreaterThanOrEqual(45);
      expect(p.likeCount).toBeGreaterThanOrEqual(12);
    });

    //take+1 만큼 조회 되므로, take 갯수 만 검증한다.
    const firstIds = first.slice(0, take).map((p) => p.id);
    // cursor 부터 이후 데이터는 viewCount로 정렬되어 있다.
    second.slice(0, take).forEach((p) => {
      expect(firstIds).not.contain(p.id); // first에 id 중복 안되고
      expect(p.viewCount).toBeLessThanOrEqual(cursor.value); //viewCount
    });

    // 두개를 합쳤을때 viewCount는 DESC여야 하며
    // 만약 viewCount 가 같으면 id DESC이어야 한다.
    const merged = [...first.slice(0, take - 1), ...second];
    for (let i = 0; i < merged.length - 1; i++) {
      const current = merged[i];
      const next = merged[i + 1];
      // viewCount가 다른 경우 → viewCount DESC
      if (current.viewCount !== next.viewCount) {
        expect(current.viewCount).toBeGreaterThan(next.viewCount);
      }
      // viewCount가 같으면 → id DESC (tie-breaker)
      else {
        expect(current.id).toBeGreaterThan(next.id);
      }
    }
  });

  it('7.mostViewed 정렬에서 cursor(viewCount,id)의 value 값이 없으면 첫 페이지 처럼 조회된다.', async () => {
    const take = 5;
    const first = await repo.selectMany({
      page: {
        sort: 'mostViewed',
        take,
      },
    });
    //
    const cursor = {
      id: first[take - 1].id,
    };
    //
    const second = await repo.selectMany({
      page: {
        sort: 'mostViewed',
        take,
        cursor,
      },
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(first);
    // console.log(`cursor: ${cursor}`);
    // console.log(second);

    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
  });

  it('8.마지막 페이지에서는 조회 결과가 take 이하이다', async () => {
    const take = 9;
    const first = await repo.selectMany({
      page: {
        take: take,
      },
    });

    console.log(` 전체 글 개수: ${globalPosts.length} `); //30
    const cursor = {
      id: first[take - 1].id,
    };

    let lastPage: any[] = [];

    let safety = 0;

    while (true) {
      const next = await repo.selectMany({
        page: {
          take,
          cursor,
        },
      });

      if (next.length <= take) {
        lastPage = next;
        break;
      }

      cursor.id = next[take - 1].id;

      safety++;
      if (safety > 100) {
        throw new Error('pagination infinite loop');
      }
    }
    // 마지막 페이지 검증
    expect(lastPage.length).toBeLessThanOrEqual(take);
  });
});
