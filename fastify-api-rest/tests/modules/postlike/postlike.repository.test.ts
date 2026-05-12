import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PostLikeRepository } from '../../../src/modules/postlike/postlike.repository';
import { prisma } from '../setup';
import { seedUsers, seedPosts, seedPostLikes } from '../postlike/postlike.seed';
import { Post, PostLike, User } from '../../../src/generated/client';

describe('PostLikeRepository 좋아요 등록/취소', () => {
  let postAuthorId: number;
  let likeUserId: number;
  let postId: number[] = [];

  beforeAll(async () => {
    // 테스트용 유저 생성
    const likeUser = await prisma.user.create({
      data: {
        email: 'testlike@test.com',
        phoneNumber: '+821012345178',
        displayName: '좋아요',
      },
    });
    likeUserId = likeUser.id;
    //
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = user.id;

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId[0] = post.id;

    const post2 = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '두번 째 글 제목',
        content: '두번 째 글 본문 입니다.',
      },
    });
    postId[1] = post2.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.postLike.deleteMany();
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  beforeEach(async () => {
    // 각 테스트마다 좋아요 데이터 초기화
    await prisma.postLike.deleteMany();
  });

  //

  let repo: PostLikeRepository = new PostLikeRepository(prisma);

  it('1.좋아요 등록하면 글 id를 반환한다.', async () => {
    const result = await repo.createLike({
      postId: postId[0],
      userId: likeUserId,
    });
    console.log('result: ', result);
    expect(result).toEqual({ postId: postId[0] });
    //
    // 좋아요 등록이 실제로 데이터베이스에 반영되었는지 확인
    const likeInDb = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: likeUserId,
          postId: postId[0],
        },
      },
    });
    expect(likeInDb).not.toBeNull();
    expect(likeInDb?.userId).toBe(likeUserId);
    expect(likeInDb?.postId).toBe(postId[0]);
  });

  it('2.존재하지 않는 사용자가 좋아요 등록시 오류를 발생시킨다.', async () => {
    await expect(
      repo.createLike({
        postId: postId[0],
        userId: 11,
      }),
    ).rejects.toMatchObject({
      code: 'P2025', // Prisma 에러 코드
    });
  });

  it('3.존재하지 않는 게시글에 좋아요 등록시 오류를 발생시킨다.', async () => {
    await expect(
      repo.createLike({
        postId: 999,
        userId: likeUserId,
      }),
    ).rejects.toMatchObject({
      code: 'P2025', // Prisma 에러 코드
    });
  });

  it('4.좋아요 취소하면 글 id를 반환한다.', async () => {
    const created = await repo.createLike({
      postId: postId[0],
      userId: likeUserId,
    });

    const result = await repo.deleteLike({
      postId: postId[0],
      userId: likeUserId,
    });

    console.log('result: ', result);
    expect(result).toEqual({ postId: postId[0] });
    // 좋아요 취소가 실제로 데이터베이스에서 삭제되었는지 확인
    const likeInDb = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: likeUserId,
          postId: postId[0],
        },
      },
    });
    expect(likeInDb).toBeNull();
  });

  it('5.좋아요 취소시 존재하지 않는 좋아요에 대해 오류를 발생시킨다.', async () => {
    await expect(
      repo.deleteLike({
        postId: 111, // 존재하지 않는 게시글
        userId: likeUserId,
      }),
    ).rejects.toMatchObject({
      code: 'P2025', // Prisma 에러 코드
    });
  });

  it('6.본인이 등록하지 않은 좋아요 취소 요청시 오류를 발생시킨다.', async () => {
    const created = await repo.createLike({
      postId: postId[0],
      userId: likeUserId,
    });
    await expect(
      repo.deleteLike({
        postId: postId[0],
        userId: 11, // 다른 사용자 ID
      }),
    ).rejects.toMatchObject({
      code: 'P2025', // Prisma 에러 코드
    });
  });
});

