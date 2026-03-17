// src/modules/post/post.service.ts
import type {
  PostCreateBodyDto,
  PostUpdateBodyDto,
  PostUpdateResponseDto,
  PostIdParamsDto,
  PostUpdateCounterBodyDto,
  PostQueryDto,
  PostResponseDto,
  PostListQueryDto,
  PostListResponseDto,
  PostListItemDto,
  PostDeleteQueryDto,
} from './post.dto';
import type { PostRepository } from './post.repository';

/**
 * PostService
 * 애플리케이션의 핵심 비즈니스 로직을 담당하는 서비스 계층입니다.
 * - Controller와 Repository 사이의 가교 역할을 하며, 도메인 규칙을 적용합니다.
 * - 데이터의 원천인 DB Entity를 API 스펙인 DTO로 변환하여 내부 데이터 구조가 외부에 노출되는 것을 방지합니다.
 * - 모든 데이터 조작 요청은 권한 검증 및 비즈니스 유효성 검사를 거쳐야 합니다.
 */
export class PostService {
  constructor(private readonly repository: PostRepository) {}

  /**
   * 새로운 게시글 생성
   * - DB에서 생성된 Entity를 즉시 DTO로 변환하여 반환합니다.
   * - 이는 클라이언트가 필요한 정보(ID, 생성 시간 등)만 정확히 전달하고,
   *   불필요한 DB 내부 필드 노출을 차단하기 위함입니다.
   */
  async createPost(input: PostCreateBodyDto): Promise<PostUpdateResponseDto> {
    // const {authorId, title, content=undefined, published = false} = input;
    const post = await this.repository.create(input);
    //
    return toUpdateResponse(post);
    // return {
    //   id: post.id,
    //   authorId: post.authorId,
    //   published: post.published,
    //   publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    //   updatedAt: post.updatedAt.toISOString(),
    // };
  }

  /**
   * 게시글 정보 수정
   * [업데이트 전략: Partial Update]
   * - `undefined` 필드는 스프레드 연산자를 통해 제외 처리하여 의도하지 않은 데이터 덮어쓰기를 방지합니다.
   * [권한 정책]
   * - authorId 유무에 따라 본인 소유 확인 또는 관리자 권한 여부를 판단합니다.
   * - Repository 레벨에서 소유권 검증을 수행하도록 파라미터를 전달합니다.
   */
  async updatePost(
    idParam: PostIdParamsDto,
    input: PostUpdateBodyDto,
  ): Promise<PostUpdateResponseDto> {
    // TODO : 사용자/관리자 구분해서 수정 처리해야 함
    const data = {
      postId: idParam.id,
      ...(input.authorId !== undefined && { authorId: input.authorId }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.published !== undefined && { published: input.published }),
    };

    const post = await this.repository.update(data);
    return toUpdateResponse(post);
    // return {
    //   id: post.id,
    //   authorId: post.authorId,
    //   published: post.published,
    //   publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    //   updatedAt: post.updatedAt.toISOString(),
    // };
  }

  /**
   * 게시글 통계 데이터(조회, 좋아요, 댓글) 업데이트
   * [동시성 처리 방식]
   * - Race Condition을 방지하기 위해 서비스 계층의 연산 대신 DB의 원자적 증가(Atomic Increment)를 사용합니다.
   * - 데이터 무결성을 위해 Repository가 이 원자적 연산을 수행하도록 위임합니다.
   */
  async updateCounter(
    id: PostIdParamsDto,
    input: PostUpdateCounterBodyDto,
  ): Promise<PostIdParamsDto> {
    const data = {
      postId: id.id,
      ...(input.viewCount !== undefined && { viewCount: input.viewCount }),
      ...(input.likeCount !== undefined && { likeCount: input.likeCount }),
      ...(input.replyCount !== undefined && { replyCount: input.replyCount }),
    };

    return await this.repository.updateCounters(data);
  }

  /**
   * 게시글 삭제
   * [권한 및 보안]
   * - 식별자(ID)와 작성자(authorId) 정보를 함께 전달하여 인가되지 않은 사용자의 삭제 요청을 원천 차단합니다.
   */
  async deletePost(id: PostIdParamsDto, input: PostDeleteQueryDto): Promise<PostUpdateResponseDto> {
    //TODO : 사용자/관리자 구분하여 삭제 처리해야 함

    const data = {
      postId: id.id,
      ...(input.authorId !== undefined && { authorId: input.authorId }),
    };

    const post = await this.repository.delete(data);
    return toUpdateResponse(post);
    // return {
    //   id: post.id,
    //   authorId: post.authorId,
    //   published: post.published,
    //   publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    //   updatedAt: post.updatedAt.toISOString(),
    // };
  }

