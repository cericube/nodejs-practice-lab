import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { PostRepository } from '../../../src/modules/post/post.repository';
import { prisma } from '../setup';
import { Prisma } from '../../../src/generated/client';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('PostRepository.create', () => {
  let authorId: number;
  //
  beforeAll(async () => {
    // 테스트용 유저 생성
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    authorId = user.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  //
  beforeEach(async () => {
    await prisma.post.deleteMany();
  });

  let repo: PostRepository = new PostRepository(prisma);

  it('1. 정상적으로 글을 생성해야 한다.', async () => {
    //const publishedAt = new Date();
    const result = await repo.create({
      title: '테스트 게시글',
      content: '테스트 내용',
      authorId: authorId,
      published: true,
    });
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(result.publishedAt).toBeDefined();
    expect(isDateTime(result.updatedAt.toISOString())).toBe(true);
    expect(result).toMatchObject({
      authorId: authorId,
      published: true,
    });
  });

  it('2. select 필드만 반환해야 한다. (title, content 없어야함)', async () => {
    const result = await repo.create({
      title: '테스트 게시글',
      content: '테스트 내용',
      authorId: authorId,
      published: true,
    });
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty('title');
    expect(result).not.toHaveProperty('content');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('updatedAt');
    expect(result).toHaveProperty('publishedAt');
    expect(result).toMatchObject({
      authorId: authorId,
      published: true,
    });
  });

  it('3. 존재하지 않는 authorId로 글 생성 시 에러가 발생해야 한다.', async () => {
    try {
      await repo.create({
        title: '테스트 게시글',
        content: '테스트 내용',
        authorId: 9999, // 존재하지 않는 사용자 ID
        published: true,
      });
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to update not found" 에러 코드
      }
    }
  });

  it('4. published=false이면, publishedAt은 null이어야 한다.', async () => {
    const result = await repo.create({
      title: '테스트 게시글',
      content: '테스트 내용',
      authorId: authorId,
      published: false,
    });
    expect(result.publishedAt).toBeNull();
  });
});

////////////////////////////////4
describe('PostRepository.update/updateCounters', () => {
  let authorId: number;
  let postId: number;
  //
  beforeAll(async () => {
    // 테스트용 유저 생성
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    authorId = user.id;

    // 테스트용 post 생성
    const post = await prisma.post.create({
      data: {
        title: '테스트 게시글',
        content: '테스트 내용',
        author: {
          connect: { id: authorId },
        },
      },
    });
    postId = post.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  let repo: PostRepository = new PostRepository(prisma);
  it('1. 관리자는 작성자ID 없이 게시글 제목과 내용을 수정할 수 있어야 한다.', async () => {
    const result = await repo.update({
      postId: postId,
      title: '수정된 제목',
      content: '수정된 내용',
      published: true,
    });
    expect(result).toBeDefined();
    expect(result.id).toBe(postId);
    expect(result.updatedAt).toBeDefined();
    expect(result.publishedAt).toBeDefined();
    expect(isDateTime(result.updatedAt.toISOString())).toBe(true);

    expect(result).toMatchObject({
      authorId: authorId,
      published: true,
    });

    // 수정된 데이터가 DB에 실제로 반영되었는지 확인
    const updatedPost = await prisma.post.findUnique({ where: { id: postId } });
    expect(updatedPost).toBeDefined();
    expect(updatedPost?.title).toBe('수정된 제목');
    expect(updatedPost?.content).toBe('수정된 내용');
  });

  it('2. 본인 게시글만 수정할 수 있어야 한다.', async () => {
    const result = await repo.update({
      postId: postId,
      authorId: authorId, // 본인 ID 명시
      title: '수정된 제목',
      content: '수정된 내용',
      published: true,
    });
    expect(result).toBeDefined();
    expect(result.id).toBe(postId);
    expect(result.updatedAt).toBeDefined();
    expect(isDateTime(result.updatedAt.toISOString())).toBe(true);
    expect(result).toMatchObject({
      authorId: authorId,
      published: true,
    });
  });

  it('3. 타인 게시글 수정 시 오류가 발생해야 한다.', async () => {
    try {
      const result = await repo.update({
        postId,
        title: '수정된 제목',
        content: '수정된 내용',
        published: true,
        authorId: authorId + 1, // 존재하지만 다른 사용자 ID
      });
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to update not found" 에러 코드
      }
    }
  });

  it('4. 존재하지 않는 게시글 수정 시 오류가 발생해야 한다.', async () => {
    try {
      const result = await repo.update({
        postId: 9999, // 존재하지 않는 게시글 ID
        title: '수정된 제목',
        content: '수정된 내용',
        published: true,
        authorId, // 존재하는 사용자 ID
      });
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to update not found" 에러 코드
      }
    }
  });

  it('5. 조회수, 좋아요, 댓글 수 를 각 각 증가후 결과를 확인한다.', async () => {
    const result = await repo.updateCounters({
      postId,
      viewCount: 4,
      likeCount: 6,
      replyCount: 10,
    });
    expect(result).toBeDefined();
    expect(result.id).toBe(postId);

    // 수정된 데이터가 DB에 실제로 반영되었는지 확인
    const updatedPost = await prisma.post.findUnique({ where: { id: postId } });
    console.log('Updated Post:', updatedPost);
    expect(updatedPost).toBeDefined();
    expect(updatedPost?.viewCount).toBe(4);
    expect(updatedPost?.likeCount).toBe(6);
    expect(updatedPost?.replyCount).toBe(10);

    // 추가로, viewCount만 증가시키는 경우
    const result2 = await repo.updateCounters({
      postId,
      viewCount: 2,
    });
    expect(result2).toBeDefined();
    expect(result2.id).toBe(postId);

    const updatedPost2 = await prisma.post.findUnique({ where: { id: postId } });
    console.log('Updated Post after viewCount increment:', updatedPost2);
    expect(updatedPost2).toBeDefined();
    expect(updatedPost2?.viewCount).toBe(6); // 4 + 2
    expect(updatedPost2?.likeCount).toBe(6); // 변경 없음
    expect(updatedPost2?.replyCount).toBe(10); // 변경 없음

    // 좋아요와 댓글을 감소 시키는 경우 (음수 값 테스트)
    const result3 = await repo.updateCounters({
      postId,
      likeCount: -2,
      replyCount: -5,
    });
    expect(result3).toBeDefined();
    expect(result3.id).toBe(postId);

    const updatedPost3 = await prisma.post.findUnique({ where: { id: postId } });
    console.log('Updated Post after likeCount and replyCount decrement:', updatedPost3);
    expect(updatedPost3).toBeDefined();
    expect(updatedPost3?.viewCount).toBe(6); // 변경 없음
    expect(updatedPost3?.likeCount).toBe(4); // 6 - 2
    expect(updatedPost3?.replyCount).toBe(5); // 10 - 5
  });
});

describe('PostRepository.delete', () => {
  let authorId: number;
  let postId: number;
  //
  beforeEach(async () => {
    // 테스트용 유저 생성
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    authorId = user.id;

    // 테스트용 post 생성
    const post = await prisma.post.create({
      data: {
        title: '테스트 게시글',
        content: '테스트 내용',
        author: {
          connect: { id: authorId },
        },
      },
    });
    postId = post.id;
  });

  afterEach(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  //////////////////////////////////////////////////////
  let repo: PostRepository = new PostRepository(prisma);

  it('1. 본인 게시글만 삭제할 수 있어야 한다.', async () => {
    const result = await repo.delete({ postId, authorId });
    expect(result).toBeDefined();
    expect(result.id).toBe(postId);

    // 삭제된 데이터가 DB에서 실제로 제거되었는지 확인
    const deletedPost = await prisma.post.findUnique({ where: { id: postId } });
    expect(deletedPost).toBeNull();
  });

  it('2. 타인 게시글 삭제 시 오류가 발생해야 한다.', async () => {
    try {
      const result = await repo.delete({ postId, authorId: authorId + 1 }); // 존재하지만 다른 사용자 ID
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to delete not found" 에러 코드
      }
    }
  });

  it('3. 존재하지 않는 게시글 삭제 시 오류가 발생해야 한다.', async () => {
    try {
      const result = await repo.delete({ postId: 9999, authorId }); // 존재하지 않는 게시글 ID
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to delete not found" 에러 코드
      }
    }
  });

  it('4. 관리자는 작성자ID 없이 삭제가 가능하다. ', async () => {
    const result = await repo.delete({ postId });
    expect(result).toBeDefined();
    expect(result.id).toBe(postId);

    // 삭제된 데이터가 DB에서 실제로 제거되었는지 확인
    const deletedPost = await prisma.post.findUnique({ where: { id: postId } });
    expect(deletedPost).toBeNull();
  });
});

