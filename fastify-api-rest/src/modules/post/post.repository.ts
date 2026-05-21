// src/modules/post/post.repository.ts
import { PrismaClient, Prisma } from '../../generated/client';
import { PostViewStatRepository } from '../postviewstat/postviewstat.repository';

/**
 * 생성/수정/삭제 작업 후 반환할 최소 식별 정보.
 * 불필요한 데이터 전송을 줄이고 응답 직렬화 비용을 낮추기 위해
 * 작업 결과 확인에 꼭 필요한 필드만 포함합니다.
 */
const postUpdateSelect: Prisma.PostSelect = {
  id: true,
  authorId: true,
  published: true,
  publishedAt: true,
  updatedAt: true,
};

/**
 * 목록 조회용 필드 집합.
 * 본문(content)은 목록에서 불필요하게 큰 데이터를 유발하므로 제외합니다.
 * 작성자 정보는 N+1 쿼리를 방지하기 위해 관계 조인(select.author)으로 함께 가져옵니다.
 */
const postListSelect: Prisma.PostSelect = {
  id: true,
  title: true,
  published: true,
  author: {
    select: {
      id: true,
      displayName: true,
    },
  },
  createdAt: true,
  viewCount: true,
  likeCount: true,
  replyCount: true,
};

/**
 * 상세 조회용 필드 집합.
 * 목록 필드(postListSelect)를 기반으로 본문·수정일·게시일을 추가합니다.
 * 스프레드를 활용해 목록 필드와의 싱크를 유지합니다.
 */
const postDetailSelect: Prisma.PostSelect = {
  ...postListSelect,
  authorId: true,
  content: true,
  updatedAt: true,
  publishedAt: true,
};

/**
 * =============================================
 * 조회 필터 및 페이지네이션 타입 정의
 * =============================================
 */

type searchFilterBase = {
  authorId?: number;
  status?: 'published' | 'draft';
  keyword?: string;
  /** true면 제목(title)만, false(기본)면 제목+본문 전체 검색 */
  titleOnly?: boolean;
};

type searchFilterRange = {
  viewCount?: { min?: number; max?: number };
  likeCount?: { min?: number; max?: number };
  replyCount?: { min?: number; max?: number };
  createdAt?: { from?: string; to?: string }; // ISOString
  publishedAt?: { from?: string; to?: string }; // ISOString
};

type searchPageOption = {
  sort?: 'latest' | 'oldest' | 'mostViewed' | 'mostLiked' | 'mostReplied';
  /**
   * 이전 페이지의 마지막 레코드 위치.
   * - id: 마지막 레코드의 PK
   * - value: 정렬 기준 컬럼의 실제 값 (수치 정렬 시 Keyset 조건에 사용)
   */
  cursor?: { id: number; value?: number };
  take?: number;
};

/**
 * =========================================================
 * PostRepository 구현
 * =========================================================
 */
