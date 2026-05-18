// src/modules/postlike/postlike.service.ts

import type { PostLikeRepository } from './postlike.repository';
import type {
  PostLikeIdParamsDto,
  PostLikeParamsDto,
  PostLikePostListResponseDto,
  PostLikeQueryDto,
  PostLikeUserListResponseDto,
} from './postlike.dto';

/**
 * PostLikeService
 * 게시글 좋아요(PostLike) 도메인의 비즈니스 로직을 담당하는 서비스 계층입니다.
 * - Controller와 Repository 사이에서 데이터 흐름을 제어하고 도메인 규칙을 적용합니다.
 * - 좋아요 생성/삭제 및 조회 시 필요한 최소 데이터만 DTO 형태로 반환합니다.
 * - 목록 조회 시 Cursor 기반 Pagination 전략을 통해 대량 데이터에서도 성능을 보장합니다.
 */

export class PostLikeService {
  constructor(private readonly repository: PostLikeRepository) {}

  /**
   * 게시글 좋아요 생성
   * - 사용자(userId)가 특정 게시글(postId)에 좋아요를 추가합니다.
   * - 중복 좋아요 여부 및 무결성 검사는 Repository 레벨에서 처리됩니다.
   * - 클라이언트에는 식별자(postId)만 반환하여 응답 payload를 최소화합니다.
   */
  async likePost(input: PostLikeParamsDto): Promise<{ postId: number }> {
    return this.repository.createLike({ postId: input.postId, userId: input.userId });
    // // await this.postRepository.updateCounters({ postId: result.postId, likeCount: 1 }); // 좋아요 카운터 증가
    // return result;
  }

  /**
   * 게시글 좋아요 취소
   * - 사용자(userId)가 특정 게시글(postId)에 등록한 좋아요를 제거합니다.
   * - 존재하지 않는 좋아요에 대한 처리(무시/에러)는 Repository 정책에 따릅니다.
   * - 결과로 대상 게시글 식별자(postId)만 반환합니다.
   */
  async unlikePost(input: PostLikeParamsDto): Promise<{ postId: number }> {
    return this.repository.deleteLike({ postId: input.postId, userId: input.userId });
    // await this.postRepository.updateCounters({ postId: result.postId, likeCount: -1 }); // 좋아요 카운터 감소
    // return result;
  }

  /**
   * 특정 사용자가 좋아요한 게시글 목록 조회
   * [Pagination 전략: Cursor Based]
   * - 생성 시점(createdAt) + postId를 조합한 커서를 사용하여 안정적인 정렬 및 페이지 이동을 보장합니다.
   *
   * [정렬 정책]
   * - 기본값은 최신순(latest)이며, 좋아요 생성 시점을 기준으로 정렬됩니다.
   */
  async getLikedPostsByUser(
    userId: PostLikeIdParamsDto,
    options: PostLikeQueryDto,
  ): Promise<PostLikePostListResponseDto> {
    /**
     * Pagination 옵션 구성
     * - take: 페이지 크기 (0은 허용하지 않음)
     * - cursor: createdAt + postId(value) 기반 커서
     */
    const page = {
      sort: options.sort ?? 'latest',
      take: options.take || 10, // 0허용 안함
      ...(options.createdAt !== undefined &&
        options.value !== undefined && {
          cursor: {
            createdAt: options.createdAt,
            value: options.value, // postId를 커서의 value로 사용
          },
        }),
    };

    const likes = await this.repository.listUserLikedPosts(userId.id, page);
    /**
     * take + 1 전략
     * - 조회된 데이터가 요청 수보다 많으면 다음 페이지 존재
     */
    const hasNextPage = likes.length > page.take ? true : false;
    /**
     * 실제 반환 데이터 구성
     * - 마지막 데이터는 페이지 존재 여부 판단용으로 제외
     */
    const resultLikes: PostRow[] = hasNextPage ? likes.slice(0, -1) : likes;
    const lastPost = resultLikes[resultLikes.length - 1];

    return {
      posts: resultLikes.map((r) => toPostListResponse(r)),
      hasNextPage: hasNextPage,
      ...(hasNextPage &&
        lastPost && {
          nextCursor: {
            createdAt: lastPost.createdAt.toISOString(),
            value: lastPost.post.id, // postId를 커서의 value로 사용
          },
        }),
    };
  }

