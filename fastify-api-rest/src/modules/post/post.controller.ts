// src/module/post/post.controller.ts
import type {
  PostCreateBodyDto,
  PostDeleteQueryDto,
  PostIdParamsDto,
  PostListQueryDto,
  PostListResponseDto,
  PostQueryDto,
  PostResponseDto,
  PostUpdateBodyDto,
  PostUpdateCounterBodyDto,
  PostUpdateResponseDto,
} from './post.dto';
import type { PostService } from './post.service';

/**
 * [Controller Layer: 실행 조정 계층]
 * - Route 계층으로부터 전달받은 순수 데이터(DTO)를 비즈니스 로직에 매핑합니다.
 * - HTTP 프로토콜의 복잡함(request, reply)을 제거하여 서비스 로직을 순수하게 유지합니다.
 * - 로직(if, loop 등) 없이 요청을 서비스로 전달만 하므로 테스트 생략 권장..
 */
export class PostController {
  constructor(private readonly postService: PostService) {}

  /** 게시글을 생성하고 생성 결과를 반환 (POST 대응) */
  async createPost(input: PostCreateBodyDto): Promise<PostUpdateResponseDto> {
    return await this.postService.createPost(input);
  }

  /** 게시글의 일부 정보를 수정 (PATCH 대응) */
  async updatePost(ids: PostIdParamsDto, input: PostUpdateBodyDto): Promise<PostUpdateResponseDto> {
    return await this.postService.updatePost(ids, input);
  }

  /**
   * 게시글의 카운터 값을 수정
   * - 조회수(viewCount), 좋아요(likeCount) 등의 카운터 필드 갱신
   * - 전체 게시글 수정과 분리하여 경량 업데이트 수행 (PATCH counter 대응)
   */
  async updateCounter(
    id: PostIdParamsDto,
    input: PostUpdateCounterBodyDto,
  ): Promise<PostIdParamsDto> {
    return await this.postService.updateCounter(id, input);
  }

  /** 게시글을 시스템상에서 '삭제' 상태로 변경 (Soft delete, DELETE 대응) */
  async deletePost(
    ids: PostIdParamsDto,
    input: PostDeleteQueryDto,
  ): Promise<PostUpdateResponseDto> {
    return await this.postService.deletePost(ids, input);
  }

  /** 검색 조건에 맞는 특정 게시글 정보를 가져옴 (GET 대응) */
  async getPost(input: PostQueryDto): Promise<PostResponseDto> {
    return await this.postService.getPost(input);
  }

  /** 게시글 목록을 필터링하여 조회 (GET list 대응) */
  async listPosts(input: PostListQueryDto): Promise<PostListResponseDto> {
    return await this.postService.listPosts(input);
  }
}
