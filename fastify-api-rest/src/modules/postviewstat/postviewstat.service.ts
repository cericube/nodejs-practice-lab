// src/modules/postviewstat/postviewstat.service.ts

import type {
  PostViewStatBucketCountResponseDto,
  PostViewStatBucketSumResponseDto,
  PostViewStatPeriodQueryDto,
  PostViewStatTopViewedQueryDto,
  PostViewStatTopViewedResponseDto,
} from './postviewstat.dto';
import type { PostViewStatRepository } from './postviewstat.repository';

// PostViewStatService
// -------------------
// 조회수 통계 API에서 사용하는 비즈니스 계층입니다.
//
// 이 서비스의 핵심 역할은 다음과 같습니다.
// 1. Controller/Route에서 전달받은 DTO 값을 repository가 사용할 수 있는 형태로 변환합니다.
//    - DTO의 startAt, endAt, bucketAt은 보통 문자열로 들어옵니다.
//    - repository는 Date 객체를 기준으로 버킷 계산과 DB 조회를 수행하므로 new Date()로 변환합니다.
// 2. Repository가 반환한 DB 중심 데이터를 API 응답 DTO 형태로 가공합니다.
//    - Date 객체는 JSON 응답에서 다루기 쉬운 ISO 문자열로 변환합니다.
// 3. 조회수 합계, 기간별 목록, 인기 게시글 목록이라는 유스케이스 단위로 repository 메서드를 호출합니다.
//
// 즉, service는 직접 Prisma 쿼리를 작성하지 않고,
// 입력/출력 형태를 정리한 뒤 실제 데이터 조회 책임은 repository에 위임합니다.
export class PostViewStatService {
  // repository는 생성자 주입 방식으로 받습니다.
  // 이렇게 하면 service는 DB 구현 세부사항에 직접 의존하지 않고,
  // 테스트할 때도 mock repository를 주입하기 쉬워집니다.
  constructor(private readonly repository: PostViewStatRepository) {}

  // 특정 게시글의 특정 버킷 타입(HOURLY/DAILY/MONTHLY)에 대해
  // startAt 이상, endAt 미만 기간의 조회수 합계를 반환합니다.
  //
  // 예:
  // - postId = 1
  // - bucketType = 'DAILY'
  // - startAt = '2026-05-01T00:00:00.000Z'
  // - endAt = '2026-06-01T00:00:00.000Z'
  //
  // 이 경우 repository는 2026년 5월 한 달 동안의 DAILY 조회수 합계를 계산합니다.
  async getPostViewCountSumByBucketPeriod(
    input: PostViewStatPeriodQueryDto,
  ): Promise<PostViewStatBucketSumResponseDto> {
    // DTO의 날짜 값은 문자열일 수 있으므로 Date 객체로 변환합니다.
    // repository 내부에서는 이 Date를 버킷 시작 시각으로 잘라 DB 조회 조건에 사용합니다.
    const result = await this.repository.getPostViewCountSumByBucketPeriod({
      postId: input.postId,
      bucketType: input.bucketType,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    });
    return { count: result };
  }

  // 특정 게시글의 기간별 조회수 목록을 반환합니다.
  //
  // 합계만 반환하는 getPostViewCountSumByBucketPeriod()와 달리,
  // 이 메서드는 각 버킷 시각(bucketAt)별 viewCount 목록을 반환합니다.
  //
  // 예:
  // [
  //   { bucketAt: '2026-05-19T10:00:00.000Z', viewCount: 12 },
  //   { bucketAt: '2026-05-19T11:00:00.000Z', viewCount: 8 }
  // ]
  async getPostViewCountListByBucketPeriod(
    input: PostViewStatPeriodQueryDto,
  ): Promise<PostViewStatBucketCountResponseDto> {
    // repository에는 Date 객체를 전달합니다.
    // startAt/endAt을 Date로 바꿔 두면 날짜 계산 책임을 repository에 명확히 위임할 수 있습니다.
    const result = await this.repository.getPostViewCountsByBucketPeriod({
      postId: input.postId,
      bucketType: input.bucketType,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    });

    // repository가 반환한 Date 객체(bucketAt)를 API 응답에 적합한 ISO 문자열로 변환합니다.
    // Date 객체 자체도 JSON 직렬화가 가능하지만, service에서 명시적으로 변환하면
    // 응답 DTO의 타입과 실제 반환 형태가 더 분명해집니다.
    return result.map((item) => ({
      bucketAt: item.bucketAt.toISOString(),
      viewCount: item.viewCount,
    }));
  }

  // 특정 버킷 시점에서 조회수가 높은 게시글 목록을 반환합니다.
  //
  // bucketType과 bucketAt으로 조회할 통계 버킷을 정하고,
  // limit으로 최대 몇 개의 게시글을 가져올지 지정합니다.
  // limit이 전달되지 않으면 기본값 10개를 사용합니다.
  async getTopViewPostListByBucket(
    input: PostViewStatTopViewedQueryDto,
  ): Promise<PostViewStatTopViewedResponseDto> {
    // input.bucketAt도 문자열 DTO 값이므로 Date 객체로 변환합니다.
    // repository는 이 날짜를 bucketType에 맞게 HOURLY/DAILY/MONTHLY 시작 시각으로 정규화합니다.
    const result = await this.repository.getTopViewPostListByBucket({
      bucketType: input.bucketType,
      date: new Date(input.bucketAt),
      limit: input.limit ?? 10,
    });

    // 인기 게시글 응답에는 게시글 ID와 조회수만 노출합니다.
    // repository 결과를 그대로 반환하지 않고 DTO 구조로 맞춰 반환합니다.
    return result.map((item) => ({
      postId: item.postId,
      viewCount: item.viewCount,
    }));
  }
}
