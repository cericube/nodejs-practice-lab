// src/modules/reply/reply.service.ts

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import type {
  ReplyCreateBodyDto,
  ReplyDeleteQueryDto,
  ReplyIdParamsDto,
  ReplyListItemDto,
  ReplyListQueryDto,
  ReplyListResponseDto,
  ReplyUpdateBodyDto,
  ReplyUpdateResponseDto,
} from './reply.dto';
import { ReplyRepository } from './reply.repository';

/**
 * ReplyService
 * 애플리케이션의 핵심 비즈니스 로직을 담당하는 서비스 계층입니다.
 * - Controller와 Repository 사이의 가교 역할을 수행합니다.
 * - DB Entity를 API 응답 스펙(DTO)으로 변환하여 내부 데이터 구조 노출을 차단합니다.
 * - 현재 인증 계층이 없으므로 작성자 검증은 요청 DTO의 authorId를 Repository 조건에 전달하는 방식입니다.
 */
export class ReplyService {
  constructor(private readonly repository: ReplyRepository) {}
  /**
   * 댓글 생성
   * [데이터 처리]
   * - Repository에서 생성된 Entity를 즉시 DTO로 변환하여 반환합니다.
   * - 클라이언트는 필요한 식별자 및 상태 정보만 전달받습니다.
   */
  async createReply(input: ReplyCreateBodyDto): Promise<ReplyUpdateResponseDto> {
    if (!input.content || !input.content.trim()) {
      throw new BusinessError(ErrorCode.VALIDATION_ERROR, 'content is empty', 400);
    }

    const reply = await this.repository.create(input);
    return toResponse(reply);
  }

  /**
   * 댓글 수정
   * [업데이트 전략]
   * - 전달된 필드만 업데이트하는 Partial Update 방식
   * - 불필요한 데이터 overwrite를 방지하기 위해 DTO 기반으로 제한된 필드만 전달
   *
   * [권한 정책]
   * - 현재는 요청 Body의 authorId를 Repository 조건에 전달해 본인 댓글 여부를 확인합니다.
   * - 인증 도입 후에는 클라이언트가 보낸 authorId 대신 인증 컨텍스트를 사용해야 합니다.
   */
  async updateReply(
    replyId: ReplyIdParamsDto,
    input: ReplyUpdateBodyDto,
  ): Promise<ReplyUpdateResponseDto> {
    if (!input.content || !input.content.trim()) {
      throw new BusinessError(ErrorCode.VALIDATION_ERROR, 'content is empty', 400);
    }

    const reply = await this.repository.update({
      id: replyId.id,
      authorId: input.authorId,
      content: input.content,
    });
    return toResponse(reply);
  }

  /**
   * 댓글 삭제
   * [보안 및 권한]
   * - authorId가 제공되면 Repository에서 댓글 작성자와 일치하는 경우에만 삭제합니다.
   * - authorId가 없으면 소유자 조건이 빠지므로, 일반 사용자 경로에서는 필수로 다루어야 합니다.
   */
  // TODO: 관리자와 게시글 작성자의 댓글 삭제 권한을 인증/인가 정책으로 분리해야 합니다.
  async deleteReply(
    replyId: ReplyIdParamsDto,
    input: ReplyDeleteQueryDto,
  ): Promise<ReplyUpdateResponseDto> {
    const reply = await this.repository.delete({
      id: replyId.id,
      ...(input.authorId !== undefined && { authorId: input.authorId }),
    });
    return toResponse(reply);
  }

  /**
   * 댓글 목록 조회
   * [검색 및 필터링]
   * - 작성자(authorId), 키워드(keyword) 기반 필터링 지원
   * - keyword는 trim 처리하여 불필요한 공백 제거
   *
   * [Pagination 전략: Cursor Based]
   * - Offset 기반 대신 Cursor 기반 페이징 사용
   * - 대량 데이터에서 성능 및 정합성 확보
   *
   * [데이터 처리: Take + 1]
   * - 요청 개수보다 1개 더 조회하여 다음 페이지 존재 여부 판단
   */
  async listReplies(input: ReplyListQueryDto): Promise<ReplyListResponseDto> {
    /**
     * 필터 조건 구성
     */
    const filter = {
      ...(input.authorId !== undefined && { authorId: input.authorId }),
      ...(input.keyword?.trim() && { keyword: input.keyword.trim() }),
    };

    /**
     * Pagination 옵션 구성
     */
    const page = {
      sort: input.sort ?? 'latest',
      take: input.take || 10,
      ...(input.cursor !== undefined && {
        cursor: {
          id: input.cursor.id,
        },
      }),
    };

    const replies = await this.repository.selectMany({ filter, page });
    /**
     * take + 1 전략
     * - 조회된 데이터가 요청 수보다 많으면 다음 페이지 존재
     */
    const hasNextPage = replies.length > page.take ? true : false;

    /**
     * 실제 반환 데이터 구성
     * - 마지막 데이터는 페이지 존재 여부 판단용으로 제외
     */
    const resultReplies: ReplyRow[] = hasNextPage ? replies.slice(0, -1) : replies;
    const lastPost = resultReplies[resultReplies.length - 1];

    return {
      replies: resultReplies.map((r) => toListResponse(r)),
      hasNextPage: hasNextPage,
      ...(hasNextPage && {
        nextCursor: {
          id: lastPost.id,
        },
      }),
    };
  }
}

/**
 * 댓글 업데이트 응답 DTO 변환
 *
 * - DB Date 타입 → ISO 문자열 변환
 * - API 응답 스펙에 맞게 최소 필드만 반환
 */
function toResponse(reply: {
  id: number;
  authorId: number;
  postId: number;
  updatedAt: Date;
}): ReplyUpdateResponseDto {
  return {
    id: reply.id,
    authorId: reply.authorId,
    postId: reply.postId,
    updatedAt: reply.updatedAt.toISOString(),
  };
}

/**
 * 댓글 목록 응답 DTO 변환
 *
 * - createdAt을 ISO 문자열로 변환
 * - 목록 조회에 필요한 필드만 선택적으로 반환
 */
function toListResponse(reply: ReplyRow): ReplyListItemDto {
  const { createdAt, ...extras } = reply;
  return {
    ...extras,
    createdAt: reply.createdAt.toISOString(),
  };
}

/**
 * Repository에서 반환되는 댓글 목록 Row 타입
 */
type ReplyRow = {
  id: number;
  postId: number;
  content: string;
  author: {
    id: number;
    displayName: string | null;
  };
  createdAt: Date;
};
