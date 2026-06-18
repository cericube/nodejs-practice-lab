// src/redis/redis-key.ts

/**
 * Redis Key 규칙을 한 곳에서 관리하는 유틸입니다.
 *
 * 기본 규칙:
 * - cache:*   : JSON 캐시
 * - string:*  : Redis String 실습
 * - hash:*    : Redis Hash 실습
 * - list:*    : Redis List 실습
 * - set:*     : Redis Set 실습
 * - zset:*    : Redis Sorted Set 실습
 * - stream:*  : Redis Stream 실습
 * - channel:* : Redis Pub/Sub 실습
 */
export const RedisKey = {
  cache: {
    user: (userId: number) => `cache:user:${userId}`, // 사용자 단건 조회 캐시
  },

  string: {
    authCode: (email: string) => `string:auth-code:${email}`, // 이메일 인증 코드
    rateLimit: (key: string) => `string:rate-limit:${key}`, // 요청 횟수 제한
    postViewCount: (postId: number) => `string:post-view-count:${postId}`, // 게시글 조회수 카운터
  },

  hash: {
    userProfile: (userId: number) => `hash:user-profile:${userId}`, // 사용자 프로필 캐시
    userSession: (sessionId: string) => `hash:session:${sessionId}`, // 로그인 세션 정보
    userSetting: (userId: number) => `hash:user-setting:${userId}`, // 사용자 설정 정보
    productStock: (productId: number) => `hash:product-stock:${productId}`, // 상품 재고 상태
  },

  list: {
    postRecentViews: (userId: number) => `list:user:${userId}:recent-posts`, // 최근 본 게시글 목록
    searchRecent: (userId: number) => `list:user:${userId}:recent-searches`, // 최근 검색어 목록
    simpleJobQueue: () => `list:simple-job-queue`, // 간단한 작업 큐
    logBuffer: () => `list:log-buffer`, // 최근 로그 버퍼
  },

  set: {
    postLikes: (postId: number) => `set:post-likes:${postId}`, // 게시글 좋아요 사용자 목록
    dailyVisitors: (date: string) => `set:daily-visitors:${date}`, // 일일 방문자 중복 제거
    onlineUsers: () => `set:online-users`, // 현재 온라인 사용자 목록
    duplicateRequest: (requestId: string) => `set:duplicate-request:${requestId}`, // 중복 요청 방지
  },

  zset: {
    postRanking: () => `zset:post-ranking`, // 인기 게시글 랭킹
    searchRanking: () => `zset:search-ranking`, // 인기 검색어 순위
    userPointRanking: () => `zset:user-point-ranking`, // 사용자 포인트 랭킹
    priorityQueue: () => `zset:priority-queue`, // 우선순위 큐
  },

  stream: {
    orders: () => `stream:orders`, // 주문 이벤트 스트림
    notifications: () => `stream:notifications`, // 알림 이벤트 큐
    emails: () => `stream:emails`, // 이메일 작업 큐
    auditLogs: () => `stream:audit-logs`, // 감사 로그 스트림
  },

  channel: {
    notification: () => `channel:notification`, // 실시간 알림 채널
    cacheInvalidation: () => `channel:cache-invalidation`, // 캐시 무효화 채널
    chat: (roomId: string) => `channel:chat:${roomId}`, // 채팅방 메시지 채널
    adminNotice: () => `channel:admin-notice`, // 관리자 공지 채널
  },
} as const;
