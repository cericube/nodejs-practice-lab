import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // describe/it/expect를 테스트 파일에서 바로 사용할 수 있게 합니다.
    globals: true,

    // Fastify/Prisma 서버 코드를 테스트하므로 브라우저 대신 Node 런타임을 사용합니다.
    environment: 'node',

    // 기능별 테스트를 tests 아래에 모으는 현재 디렉터리 규칙입니다.
    include: ['test/**/*.test.ts'],

    // DB 통합 테스트가 포함되어 있어 기본값보다 여유 있게 둡니다.
    testTimeout: 10_000,

    // 6. 커버리지 설정
    coverage: {
      enabled: true, // 테스트 실행 시 커버리지 수집을 활성화합니다.
      provider: 'v8', // V8 엔진의 native coverage API를 사용하는 공급자 (빠르고 정확함)
      reporter: ['text', 'json', 'html'], // 생성할 커버리지 리포트 형식 (터미널 출력, JSON, 브라우저 HTML 등)
      reportsDirectory: './coverage', // 커버리지 리포트가 저장될 디렉터리 경로

      // 커버리지 측정 대상 파일을 지정합니다.
      // 보통 테스트 대상 소스코드를 포함하는 경로를 지정합니다.
      include: ['src/**/*.ts'],
      //include: ['src/ch08/*.ts'], // ch08 테스트용
      // 커버리지에서 제외할 파일 목록입니다.
      // 서버 엔트리포인트, 타입 정의(d.ts), 테스트 파일 등은 일반적으로 제외합니다.
      exclude: [
        '**/*.d.ts', // 타입 선언 파일은 실행 코드가 아니므로 제외
        '**/*.test.ts', // 테스트 자체는 커버리지 측정 대상이 아님
      ],
    },
  },
});
