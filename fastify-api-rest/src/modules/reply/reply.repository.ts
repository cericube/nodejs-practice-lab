// src/modules/reply/reply.repository.ts

import { PrismaClient, Prisma } from '../../generated/client';

/**
 * 생성/수정/삭제 작업 후 반환할 최소 식별 정보.
 *
 * 댓글 작업 결과 확인에 필요한 핵심 필드만 반환합니다.
 * 불필요한 데이터 전송을 줄여 네트워크 비용과 직렬화 비용을 최소화합니다.
 *
 * Prisma.ReplySelect 타입을 명시함으로써
 * select 구조가 스키마와 불일치할 경우 컴파일 타임에 검증됩니다.
 */
const replyUpdateSelect: Prisma.ReplySelect = {
  id: true,
  authorId: true,
  postId: true,
  updatedAt: true,
};

/**
 * 댓글 목록 조회용 필드 집합.
 *
 * 댓글은 일반적으로 데이터 크기가 크지 않으므로 content를 포함합니다.
 * 작성자 정보는 N+1 쿼리를 방지하기 위해 관계 조인(select.author)으로 함께 조회합니다.
 *
 * → 단일 쿼리로 필요한 데이터 구조를 완성 (JOIN 기반)
 */
const replyListSelect: Prisma.ReplySelect = {
  id: true,
  postId: true,
  content: true,
  author: {
    select: {
      id: true,
      displayName: true,
    },
  },
  createdAt: true,
};

/**
 * =============================================
 * 조회 필터 및 페이지네이션 타입 정의
 * =============================================
 */

/**
 * 기본 필터
 * - authorId: 특정 작성자의 댓글만 조회
 * - keyword: 댓글 내용(content) 기반 검색
 */
type searchFilter = {
  authorId?: number;
  keyword?: string;
};

/**
 * 페이지네이션 옵션
 *
 * - sort: 정렬 방식 (latest / oldest)
 * - cursor: 이전 페이지의 마지막 레코드 위치 (Keyset 기반)
 * - take: 조회 개수
 */
type searchPageOption = {
  sort?: 'latest' | 'oldest';
  cursor?: { id: number };
  take?: number;
};

export class ReplyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 댓글을 생성합니다.
   *
   * Prisma의 `connect`를 사용하여 authorId, postId를 각각
   * User, Post 모델과 관계로 연결합니다.
   *
   * ## connect 사용 이유
   * - 단순 FK 값 할당이 아니라 ORM 레벨에서 관계를 명시적으로 연결
   * - 존재하지 않는 id를 참조할 경우 DB/Prisma 레벨에서 즉시 에러 발생
   *   → 데이터 무결성 보장
   * - 원시 SQL 조합 없이 안전하게 관계 처리 가능
   *
   * ## 동작 방식
   * - author → User 테이블과 FK 연결
   * - post → Post 테이블과 FK 연결
   * - content → 댓글 본문 저장
   *
   * ## 주의 사항
   * - connect 대상(id)이 존재하지 않으면 예외 발생 (RecordNotFound)
   */
  async create(data: { postId: number; authorId: number; content: string }) {
    return this.prisma.reply.create({
      data: {
        author: {
          connect: { id: data.authorId },
        },
        post: {
          connect: { id: data.postId },
        },
        content: data.content,
      },
      select: replyUpdateSelect,
    });
  }

  /**
   * 댓글을 수정합니다.
   *
   * authorId를 WHERE 조건에 포함하여
   * "본인 댓글만 수정 가능"하도록 권한을 강제합니다.
   *
   */
  async update(data: { id: number; authorId: number; content: string }) {
    return this.prisma.reply.update({
      where: {
        id: data.id,
        authorId: data.authorId,
      },
      data: {
        content: data.content,
      },
      select: replyUpdateSelect,
    });
  }

  /**
   * 댓글을 삭제합니다.
   *
   * @param data.authorId
   * - 제공 시: 본인 댓글만 삭제 가능
   * - 생략 시: 관리자 권한(글 작성자 포함)으로 모든 댓글 삭제 가능
   *
   * 조건부 스프레드 패턴을 사용하여
   * authorId가 있을 때만 WHERE 조건에 포함됩니다.
   */
  async delete(data: { id: number; authorId?: number }) {
    return this.prisma.reply.delete({
      where: {
        id: data.id,
        // 본인 댓글만 삭제할 수 있도록 조건 추가 (관리자 고려  authorId optional 처리)
        ...(data.authorId !== undefined && { authorId: data.authorId }),
      },
      select: replyUpdateSelect,
    });
  }

  /**
   * 댓글 목록을 조회합니다.
   *
   * - cursor: 특정 레코드를 기준으로 이후 데이터를 조회
   * - skip: cursor 레코드 자체는 제외
   *
   * Offset 방식과 달리 대용량 데이터에서도 일정한 성능을 유지할 수 있습니다.
   *
   * ## take + 1 전략
   * 요청 개수보다 1개 더 조회하여 다음 페이지 존재 여부 판단
   *
   * - take + 1 조회
   * - 결과 길이 > take → hasNextPage = true
   * - 응답 시 slice(0, take) 필요
   */
  async selectMany(params: { filter?: searchFilter; page?: searchPageOption }) {
    // 기본값 할당 및 구조 분해
    const { filter = {}, page = {} } = params;
    const { sort = 'latest', cursor, take = 10 } = page;

    const where: Prisma.ReplyWhereInput = {};

    // 작성자 필터
    if (filter.authorId) where.authorId = filter.authorId;

    /**
     * 키워드 검색
     *
     * contains + insensitive → SQL ILIKE '%keyword%'
     *
     * ⚠ 성능 주의
     * - 선행 와일드카드(%)로 인해 인덱스 사용 불가
     * - 데이터 증가 시 Full Table Scan 발생
     *
     * → 개선 방향
     * - PostgreSQL Full Text Search (tsvector)
     * - 또는 Elasticsearch 도입
     */
    if (filter.keyword) {
      const searchCondition = { contains: filter.keyword, mode: Prisma.QueryMode.insensitive };
      where.content = searchCondition;
    }

    /**
     * 단일 PK 기반 정렬
     * → 인덱스 활용 가능 (Filesort 방지)
     */
    const orderBy: Prisma.ReplyOrderByWithRelationInput =
      sort === 'latest' ? { id: 'desc' } : { id: 'asc' };

    /**
     * =============================================
     * 3. 데이터 조회
     * =============================================
     *
     * cursor 기반 pagination
     *
     * - cursor: 시작 위치 지정
     * - skip: cursor 레코드 제외
     *
     * await 사용 이유:
     * - Prisma는 Promise를 반환하므로 결과 사용 시 반드시 await 필요
     */
    const replies = await this.prisma.reply.findMany({
      where: where,
      orderBy: orderBy,
      ...(cursor && {
        cursor: { id: cursor.id },
        skip: 1,
      }),
      take: take + 1,
      select: replyListSelect,
    });

    return replies;
  }
}
