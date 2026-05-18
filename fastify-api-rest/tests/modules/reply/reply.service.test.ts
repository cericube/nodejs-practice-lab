// tests/module/reply/reply.service.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { ReplyService } from '../../../src/modules/reply/reply.service';

import { prisma } from '../setup';
import { ReplyRepository } from '../../../src/modules/reply/reply.repository';
import { Prisma, Reply } from '../../../src/generated/client';
import { ErrorCode } from '../../../src/common/errors/error.codes';
import { BusinessError } from '../../../src/common/errors/business.error';
import { PostRepository } from '../../../src/modules/post/post.repository';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

/**
 * 테스트 성격 정의
 * 이 테스트는 "순수 Service 단위 테스트"가 아니라
 * Service + Repository + DB 까지 포함된 Integration Test 성격
 *
 * 즉,
 * - Repository 로직까지 같이 검증됨
 * - 테스트 신뢰도는 높지만, 계층 분리 테스트는 아님
 */
describe('ReplyService (CUD)테스트', () => {
  let postAuthorId: number;
  let replyAuthorId: number;
  let postId: number;

  beforeAll(async () => {
    // 댓글 작성자 생성
    const replyUser = await prisma.user.create({
      data: {
        email: 'reply@test.com',
        phoneNumber: '+821012345674',
        displayName: 'replier',
      },
    });
    replyAuthorId = replyUser.id;

    // 글 작성자 생성
    const postUser = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = postUser.id;

    // 글 생성
    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  //
  beforeEach(async () => {
    await prisma.reply.deleteMany();
  });

  let service: ReplyService = new ReplyService(new ReplyRepository(prisma));

  it('1.댓글 생성시, 댓글정보를 ReplyUpdateResponseDto 형식으로 반환해야 한다.', async () => {
    const reply = await service.createReply({
      postId: postId,
      authorId: replyAuthorId,
      content: '댓글 작성하기.',
    });
    /**
     * Service 책임: DTO contract 보장
     */
    expect(reply).toHaveProperty('id');
    expect(reply).toHaveProperty('authorId', replyAuthorId);
    expect(reply).toHaveProperty('postId', postId);
    expect(reply).toHaveProperty('updatedAt');
    expect(isDateTime(reply.updatedAt)).toBe(true);

    /**
     * 이 검증은 사실 Repository 책임
     * → Integration 테스트에서는 OK
     * → 순수 Service 테스트라면 제거 가능
     */
    const check = await prisma.reply.findUnique({
      where: {
        id: reply.id,
      },
    });
    // db에 저장된 값 확인
    expect(check).toHaveProperty('id', reply.id);
    expect(check).toHaveProperty('content', '댓글 작성하기.');
  });

  it('2.유효하지 않는 참조(authorId)로 생성시, 예외를 발생한다.', async () => {
    try {
      await service.createReply({
        postId: postId,
        authorId: 1111,
        content: '댓글 오류.',
      });

      // 에러가 안 나면 테스트 실패
      throw new Error('에러가 발생해야 합니다.');
    } catch (error) {
      /**
       * FK 제약조건 에러
       * → Repository(DB) 레벨 검증
       */
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toEqual('P2025');
      } else {
        throw error;
      }
    }
  });

  it('3.댓글 입력시 내용이 공백이면 에러를 발생한다.', async () => {
    try {
      await service.createReply({
        postId: postId,
        authorId: replyAuthorId,
        content: '',
      });
      throw new Error('에러가 발생해야 합니다.');
    } catch (error) {
      if (error instanceof BusinessError) {
        expect(error.errorCode).toEqual(ErrorCode.VALIDATION_ERROR);
      } else {
        throw error;
      }
    }
  });

  it('4.댓글 수정시, 댓글정보를 ReplyUpdateResponseDto 형식으로 반환해야 한다.', async () => {
    const reply = await service.createReply({
      postId: postId,
      authorId: replyAuthorId,
      content: '댓글 작성하기.',
    });

    const updated = await service.updateReply(
      { id: reply.id },
      { authorId: replyAuthorId, content: '댓글 수정하기.' },
    );

    // 반환 객체 항목 체크
    expect(updated).toHaveProperty('id');
    expect(updated).toHaveProperty('authorId', replyAuthorId);
    expect(updated).toHaveProperty('postId', postId);
    expect(updated).toHaveProperty('updatedAt');
    expect(isDateTime(updated.updatedAt)).toBe(true);

    /**
     * 실제 삭제 여부 확인 (Integration 검증)
     */
    const check = await prisma.reply.findUnique({
      where: {
        id: reply.id,
      },
    });
    // db에 저장된 값 확인
    expect(check).toHaveProperty('id', reply.id);
    expect(check).toHaveProperty('content', '댓글 수정하기.');
  });
  // 존재하지 않는 댓글 등 오류 상황은 생략해도 됨

  it('5.댓글 수정시, 내용이 공백이면 에러를 발생한다.', async () => {
    const reply = await service.createReply({
      postId: postId,
      authorId: replyAuthorId,
      content: '댓글 작성하기.',
    });

    try {
      const updated = await service.updateReply(
        { id: reply.id },
        {
          authorId: replyAuthorId,
          content: ' ',
        },
      );
      throw new Error('에러가 발생해야 합니다.');
    } catch (error) {
      if (error instanceof BusinessError) {
        expect(error.errorCode).toEqual(ErrorCode.VALIDATION_ERROR);
      } else {
        throw error;
      }
    }
  });

  it('5.댓글 삭제시, 댓글정보를 ReplyUpdateResponseDto 형식으로 반환해야 한다.', async () => {
    const reply = await service.createReply({
      postId: postId,
      authorId: replyAuthorId,
      content: '댓글 작성하기.',
    });

    const deleted = await service.deleteReply({ id: reply.id }, { authorId: replyAuthorId });

    // 반환 객체 항목 체크
    expect(deleted).toHaveProperty('id');
    expect(deleted).toHaveProperty('authorId', replyAuthorId);
    expect(deleted).toHaveProperty('postId', postId);
    expect(deleted).toHaveProperty('updatedAt');
    expect(isDateTime(deleted.updatedAt)).toBe(true);

    const check = await prisma.reply.findUnique({
      where: {
        id: reply.id,
      },
    });
    expect(check).toBeNull();
  });
});

/**
 * 테스트 데이터 생성
 * → 정렬 / 필터 / pagination 테스트용
 */
async function seedReplies(postId: number, authorId: number, count: number) {
  const replies = [];
  const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
  const ONE_HOUR = 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const saltTitle = Math.random() < 0.5 ? '수학댓글' : '국어 댓글';

    const createdAt = new Date(baseTime + i * ONE_HOUR);
    const reply = await prisma.reply.create({
      data: {
        postId: postId,
        authorId: authorId,
        content: `댓글-${saltTitle}-${i}`,
        createdAt: createdAt,
      },
    });
    replies.push(reply);
  }
  return replies;
}

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