  /**
   * 특정 게시글 상세 조회
   * [조회 정책]
   * - `includeDraft` 플래그를 통해 공개 전 게시글(Draft)의 노출 여부를 제어합니다.
   * - 일반 사용자에게는 공개된 게시글만 반환하고, 작성자나 관리자 요청 시에만 초안을 포함합니다.
   */
  async getPost(input: PostQueryDto): Promise<PostResponseDto> {
    const { id: postId, includeDraft = false } = input;
    const post = await this.repository.selectOne({ postId, includeDraft });

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      published: post.published,
      author: {
        id: post.author.id,
        name: post.author.displayName,
      },
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
      replyCount: post.replyCount,
    };
  }

  /**
   * 검색 및 필터링 기반 게시글 목록 조회
   * [Pagination 전략: Cursor Based]
   * - 대량의 데이터셋에서 성능 최적화를 위해 Offset 방식 대신 Cursor 기반 페이징을 채택했습니다.
   * - 정렬 기준(latest, views 등)에 따라 동적으로 커서 값을 생성합니다.
   * [데이터 처리: Take + 1]
   * - 요청된 개수(take)보다 하나 더 많은 레코드를 조회하여 클라이언트에게 다음 페이지 존재 여부(hasNextPage)를 효율적으로 전달합니다.
   */
  async listPosts(input: PostListQueryDto): Promise<PostListResponseDto> {
    /**
     * 기본 필터 구성
     */
    const filter = {
      ...(input.authorId !== undefined && { authorId: input.authorId }),
      status: input.status ?? 'published',
      ...(input.keyword?.trim() && { keyword: input.keyword.trim() }), // 공백 제외
      titleOnly: input.titleOnly ?? true,
    };

    /**
     * 범위 검색 조건 생성
     */
    const ranges = {
      ...((input.minViewCount !== undefined || input.maxViewCount !== undefined) && {
        viewCount: {
          ...(input.minViewCount !== undefined && { min: input.minViewCount }),
          ...(input.maxViewCount !== undefined && { max: input.maxViewCount }),
        },
      }),
      ...((input.minLikeCount !== undefined || input.maxLikeCount !== undefined) && {
        likeCount: {
          ...(input.minLikeCount !== undefined && { min: input.minLikeCount }),
          ...(input.maxLikeCount !== undefined && { max: input.maxLikeCount }),
        },
      }),
      ...((input.minReplyCount !== undefined || input.maxReplyCount !== undefined) && {
        replyCount: {
          ...(input.minReplyCount !== undefined && { min: input.minReplyCount }),
          ...(input.maxReplyCount !== undefined && { max: input.maxReplyCount }),
        },
      }),
      ...((input.createdFrom || input.createdTo) && {
        createdAt: {
          ...(input.createdFrom && { from: input.createdFrom }),
          ...(input.createdTo && { to: input.createdTo }),
        },
      }),
      ...((input.publishedFrom || input.publishedTo) && {
        publishedAt: {
          ...(input.publishedFrom && { from: input.publishedFrom }),
          ...(input.publishedTo && { to: input.publishedTo }),
        },
      }),
    };

    /**
     * Pagination 옵션 생성
     */
    const page = {
      sort: input.sort ?? 'latest', // ''도 허용안함
      take: input.take || 10, //0 허용안함
      ...(input.cursor !== undefined && {
        cursor: {
          id: input.cursor.id,
          ...(input.cursor.value !== undefined && {
            value: input.cursor.value,
          }),
        },
      }),
    };

    const posts = await this.repository.selectMany({ filter, ranges, page });

    /**
     * take + 1 전략
     * 조회된 개수가 take보다 크면 다음 페이지가 존재합니다.
     */
    const hasNextPage = posts.length > page.take ? true : false;
    /**
     * 실제 응답 데이터
     * 마지막 레코드는 다음 페이지 존재 여부 판단용
     */
    const resultPosts: PostRow[] = hasNextPage ? posts.slice(0, -1) : posts;
    const lastPost = resultPosts[resultPosts.length - 1];

    return {
      posts: resultPosts.map((post) => toPostListResponse(post)),
      hasNextPage: hasNextPage,
      ...(hasNextPage && { nextCursor: buildPostCursor(page.sort, lastPost) }),
    };
  }
}

/**
 * 게시글 업데이트 API 응답 객체 생성
 *
 * - DB의 Date 타입을 JSON 응답용 ISO 문자열로 변환
 * - publishedAt은 nullable이므로 존재할 때만 변환
 */
function toUpdateResponse(post: {
  id: number;
  authorId: number;
  published: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: post.id,
    authorId: post.authorId,
    published: post.published,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
  };
}

/**
 * 다음 페이지 탐색을 위한 고유 커서 생성
 * [주의사항]
 * - 정렬 조건과 커서 값의 타입이 일치해야 정확한 필터링이 가능합니다.
 * - ID를 포함하여 동일한 수치(좋아요 등) 내에서의 고유 순서를 보장합니다.
 */
function buildPostCursor(sort: string, post: PostRow) {
  const nextCursor = {
    id: post.id,
    ...(sort === 'mostViewed' && { value: post.viewCount }),
    ...(sort === 'mostLiked' && { value: post.likeCount }),
    ...(sort === 'mostReplied' && { value: post.replyCount }),
  };
  return nextCursor;
}

/**
 * 목록용 데이터 변환
 * - 상세 정보(content 등)를 제외하고 목록 조회에 필요한 필수 필드만 가공하여 데이터 전송 오버헤드를 줄입니다.
 */
function toPostListResponse(post: PostRow): PostListItemDto {
  const { author, createdAt, ...postData } = post;
  return {
    ...postData,
    createdAt: createdAt.toISOString(),
    author: {
      id: author.id,
      name: author.displayName,
    },
  };
}

/**
 * Repository에서 반환되는 목록 조회 Row 타입
 */
type PostRow = {
  id: number;
  title: string;
  published: boolean;
  author: {
    id: number;
    displayName: string | null;
  };
  createdAt: Date;
  viewCount: number;
  likeCount: number;
  replyCount: number;
};
