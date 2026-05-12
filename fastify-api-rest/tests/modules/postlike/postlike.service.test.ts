import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PostLikeService } from '../../../src/modules/postlike/postlike.service';

import { prisma } from '../setup';
import { seedUsers, seedPosts, seedPostLikes } from '../postlike/postlike.seed';
import { PostLikeRepository } from '../../../src/modules/postlike/postlike.repository';
import { Post, PostLike, Prisma, User } from '../../../src/generated/client';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('PostLikeService 좋아요 등록/취소', () => {
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

  let service: PostLikeService = new PostLikeService(new PostLikeRepository(prisma));

  it('1.종아요 등록하면 글 번호를 PostLikeResponseDto 형식으로 반환한다.', async () => {
    const result = await service.likePost({
      postId: postId[0],
      userId: likeUserId,
    });
    console.log('>>>>>>>>>>>>>> result: ', result);
    expect(result).toEqual({ postId: postId[0] });

    // DB에 실제로 좋아요가 등록되었는지 검증
    const likeInDb = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: likeUserId,
          postId: postId[0],
        },
      },
    });
    expect(likeInDb).not.toBeNull();
    expect(likeInDb?.postId).toBe(postId[0]);
    expect(likeInDb?.userId).toBe(likeUserId);
  });

  it('2.존재하지 않는 사용자가 좋아요 등록시 오류를 발생시킨다.', async () => {
    try {
      await service.likePost({
        postId: postId[0],
        userId: 9999, // 존재하지 않는 사용자 ID
      });
      // 에러가 안 나면 테스트 실패
      throw new Error('에러가 발생해야 합니다.');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toEqual('P2025');
      } else {
        throw error;
      }
    }
  });

  it('3.존재하지 않는 게시글에 좋아요 등록시 오류를 발생시킨다.', async () => {
    try {
      await service.likePost({
        postId: 9999, // 존재하지 않는 게시글 ID
        userId: likeUserId,
      });
      // 에러가 안 나면 테스트 실패
      throw new Error('에러가 발생해야 합니다.');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toEqual('P2025');
      } else {
        throw error;
      }
    }
  });

  it('4.좋아요 취소하면 글 번호를 PostLikeResponseDto 형식으로 반환한다.', async () => {
    // 먼저 좋아요 등록
    await service.likePost({
      postId: postId[0],
      userId: likeUserId,
    });

    // 좋아요 취소
    const result = await service.unlikePost({
      postId: postId[0],
      userId: likeUserId,
    });
    console.log('>>>>>>>>>>>>>> delete result: ', result);
    expect(result).toEqual({ postId: postId[0] });

    // DB에서 좋아요가 실제로 삭제되었는지 검증
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

  it('5.본인이 등록하지 않은 좋아요 취소 요청시 오류를 발생시킨다.', async () => {
    // 먼저 좋아요 등록
    await service.likePost({
      postId: postId[0],
      userId: likeUserId,
    });
    await expect(
      service.unlikePost({
        postId: postId[0],
        userId: 9999, // 다른 사용자 ID
      }),
    ).rejects.toMatchObject({
      code: 'P2025', // Prisma 에러 코드
    });
  });
});