  /**
   * 특정 게시글에 좋아요를 누른 사용자 목록 조회
   * [Pagination 전략: Cursor Based]
   * - createdAt + userId를 기준으로 커서를 구성하여 중복 없는 안정적인 페이지네이션을 보장합니다.
   *
   * [데이터 설계]
   * - 사용자 정보는 목록 조회에 필요한 최소 필드(id, displayName)만 반환합니다.
   */
  async getUsersWhoLikedPost(
    postId: PostLikeIdParamsDto,
    options: PostLikeQueryDto,
  ): Promise<PostLikeUserListResponseDto> {
    /**
     * Pagination 옵션 구성
     * - cursor.value는 userId를 의미합니다.
     */
    const page = {
      sort: options.sort ?? 'latest',
      take: options.take || 10, // 0허용 안함
      ...(options.createdAt !== undefined &&
        options.value !== undefined && {
          cursor: {
            createdAt: options.createdAt,
            value: options.value, // userId를 커서의 value로 사용
          },
        }),
    };

    const likes = await this.repository.listPostLikedUsers(postId.id, page);
    /**
     * take + 1 전략
     * - 조회된 데이터가 요청 수보다 많으면 다음 페이지 존재
     */
    const hasNextPage = likes.length > page.take ? true : false;
    /**
     * 실제 반환 데이터 구성
     * - 마지막 데이터는 페이지 존재 여부 판단용으로 제외
     */
    const resultLikes: UserRow[] = hasNextPage ? likes.slice(0, -1) : likes;
    const lastUser = resultLikes[resultLikes.length - 1];

    return {
      users: resultLikes.map((r) => toUserListResponse(r)),
      hasNextPage: hasNextPage,
      ...(hasNextPage &&
        lastUser && {
          nextCursor: {
            createdAt: lastUser.createdAt.toISOString(),
            value: lastUser.user.id, // userId를 커서의 value로 사용
          },
        }),
    };
  }
}

/**
 * Repository에서 반환되는 "사용자가 좋아요한 게시글" Row 타입
 * - post: 게시글 최소 정보
 * - createdAt: 좋아요 생성 시점 (정렬 및 커서 기준)
 */
type PostRow = {
  post: {
    id: number;
    title: string;
    published: boolean;
  };
  createdAt: Date;
};

/**
 * 게시글 좋아요 목록 응답 DTO 변환
 * - Date 타입을 ISO 문자열로 변환하여 JSON 직렬화 호환성 확보
 * - 목록 조회 목적에 맞게 최소 필드만 포함
 */
function toPostListResponse(like: PostRow) {
  return {
    post: {
      id: like.post.id,
      title: like.post.title,
      published: like.post.published,
    },
    createdAt: like.createdAt.toISOString(), // 좋아요 등록 시점
  };
}

/**
 * Repository에서 반환되는 "게시글을 좋아요한 사용자" Row 타입
 */
type UserRow = {
  user: {
    id: number;
    displayName: string | null;
  };
  createdAt: Date;
};

/**
 * 좋아요 사용자 목록 응답 DTO 변환
 * - 사용자 식별 정보와 표시용 이름만 포함
 * - createdAt은 좋아요 시점으로, 정렬 및 UX에 활용 가능
 */
function toUserListResponse(like: UserRow) {
  return {
    user: {
      id: like.user.id,
      displayName: like.user.displayName,
    },
    createdAt: like.createdAt.toISOString(), // 좋아요 등록 시점
  };
}
