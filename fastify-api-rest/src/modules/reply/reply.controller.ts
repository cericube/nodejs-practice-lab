// src/module/reply/reply.controller.ts

import type {
  ReplyCreateBodyDto,
  ReplyDeleteQueryDto,
  ReplyIdParamsDto,
  ReplyListQueryDto,
  ReplyListResponseDto,
  ReplyUpdateBodyDto,
  ReplyUpdateResponseDto,
} from './reply.dto';
import { ReplyService } from './reply.service';

export class ReplyController {
  constructor(private readonly serivce: ReplyService) {}

  createReply(input: ReplyCreateBodyDto): Promise<ReplyUpdateResponseDto> {
    return this.serivce.createReply(input);
  }

  updateReply(
    replyId: ReplyIdParamsDto,
    input: ReplyUpdateBodyDto,
  ): Promise<ReplyUpdateResponseDto> {
    return this.serivce.updateReply(replyId, input);
  }

  deleteReply(
    replyId: ReplyIdParamsDto,
    input: ReplyDeleteQueryDto,
  ): Promise<ReplyUpdateResponseDto> {
    return this.serivce.deleteReply(replyId, input);
  }

  listReplies(input: ReplyListQueryDto): Promise<ReplyListResponseDto> {
    return this.serivce.listReplies(input);
  }
}
