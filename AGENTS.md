# AGENTS.md 지침 - nodejs-practice-lab

## 적용 범위

- 이 파일은 `D:\NodejsDevelope\workspace\nodejs-practice-lab` 전체 워크스페이스에 적용한다.
- 특정 서브 프로젝트에 별도 `AGENTS.md`가 있으면, 해당 폴더 안의 작업에는 더 가까운 `AGENTS.md` 지침을 우선 적용한다.
- 서브 프로젝트 전용 규칙은 루트 지침에 섞지 않고 각 서브 프로젝트의 `AGENTS.md`에 둔다.

## 환경 설정

- 기본 터미널은 Windows PowerShell을 사용한다.
- 이 워크스페이스에서는 아래 Node.js 경로를 우선 사용한다.

```json
{
  "terminal.integrated.env.windows": {
    "PATH": "D:\\NodejsDevelope\\node-v24.11.0;${env:PATH}"
  }
}
```

## 프로젝트 경로

- 메인 프로젝트: `D:\NodejsDevelope\workspace\nodejs-practice-lab`
- 서브 프로젝트 예시:
  - `D:\NodejsDevelope\workspace\nodejs-practice-lab\redis-examples`
  - `D:\NodejsDevelope\workspace\nodejs-practice-lab\fastify-api-rest`

## 기본 작업 원칙

- `nodejs-practice-lab`를 전체 워크스페이스 루트로 본다.
- 작업 전에 관련 파일과 폴더 구조를 먼저 확인하고, 기존 코드 스타일을 따른다.
- 요청 범위에 필요한 파일만 수정한다.
- 사용자가 명시적으로 요청하지 않은 다른 서브 프로젝트는 수정하지 않는다.
- 기존 사용자 변경 사항이 있으면 임의로 되돌리지 않고, 필요한 경우 그 변경 사항을 존중해서 작업한다.
- 불필요한 대규모 리팩터링이나 새 의존성 추가는 피한다.

## 명령 실행 기준

- Windows 환경이므로 PowerShell 명령을 우선 사용한다.
- 파일이나 문자열 검색은 가능하면 `rg` 또는 `rg --files`를 사용한다.
- `package.json`이 있는 프로젝트 폴더에서 패키지 매니저 명령을 실행한다.
- 서브 프로젝트에 별도 `package.json`이 있으면 해당 서브 프로젝트 폴더에서 `npm install`, `npm test`, `npm run ...` 같은 명령을 실행한다.
- 의존성 설치나 네트워크 접근이 필요한 작업은 먼저 사용자 의도와 필요성을 확인하고 진행한다.

## 검증 기준

- 코드 변경 후 가능한 가장 좁은 범위의 검증을 실행한다.
- 예: 테스트, 린트, 타입 체크, 빌드, 또는 변경한 예제 스크립트 실행.
- 검증하지 못하면 그 이유를 명확히 보고한다.
- 검증 명령이 실패하면 실패 원인을 요약하고, 필요한 수정 또는 다음 조치를 제안한다.

## 응답 기준

- 사용자에게는 한국어로 응답한다.
- 변경한 파일과 핵심 내용을 간단히 요약한다.
- 실행한 검증 명령과 결과를 함께 보고한다.
- 검증하지 못한 경우에는 숨기지 말고 제한 사항을 명확히 설명한다.