describe('PostService 목록 조회', () => {
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

  let service: PostLikeService = new PostLikeService(new PostLikeRepository(prisma));

  it('1.특정 사용자가 좋아요한 게시글 목록을 Cursor 기반 Pagination으로 조회한다.', async () => {
    const userId = users[0].id;
    const take = 5; // 페이지당 5개씩 조회

    // 첫 페이지 조회 (커서 없이)
    const result = await service.getLikedPostsByUser({ id: userId }, { take });
    console.log('첫 페이지 결과: ', result);

    expect(result).toHaveProperty('posts');
    expect(result.posts.length).toBeLessThanOrEqual(take);
    const post = result.posts[0];
    expect(post).toHaveProperty('post');
    expect(post.post).toHaveProperty('id');
    expect(post.post).toHaveProperty('title');
    expect(post.post).toHaveProperty('published');
    expect(post).toHaveProperty('createdAt');
    expect(isDateTime(post.createdAt)).toBe(true);

    // hasNextPage는 boolean이어야 한다.
    expect(result).toHaveProperty('hasNextPage');
    expect(typeof result.hasNextPage).toBe('boolean');
    if (result.hasNextPage) {
      expect(result).toHaveProperty('nextCursor');
      expect(result.nextCursor).toHaveProperty('createdAt');
      expect(result.nextCursor).toHaveProperty('value');
      if (result.nextCursor) {
        expect(isDateTime(result.nextCursor.createdAt)).toBe(true);
      }
    } else {
      expect(result).not.toHaveProperty('nextCursor');
    }

    if (!result.hasNextPage) return;

    // 커서를 이용 마지막 페이지 까지 조회
    let cursor = result.nextCursor;
    let hasNextPage = true;
    // let nextResult: PostLikePostListResponseDto = result;
    let count = 0;
    while (hasNextPage) {
      const nextResult = await service.getLikedPostsByUser(
        { id: userId },
        { take: take, createdAt: cursor?.createdAt, value: cursor?.value },
      );
      console.log(`다음 페이지 결과: ${count++}`);
      console.dir(nextResult, { depth: null, colors: true });
      // 페이지네이션 응답 검증
      hasNextPage = nextResult.hasNextPage;
      cursor = nextResult.nextCursor;

      // 방어 코드 (cursor 없이 nextPage가 true인 경우)
      if (hasNextPage && !cursor) {
        throw new Error('Invalid pagination state: cursor is missing');
      }
      if (!hasNextPage) {
        // 마지막 페이지 도달 시 cursor는 없어야 한다.
        console.log('마지막 정보 테스트 하기');
        expect(cursor).toBeUndefined();
        expect(nextResult).toHaveProperty('posts');
        expect(nextResult.posts.length).toBeLessThanOrEqual(take);
        const nextPost = nextResult.posts[0];
        expect(nextPost).toHaveProperty('post');
        expect(nextPost.post).toHaveProperty('id');
        expect(nextPost.post).toHaveProperty('title');
        expect(nextPost.post).toHaveProperty('published');
        expect(nextPost).toHaveProperty('createdAt');
        expect(isDateTime(nextPost.createdAt)).toBe(true);
      }
    }
  });

  //

  it('2.특정 게시글에 좋아요를 누른 사용자 목록을 Cursor 기반 Pagination으로 조회한다.', async () => {
    const postId = posts[0].id;
    const take = 2; // 페이지당 2개씩 조회
    // 첫 페이지 조회 (커서 없이)
    const result = await service.getUsersWhoLikedPost({ id: postId }, { take });
    console.log('첫 페이지 결과: ', result);

    expect(result).toHaveProperty('users');
    expect(result.users.length).toBeLessThanOrEqual(take);
    const user = result.users[0];
    expect(user).toHaveProperty('user');
    expect(user.user).toHaveProperty('id');
    expect(user.user).toHaveProperty('displayName');
    expect(user).toHaveProperty('createdAt');
    expect(isDateTime(user.createdAt)).toBe(true);

    // hasNextPage는 boolean이어야 한다.
    expect(result).toHaveProperty('hasNextPage');
    expect(typeof result.hasNextPage).toBe('boolean');
    if (result.hasNextPage) {
      expect(result).toHaveProperty('nextCursor');
      expect(result.nextCursor).toHaveProperty('createdAt');
      expect(result.nextCursor).toHaveProperty('value');
      if (result.nextCursor) {
        expect(isDateTime(result.nextCursor.createdAt)).toBe(true);
      }
    } else {
      expect(result).not.toHaveProperty('nextCursor');
    }

    if (!result.hasNextPage) return;

    // 커서를 이용 마지막 페이지 까지 조회
    let cursor = result.nextCursor;
    let hasNextPage = true;
    let count = 0;
    while (hasNextPage) {
      const nextResult = await service.getUsersWhoLikedPost(
        { id: postId },
        { take: take, createdAt: cursor?.createdAt, value: cursor?.value },
      );
      console.log(`다음 페이지 결과: ${count++}`);
      console.dir(nextResult, { depth: null, colors: true });
      // 페이지네이션 응답 검증
      hasNextPage = nextResult.hasNextPage;
      cursor = nextResult.nextCursor;

      // 방어 코드 (cursor 없이 nextPage가 true인 경우)
      if (hasNextPage && !cursor) {
        throw new Error('Invalid pagination state: cursor is missing');
      }
      if (!hasNextPage) {
        // 마지막 페이지 도달 시 cursor는 없어야 한다.
        console.log('마지막 정보 테스트 하기');
        expect(cursor).toBeUndefined();
        expect(nextResult).toHaveProperty('users');
        expect(nextResult.users.length).toBeLessThanOrEqual(take);
        const nextUser = nextResult.users[0];
        expect(nextUser).toHaveProperty('user');
        expect(nextUser.user).toHaveProperty('id');
        expect(nextUser.user).toHaveProperty('displayName');
        expect(nextUser).toHaveProperty('createdAt');
        expect(isDateTime(nextUser.createdAt)).toBe(true);
      }
    }
  });
});