describe('PostLikeRepository 목록조회', () => {
  let users: User[];
  let posts: Post[];
  let likes: PostLike[];

  beforeAll(async () => {
    users = await seedUsers();
    posts = await seedPosts(users);
    likes = await seedPostLikes(users, posts);
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.postLike.deleteMany();
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  let repo: PostLikeRepository = new PostLikeRepository(prisma);

  it('1.내가 좋아요한 게시글 목록을 페이징하여 조회한다.', async () => {
    const userId = users[0].id;
    const take = 5;
    const result = await repo.listUserLikedPosts(userId, {
      sort: 'latest',
      take: take,
    });

    //
    // -----------------------------
    // 검증용 데이터 생성
    // -----------------------------
    //1. 해당 유저의 like만 추출
    const userLikes = likes.filter((l) => l.userId === userId);
    //2. 정렬 (createdAt desc, postId desc)
    const sortedLikes = userLikes.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;

      // tie-break
      return b.postId - a.postId;
    });
    //3.페이지 사이즈만큼 자르기
    const pagedLikes = sortedLikes.slice(0, take);
    // 4. post 정보 join (expected 형태 만들기)
    const expected = pagedLikes.map((like) => {
      const post = posts.find((p) => p.id === like.postId)!;

      return {
        post: {
          id: post.id,
          title: post.title,
          published: post.published,
        },
        createdAt: like.createdAt,
      };
    });

    // -----------------------------
    //  첫페이지  검증
    // -----------------------------
    // 길이 검증
    expect(result).toHaveLength(expected.length + 1);
    // 데이터 검증
    for (let i = 0; i < expected.length; i++) {
      expect(result[i].post.id).toBe(expected[i].post.id);
      expect(result[i].post.title).toBe(expected[i].post.title);
      expect(result[i].post.published).toBe(expected[i].post.published);

      expect(new Date(result[i].createdAt).getTime()).toBe(expected[i].createdAt.getTime());
    }

    //
    // 1. cursor 생성 (첫 페이지 마지막 요소)
    const last = result[take - 1];
    // expect(last.post.id).toBe(result[take]);

    const cursor = {
      createdAt: last.createdAt.toISOString(),
      value: last.post.id,
    };

    // 2. 다음 페이지 조회
    const nextResult = await repo.listUserLikedPosts(userId, {
      sort: 'latest',
      take,
      cursor,
    });

    // 3. 다음 페이지 검증
    const nextExpected = sortedLikes.slice(take, take * 2).map((like) => {
      const post = posts.find((p) => p.id === like.postId)!;

      return {
        post: {
          id: post.id,
          title: post.title,
          published: post.published,
        },
        createdAt: like.createdAt,
      };
    });

    // 길이 검증
    if (nextExpected.length > take) {
      expect(nextResult).toHaveLength(take + 1); // 다음 페이지 존재 여부 확인용
    }
    // 데이터 검증
    for (let i = 0; i < nextExpected.length; i++) {
      expect(nextResult[i].post.id).toBe(nextExpected[i].post.id);
      expect(nextResult[i].post.title).toBe(nextExpected[i].post.title);
      expect(nextResult[i].post.published).toBe(nextExpected[i].post.published);

      expect(new Date(nextResult[i].createdAt).getTime()).toBe(nextExpected[i].createdAt.getTime());
    }

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(result);
    // console.log('next page >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(nextResult);
  });

  it('2.게시글이 좋아요 등록한 사용자를 페이징하여 조회한다.', async () => {
    const postId = posts[0].id;
    const take = 3;
    const result = await repo.listPostLikedUsers(postId, {
      sort: 'latest',
      take: take,
    });
    //
    // -----------------------------
    // 검증용 데이터 생성
    // -----------------------------
    //1. 게시글에 좋아요한 like만 추출
    const postLikes = likes.filter((l) => l.postId === postId);
    //2. 정렬 (createdAt desc, userId desc)
    const sortedLikes = postLikes.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      // tie-break
      return b.userId - a.userId;
    });
    //3.페이지 사이즈만큼 자르기
    const pagedLikes = sortedLikes.slice(0, take);
    // 4. user 정보 join (expected 형태 만들기)
    const expected = pagedLikes.map((like) => {
      const user = users.find((u) => u.id === like.userId)!;

      return {
        user: {
          id: user.id,
          displayName: user.displayName,
        },
        createdAt: like.createdAt,
      };
    });

    // -----------------------------
    //  첫페이지  검증
    // -----------------------------
    // 길이 검증
    if (result.length > take) {
      expect(result).toHaveLength(take + 1);
    }
    // 데이터 검증
    for (let i = 0; i < expected.length; i++) {
      expect(result[i].user.id).toBe(expected[i].user.id);
      expect(result[i].user.displayName).toBe(expected[i].user.displayName);

      expect(new Date(result[i].createdAt).getTime()).toBe(expected[i].createdAt.getTime());
    }

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(result);
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
  });
});
