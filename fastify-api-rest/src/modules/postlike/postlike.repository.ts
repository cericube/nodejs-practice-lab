// src/modules/postlike/postlike.repository.ts

import { PrismaClient, Prisma } from '../../generated/client';

/**
 * 페이징 처리를 위한 옵션 타입
 */
type searchPageOption = {
  sort?: 'latest' | 'oldest';
  // 커서 기반 페이징: 중복 가능한 createdAt과 고유값(ID)을 조합하여 다음 페이지의 시작점을 식별
  // 이 글을 누가 좋아요 했는가: createdAt과 userId를 커서로 사용
  // 내가 좋아요 선택한 글 목록: createdAt과 postId를 커서로 사용
  cursor?: { createdAt: string; value: number };
  take?: number;
};

export class PostLikeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * [좋아요 생성]
   * 특정 사용자가 특정 게시글에 좋아요를 누름
   */
  async createLike(data: { postId: number; userId: number }) {
    return this.prisma.postLike.create({
      data: {
        user: { connect: { id: data.userId } },
        post: { connect: { id: data.postId } },
      },
      select: { postId: true },
    });
  }

  /**
   * [좋아요 취소]
   * @@id([userId, postId]) 복합 키를 사용하여 유일한 행을 찾아 삭제
   */
  async deleteLike(data: { postId: number; userId: number }) {
    // Prisma 스키마에서 @@id([userId, postId])라고 정의하면,
    // Prisma는 내부적으로 이 두 값을 합친
    // userId_postId라는 이름을 가진 하나의 고유 식별자(Compound Unique Input)를 생성합니다.
    //
    return this.prisma.postLike.delete({
      where: {
        // Prisma는 복합 PK 정의 시 자동으로 'field1_field2' 형태의 고유 식별자 객체를 생성함
        userId_postId: {
          userId: data.userId,
          postId: data.postId,
        },
      },
      select: { postId: true },
    });
  }

  /**
   * [내가 좋아요한 게시글 목록]
   * 특정 유저(userId)가 좋아요를 누른 게시글들을 페이징하여 조회
   */
  async listUserLikedPosts(userId: number, options: searchPageOption) {
    const { sort = 'latest', cursor, take = 10 } = options;

    // 정렬 순서 정의:
    //  인덱스 @@index([userId, createdAt(sort: Desc), postId(sort: Desc)]) 활용 최적화
    const orderBy: Prisma.PostLikeOrderByWithRelationInput[] =
      sort === 'latest'
        ? [{ createdAt: 'desc' }, { postId: 'desc' }]
        : [{ createdAt: 'asc' }, { postId: 'desc' }];

    //특정 게시글의 좋아요만 조회
    const where: Prisma.PostLikeWhereInput = { userId };

    // 커서 페이징 로직: '이전 페이지의 마지막 항목' 이후 데이터를 필터링
    if (cursor) {
      const { createdAt, value } = cursor;
      const parsedCreatedAt = new Date(createdAt);
      if (sort === 'latest') {
        where.OR = [
          // 1. 커서보다 생성 시간이 더 과거인 데이터
          { createdAt: { lt: parsedCreatedAt } },
          // 2. 생성 시간은 같지만 고유 ID가 커서보다 작은 데이터 (동일 시간 데이터 처리)
          { createdAt: parsedCreatedAt, postId: { lt: value } },
        ];
      } else {
        where.OR = [
          // 1. 커서보다 생성 시간이 더 최근인 데이터
          { createdAt: { gt: parsedCreatedAt } },
          // 2. 생성 시간은 같지만 고유 ID가 커서보다 작은 데이터
          { createdAt: createdAt, postId: { lt: value } },
        ];
      }
    }

    return this.prisma.postLike.findMany({
      where,
      orderBy: orderBy,
      take: take + 1, // 다음 페이지 존재 여부 확인을 위해 요청한 개수보다 1개 더 가져옴
      select: {
        post: {
          select: {
            id: true,
            title: true,
            published: true,
          },
        },
        createdAt: true,
      },
    });
  }

  /**
   * [게시글을 좋아요한 사용자 목록]
   * 특정 게시글(postId)에 좋아요를 누른 사용자들을 페이징하여 조회
   */
  async listPostLikedUsers(postId: number, options: searchPageOption) {
    const { sort = 'latest', cursor, take = 10 } = options;

    // 정렬 순서 정의:
    // 인덱스 @@index([postId, createdAt(sort: Desc), userId(sort: Desc)]) 활용 최적화
    const orderBy: Prisma.PostLikeOrderByWithRelationInput[] =
      sort === 'latest'
        ? [{ createdAt: 'desc' }, { userId: 'desc' }]
        : [{ createdAt: 'asc' }, { userId: 'desc' }];

    //특정 게시글의 좋아요만 조회
    const where: Prisma.PostLikeWhereInput = { postId };

    // 커서 페이징 로직
    if (cursor) {
      const { createdAt, value } = cursor;
      const parsedCreatedAt = new Date(createdAt);
      ``;
      if (sort === 'latest') {
        where.OR = [
          { createdAt: { lt: parsedCreatedAt } },
          { createdAt: parsedCreatedAt, userId: { lt: value } },
        ];
      } else {
        where.OR = [
          { createdAt: { gt: parsedCreatedAt } },
          { createdAt: parsedCreatedAt, userId: { lt: value } },
        ];
      }
    }

    return this.prisma.postLike.findMany({
      where,
      orderBy: orderBy,
      take: take + 1, // 다음 페이지 존재 여부 확인
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
        createdAt: true,
      },
    });
  }
}