/**
 * 목록 조회 테스트
 *
 * 현재 테스트는
 * - 필터
 * - 정렬
 * - pagination
 * 까지 포함됨
 *
 * 이는 Repository 책임 영역이 일부 포함됨
 */
describe('ReplyService 목록 조회 테스트', () => {
  let postAuthorId: number;
  let replyAuthorId: number;
  let postId: number;
  let replies: Reply[] = [];

  beforeAll(async () => {
    // 댓글 작성자 생성
    const replyUser = await prisma.user.create({
      data: {
        email: 'reply@test.com',
        phoneNumber: '+821012345674',
        displayName: 'replier',
      },
    });
    replyAuthorId = replyUser.id;

    // 글 작성자 생성
    const postUser = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = postUser.id;

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;

    replies = await seedReplies(postId, replyAuthorId, 26);
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  let service: ReplyService = new ReplyService(new ReplyRepository(prisma));

  it('1.댓글 목록 조회시 ReplyListResponseDto 형식으로 응답한다.', async () => {
    const take = 10;
    const res = await service.listReplies({
      authorId: replyAuthorId,
      keyword: '수학',
      sort: 'oldest',
      take: take,
    });

    // console.log('>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(res);

    // 응답 항목
    expect(res).toHaveProperty('replies');
    //
    const replies = res.replies;
    expect(replies).toHaveLength(take);
    assertSorted(replies, (a, b) => a.id - b.id);

    replies.forEach((reply) => {
      expect(reply.content).toContain('수학');
    });

    const lastReply = replies[take - 1];
    expect(lastReply).toHaveProperty('id');
    expect(lastReply).toHaveProperty('postId', postId); // 글 id
    expect(lastReply).toHaveProperty('content');
    expect(lastReply).toHaveProperty('createdAt');
    expect(lastReply).toHaveProperty('author');
    expect(lastReply.author).toHaveProperty('id', replyAuthorId); //댓글 작성자id
    expect(lastReply.author).toHaveProperty('displayName');
    //

    expect(res).toHaveProperty('hasNextPage', true);

    if (!res.hasNextPage) return; //더 이상 데이터가 없으면 리턴,

    expect(res).toHaveProperty('nextCursor');
    expect(res.nextCursor).toHaveProperty('id', lastReply.id); // 마지막 응답 id

    const resCursor = await service.listReplies({
      authorId: replyAuthorId,
      keyword: '수학',
      sort: 'oldest',
      take: take,
      cursor: res.nextCursor,
    });

    //console.log(resCursor);

    // 다음 페이지, 오름차순 정렬 확인
    expect(lastReply.id).toBeLessThan(resCursor.replies[0].id);
    if (!resCursor.hasNextPage) {
      expect(resCursor).not.toHaveProperty('nextCursor');
    }
  });
});
