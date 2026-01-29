import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 1. Globals 설정
    globals: true,

    // 2. 환경 설정 (Node.js 서버 로직에 최적화)
    environment: 'node',

    // 3. 파일 포함 경로
    include: ['tests/**/*.test.ts'],

    // 4. 타임아웃
    testTimeout: 10_000,

    // 5. 리포터 설정 : 필요시 사용
    // Vitest 4에서는 'basic' 리포터가 제거되고 'default'가 이를 대체합니다.
    // 'html' 리포터 사용 시 패키지 설치가 필요할 수 있습니다 (npm i -D @vitest/ui)
    // reporters: ['default', 'html'],

    // 모든 테스트 전에 MSW 서버가 자동으로 켜집니다
    //setupFiles: ['./tests/ch06/5-2-1.setup.ts'],

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
      // 진입점(main.ts), 타입 정의(d.ts), 테스트 파일 등은 일반적으로 제외합니다.
      exclude: [
        'src/main.ts', // 앱의 엔트리포인트 (Fastify/Express 부트스트랩 코드 등)
        '**/*.d.ts', // 타입 선언 파일은 실행 코드가 아니므로 제외
        'src/types/**', // 공용 타입 모음 디렉토리
        '**/*.test.ts', // 테스트 자체는 커버리지 측정 대상이 아님
      ],

      // 테스트 실패 조건으로 사용할 최소 커버리지 기준을 설정합니다.
      // 기준 미달 시 CI/CD 파이프라인에서 실패로 처리할 수 있습니다.
      // thresholds: {
      //   lines: 80, // 전체 코드 줄 수 기준 80% 이상 실행되어야 통과
      //   functions: 80, // 함수 기준 80% 이상 호출
      //   branches: 70, // 조건 분기 기준 70% 이상 테스트 커버
      //   statements: 80, // 실행 가능한 명령문 기준 80% 이상 커버
      // },
    },
  },
});