export class PostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 게시글을 생성합니다.
   *
   * Prisma의 `connect`를 사용해 authorId와 User 모델을 관계로 연결합니다.
   * 이렇게 하면 외래 키 유효성을 ORM 레벨에서 보장하고,
   * 원시 SQL 문자열 조합으로 인한 실수를 방지할 수 있습니다.
   *
   * published가 true인 경우에만 publishedAt을 기록합니다.
   * 이후 published를 false로 되돌리면 publishedAt도 null로 초기화됩니다.
   */
  async create(data: { authorId: number; title: string; content?: string; published?: boolean }) {
    const { authorId, published = false, ...anothers } = data;

    return this.prisma.post.create({
      data: {
        ...anothers,
        author: {
          connect: { id: data.authorId },
        },
        published,
        publishedAt: published ? new Date() : null, // 게시글이 공개 상태로 생성될 경우에만 publishedAt 설정
      },
      select: postUpdateSelect,
    });
  }

  /**
   * 게시글을 수정합니다.
   *
   * @param data.authorId - 제공 시 해당 작성자의 게시글인지 WHERE 조건으로 검증합니다.
   *   현재 인증 컨텍스트가 없기 때문에 클라이언트 입력에 의존합니다.
   *   생략하면 소유자 조건이 빠지므로 일반 사용자 API에서는 반드시 전달되어야 합니다.
   *
   * 각 필드는 `undefined`일 때 SET 절에서 제외되어 의도치 않은 덮어쓰기를 방지합니다.
   * `null`이나 빈 문자열은 의도적인 값으로 취급되어 그대로 반영됩니다.
   */
  async update(data: {
    postId: number;
    authorId?: number;
    title?: string;
    content?: string;
    published?: boolean;
  }) {
    return this.prisma.post.update({
      where: {
        id: data.postId,
        // 인증 도입 전 임시 소유자 검증: authorId가 없으면 소유자 조건이 적용되지 않습니다.
        ...(data.authorId !== undefined && { authorId: data.authorId }),
      },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.published !== undefined && {
          published: data.published,
          publishedAt: data.published ? new Date() : null,
        }),
      },
      select: postUpdateSelect,
    });
  }

  /**
   * 게시글을 물리적으로 삭제합니다.
   *
   * @param data.authorId - 제공 시 본인 글인지 WHERE 조건으로 검증합니다.
   *   현재 관리자 권한 판별 로직은 없으므로, 생략 가능한 형태는 내부/관리자용 API로 분리되기 전까지 주의가 필요합니다.
   *
   * Prisma Schema의 onDelete 설정에 따라 PostViewStat 등
   *   연관 데이터가 CASCADE 삭제될 수 있습니다. 스키마의 관계 설정을 반드시 확인하세요.
   */
  async delete(data: { postId: number; authorId?: number }) {
    return this.prisma.post.delete({
      where: {
        id: data.postId,
        // 인증 도입 전 임시 소유자 검증: authorId가 없으면 소유자 조건이 적용되지 않습니다.
        ...(data.authorId !== undefined && { authorId: data.authorId }),
      },
      select: postUpdateSelect,
    });
  }

  /**
   * 게시글 단건을 조회합니다. 존재하지 않으면 예외를 던집니다.
   *
   * @param data.includeDraft
   *   - `false` (기본값): 공개(published=true) 게시글만 조회합니다. 일반 독자용.
   *   - `true`: 비공개 게시글도 포함하여 조회합니다. 작성자·관리자용.
   */

  async selectOne(data: { postId: number; includeDraft?: boolean }) {
    const { postId, includeDraft = false } = data;

    return this.prisma.$transaction(async (tx) => {
      // 공개글 상세 조회만 조회수와 버킷 통계를 증가시킵니다.
      if (!includeDraft) {
        await tx.post.update({
          where: { id: postId, published: true },
          data: { viewCount: { increment: 1 } },
          select: { id: true },
        });

        await new PostViewStatRepository(tx).createPostViewStat(postId);
      }

      return tx.post.findUniqueOrThrow({
        where: {
          id: postId,
          ...(includeDraft === false && { published: true }),
        },
        select: postDetailSelect,
      });
    });
  }

  /**
   * 복합 필터와 Keyset 페이지네이션으로 게시글 목록을 조회합니다.
   *
   * ## 페이지네이션 전략: Keyset(Cursor-based) Pagination
   *
   * **Offset 방식의 한계**
   * OFFSET N은 처음부터 N개 행을 읽고 버리기 때문에 뒤 페이지로 갈수록 선형적으로
   * 성능이 저하됩니다. 수백만 건 이상의 데이터에서는 응답 지연이 심각해집니다.
   *
   * **Keyset 방식의 장점**
   * 마지막 레코드의 정렬 기준값(cursor)을 WHERE 조건으로 삼아 인덱스 범위 스캔을
   * 시작점으로 지정합니다. O(log N) 수준의 탐색 비용으로 페이지 위치와 무관하게
   * 일정한 성능을 유지합니다.
   *
   * **take + 1 전략**
   * 요청 수(take)보다 1개 더 조회하여 추가 행 존재 여부로 `hasNextPage`를 판단합니다.
   * 별도의 COUNT 쿼리 없이 한 번의 쿼리로 다음 페이지 유무를 알 수 있습니다.
   * 실제 응답에는 `slice(0, take)` 후 반환하세요.
   *
   * **정렬 일관성(Deterministic Ordering)**
   * viewCount처럼 중복이 잦은 컬럼은 동일 값에서 순서가 불확정적입니다.
   * 모든 수치 정렬의 마지막에 유일한 id를 타이브레이커로 추가하여
   * 페이지 간 레코드 누락·중복을 방지합니다.
   *
   * ** 타이브레이커(tie-breaker) **
   * 정렬이나 경쟁에서 값이 동일할 때 순서를 결정하기 위해 사용하는 추가 기준
   *  - 1차 기준 → 값이 같으면
   *  - 2차 기준 → tie-breaker 사용
   */
  async selectMany(params: {
    //1. 일반 필터
    filter?: searchFilterBase;
    //2. 수치/날짜 범위 필터
    ranges?: searchFilterRange;
    //3. 정렬 및 페이지네이션
    page?: searchPageOption;
  }) {
    // 기본값 할당 및 구조 분해
    const { filter = {}, ranges = {}, page = {} } = params;

    const { sort = 'latest', cursor, take = 10 } = page;

    // 1. 기본 WHERE 조건 생성 (상태, 작성자, 검색어 및 수치/날짜 범위 필터)
    const where = this.buildSelectOptions(filter, ranges);

    // 2. Keyset 조건 빌드: 이전 페이지 마지막 레코드 이후부터 스캔
    const keysetCondition = cursor ? this.buildKeysetCondition(sort, cursor) : {};
    // 3. 일반 목록 API처럼 published 조건이 고정된 조회에서는 Schema @@index 순서에 맞춰 orderBy를 구성합니다.
    const orderBy = this.mapSortOption(sort);
    // 4. take + 1개 조회 → hasNextPage 판단용 (응답 시 slice(0, take) 필요)

    const posts = await this.prisma.post.findMany({
      where: { AND: [where, keysetCondition] }, // 기본 필터와 커서 조건 결합
      orderBy,
      /**
       * take + 1 전략:
       * - DB가 (take + 1)개 반환 → hasNextPage = true
       * - DB가 take 이하 반환 → hasNextPage = false
       *
       * 실제 응답에서는 slice(0, take) 처리 후 반환
       */
      take: take + 1,
      select: postListSelect,
    });
    return posts;
  }

  /**
   * 기본 필터와 범위 조건을 Prisma `PostWhereInput`으로 변환합니다.
   *
   * **키워드 검색 성능 주의**
   * 현재 `contains` + `insensitive`는 내부적으로 `ILIKE '%keyword%'`로 변환됩니다.
   * 선행 와일드카드(%) 때문에 인덱스를 사용할 수 없어 Full Table Scan이 발생합니다.
   * 데이터가 늘어나면 PostgreSQL의 Full-Text Search(tsvector/tsquery)나
   * Elasticsearch 도입을 검토하세요.
   */
  private buildSelectOptions(
    filter: searchFilterBase,
    ranges: searchFilterRange,
  ): Prisma.PostWhereInput {
    const where: Prisma.PostWhereInput = {};
    // 기본 필터링: 작성자 및 상태
    if (filter.authorId) where.authorId = filter.authorId;

    // status가 명시된 경우에만 published 조건을 적용
    // status가 없으면 전체 조회
    if (filter.status !== undefined) {
      where.published = filter.status === 'draft' ? false : true;
    }
    /**
     * min/max를 Prisma IntFilter(gte/lte)로 변환하는 헬퍼.
     * 빈 객체를 반환할 수 있으나, Prisma는 빈 IntFilter를 조건 없음으로 처리합니다.
     */
    const applyRange = (data?: { min?: number; max?: number }) => {
      const filter: Prisma.IntFilter = {};
      if (data?.min !== undefined) filter.gte = data.min;
      if (data?.max !== undefined) filter.lte = data.max;
      // 객체 스프레드 연산자를 활용하여 조건부로 속성을 추가하는 방식으로 IntFilter를 구성할 수도 있습니다.
      // const filter = {
      //   ...(data?.min !== undefined && { gte: data.min }),
      //   ...(data?.max !== undefined && { lte: data.max }),
      // };
      return filter;
    };

    if (ranges.viewCount) where.viewCount = applyRange(ranges.viewCount);
    if (ranges.likeCount) where.likeCount = applyRange(ranges.likeCount);
    if (ranges.replyCount) where.replyCount = applyRange(ranges.replyCount);

    // 날짜 범위 처리
    if (ranges.createdAt) {
      where.createdAt = {
        ...(ranges.createdAt.from && { gte: new Date(ranges.createdAt.from) }),
        ...(ranges.createdAt.to && { lte: new Date(ranges.createdAt.to) }),
      };
    }
    if (ranges.publishedAt) {
      where.publishedAt = {
        ...(ranges.publishedAt.from && { gte: new Date(ranges.publishedAt.from) }),
        ...(ranges.publishedAt.to && { lte: new Date(ranges.publishedAt.to) }),
      };
    }

    // 텍스트 검색: 대소문자 구분 없는(insensitive) 부분 일치 검색
    // LIKE '%keyword%' 쿼리는 인덱스들을 못 타고 Full Table Scan을 유발-> 개선 필요
    // PostgreSQL의 tsvector(Full Text Search)나 Elasticsearch 도입을 고려
    if (filter.keyword) {
      const searchCondition = { contains: filter.keyword, mode: Prisma.QueryMode.insensitive };
      // 본문 검색은 ILIKE '%keyword%'로 Full Table Scan 비용이 커질 수 있어 제목 검색을 기본값으로 둡니다.
      const filterOnly = filter.titleOnly ?? true;

      if (filterOnly) {
        where.title = searchCondition;
      } else {
        // 제목 혹은 본문에 포함된 경우 전체 검색
        where.OR = [{ title: searchCondition }, { content: searchCondition }];
      }
    }

    return where;
  }

  /**
   * 정렬 기준과 마지막 커서 위치를 기반으로 Keyset WHERE 조건을 생성합니다.
   *
   * ## 단일 PK 정렬 (latest / oldest)
   * Auto-increment id는 삽입 순서를 보장하므로 id 단독으로 충분합니다.
   * `latest → id DESC`, `oldest → id ASC`
   *
   * ## 복합 정렬 (mostViewed / mostLiked / mostReplied)
   * 수치 컬럼은 중복이 잦아 id 타이브레이커가 필수입니다.
   * 복합 인덱스 [field DESC, id DESC]를 효율적으로 타기 위해 아래 OR 구조를 사용합니다.
   *
   * ```sql
   * -- DESC 기준 예시 (mostViewed)
   * WHERE (viewCount < :value)
   *    OR (viewCount = :value AND id < :id)
   * ```
   *
   * 첫 번째 조건은 인덱스 범위 스캔으로 불필요한 행을 물리적으로 건너뜁니다.
   * 두 번째 조건은 동일 value 내에서 id 기준으로 위치를 정확히 지정합니다.
   */
  private buildKeysetCondition(
    sort: 'latest' | 'oldest' | 'mostViewed' | 'mostLiked' | 'mostReplied',
    cursor: { id: number; value?: number },
  ): Prisma.PostWhereInput {
    const { id, value } = cursor;

    // oldest만 ASC, 나머지는 모두 DESC
    const isDesc = sort !== 'oldest'; // oldest만 ASC, 나머지는 DESC 가정
    const op = isDesc ? 'lt' : 'gt';

    // 1. 단일 PK 정렬 (최신순/과거순)
    // ID(Autoincrement)가 생성 순서를 보장하므로 ID만으로 인덱스 탐색 가능
    if (sort === 'latest' || sort === 'oldest') {
      return { id: { [op]: id } };
    }

    // 2. 복합 정렬 (Value + ID)
    // value 없이는 커서를 특정할 수 없으므로 조건 없이 반환 (첫 페이지로 처리)
    if (value === undefined) return {};

    const fieldMap: Record<string, string> = {
      mostViewed: 'viewCount',
      mostLiked: 'likeCount',
      mostReplied: 'replyCount',
    };
    const field = fieldMap[sort];

    /**
     * [Keyset Logic]
     * 복합 인덱스 [field, id]를 효율적으로 타기 위한 쿼리 구조
     * 인덱스 범위 스캔을 통해 불필요한 레코드를 물리적으로 건너뜁니다.
     */
    return {
      OR: [
        { [field]: { lt: value } }, // 기준값이 더 작은 데이터들, value는 desc
        {
          [field]: value, // 기준값이 같으면
          id: { [op]: id }, // ID가 더 작은(더 먼저 생성된) 데이터,  타이브레이크
        },
      ],
    };
  }

  /**
   * 정렬 전략을 Prisma `orderBy` 배열로 변환합니다.
   *
   * Prisma Schema의 `@@index` 컬럼 순서와 정확히 일치시켜야
   * 쿼리 실행 시 Filesort(인메모리 재정렬)를 피하고 인덱스 스캔을 활용할 수 있습니다.
   *
   * 일반 목록 API는 기본적으로 published 조건을 WHERE에서 고정하므로,
   * 정렬 컬럼을 인덱스의 뒤쪽 컬럼 순서에 맞춰 구성합니다.
   *
   * | sort        | 정렬 기준                                  |
   * |-------------|-------------------------------------------- |
   * | latest      | id DESC                                     |
   * | oldest      | id ASC                                      |
   * | mostViewed  | viewCount DESC, id DESC                     |
   * | mostLiked   | likeCount DESC, id DESC                     |
   * | mostReplied | replyCount DESC, id DESC                    |
   */
  private mapSortOption(sort: string): Prisma.PostOrderByWithRelationInput[] {
    switch (sort) {
      case 'latest':
        return [{ id: 'desc' }];
      case 'oldest':
        return [{ id: 'asc' }];
      case 'mostViewed':
        return [{ viewCount: 'desc' }, { id: 'desc' }];
      case 'mostLiked':
        return [{ likeCount: 'desc' }, { id: 'desc' }];
      case 'mostReplied':
        return [{ replyCount: 'desc' }, { id: 'desc' }];
      default:
        return [{ id: 'desc' }];
    }
  }
}
