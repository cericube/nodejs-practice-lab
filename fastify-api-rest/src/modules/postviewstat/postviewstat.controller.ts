// src/modules/postviewstat/postviewstat.controller.ts

import type {
  PostViewStatBucketCountResponseDto,
  PostViewStatBucketSumResponseDto,
  PostViewStatPeriodQueryDto,
  PostViewStatTopViewedQueryDto,
  PostViewStatTopViewedResponseDto,
} from './postviewstat.dto';
import type { PostViewStatService } from './postviewstat.service';

export class PostViewStatController {
  constructor(private readonly postViewStatService: PostViewStatService) {}

  getPostViewCountSumByBucketPeriod(
    input: PostViewStatPeriodQueryDto,
  ): Promise<PostViewStatBucketSumResponseDto> {
    return this.postViewStatService.getPostViewCountSumByBucketPeriod(input);
  }

  getPostViewCountListByBucketPeriod(
    input: PostViewStatPeriodQueryDto,
  ): Promise<PostViewStatBucketCountResponseDto> {
    return this.postViewStatService.getPostViewCountListByBucketPeriod(input);
  }

  getTopViewPostListByBucket(
    input: PostViewStatTopViewedQueryDto,
  ): Promise<PostViewStatTopViewedResponseDto> {
    return this.postViewStatService.getTopViewPostListByBucket(input);
  }
}