describe('PostRepository.selectOne', () => {
  let authorId: number;
  let publishedPostId: number;
  let draftPostId: number;

  /**
   * ----------------------------------------
   * 테스트용 데이터 준비
   * ----------------------------------------
   */
  beforeAll(async () => {
    // 1. 테스트용 유저 생성
    const user = await prisma.user.create({
      data: {
        email: `test_${Date.now()}@example.com`,
        phoneNumber: '+821012345678',
        displayName: 'test-user',
      },
    });

    authorId = user.id;

    // 2. 공개 게시글 생성
    const publishedPost = await prisma.post.create({
      data: {
        title: 'published-post',
        content: 'content',
        published: true,
        publishedAt: new Date(),
        authorId,
      },
    });

    publishedPostId = publishedPost.id;

    // 3. draft 게시글 생성
    const draftPost = await prisma.post.create({
      data: {
        title: 'draft-post',
        content: 'draft-content',
        published: false,
        publishedAt: null,
        authorId,
      },
    });

    draftPostId = draftPost.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  let repo: PostRepository = new PostRepository(prisma);

  it('1. 기본 요청시 공개 게시글을 조회할 수 있어야 한다.', async () => {
    const result = await repo.selectOne({ postId: publishedPostId });
    expect(result).toBeDefined();
    expect(result.id).toBe(publishedPostId);
    expect(result.title).toBe('published-post');
    expect(result.content).toBe('content');
    expect(result.published).toBe(true);
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it('2. 기본요청시 비공개 글이면 오류가 발생한다..', async () => {
    try {
      const result = await repo.selectOne({ postId: draftPostId });
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to find not found" 에러 코드
      }
    }
  });

  it('3. includeDraft=false일 경우 draft 게시글은 조회되지 않고 오류가 발생해야 한다.', async () => {
    try {
      const result = await repo.selectOne({ postId: draftPostId, includeDraft: false });
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to find not found" 에러 코드
      }
    }
  });

  it('4. includeDraft=true일 경우 draft 게시글을 조회할 수 있어야 한다.', async () => {
    const result = await repo.selectOne({ postId: draftPostId, includeDraft: true });
    expect(result).toBeDefined();
    expect(result.id).toBe(draftPostId);
    expect(result.title).toBe('draft-post');
    expect(result.content).toBe('draft-content');
    expect(result.published).toBe(false);
  });

  it('5. includeDraft=true일 경우 공개글도 조회할 수 있어야 한다.', async () => {
    const result = await repo.selectOne({ postId: publishedPostId, includeDraft: true });
    expect(result).toBeDefined();
    expect(result.id).toBe(publishedPostId);
    expect(result.title).toBe('published-post');
    expect(result.content).toBe('content');
    expect(result.published).toBe(true);
  });

  it('6. 존재하지 않는 게시글 조회 시 오류가 발생해야 한다.', async () => {
    try {
      const result = await repo.selectOne({ postId: 9999 }); // 존재하지 않는 게시글 ID
    } catch (error) {
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); // Prisma의 "Record to find not found" 에러 코드
      }
    }
  });
});
