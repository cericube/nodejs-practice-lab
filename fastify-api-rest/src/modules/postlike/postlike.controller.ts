// src/module/postlike/postlike.controller.ts

import type {
  PostLikeIdParamsDto,
  PostLikeParamsDto,
  PostLikePostListResponseDto,
  PostLikeQueryDto,
  PostLikeResponseDto,
  PostLikeUserListResponseDto,
} from './postlike.dto';
import { PostLikeService } from './postlike.service';

export class PostLikeController {
  constructor(private readonly service: PostLikeService) {}

  likePost(input: PostLikeParamsDto): Promise<PostLikeResponseDto> {
    return this.service.likePost(input);
  }

  unlikePost(input: PostLikeParamsDto): Promise<PostLikeResponseDto> {
    return this.service.unlikePost(input);
  }

  getLikedPostsByUser(
    userId: PostLikeIdParamsDto,
    options: PostLikeQueryDto,
  ): Promise<PostLikePostListResponseDto> {
    return this.service.getLikedPostsByUser(userId, options);
  }

  getUsersWhoLikedPost(
    postId: PostLikeIdParamsDto,
    options: PostLikeQueryDto,
  ): Promise<PostLikeUserListResponseDto> {
    return this.service.getUsersWhoLikedPost(postId, options);
  }
}
