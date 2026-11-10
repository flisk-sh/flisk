# 8. CLI 단위 테스트 작성하기

> 이 페이지는 [08-write-cli-unit-tests.md](../08-write-cli-unit-tests.md)의 번역입니다. 내용이 다르면 영어 버전이 우선합니다.

Flisk의 단위 테스트는 실제 Docker나 Tilt 스택을 실행하지 않고 CLI 명령어, 생성기(generator), 유틸리티 모듈을 검증합니다. 이 가이드에서는 Vitest를 사용하여 빠르고 격리되며(hermetic) 결정론적인(deterministic) 단위 테스트를 작성하는 방법, 외부 시스템을 모킹(mock)하는 방법, 임시 프로젝트와 골든 파일(golden files)로 테스트하는 방법, 그리고 흔한 실수를 방지하는 방법을 설명합니다.

실행 중인 스택을 부팅하는 종단간(E2E) 테스트는 [E2E 테스트 작성하기](../05-write-e2e.md)를 참고하세요. CI 샤드 전반에서 단위 테스트가 어떻게 구성되는지는 [매트릭스에서 단위 테스트 실행하기](../07-unit-test-matrix.md)를 참고하세요.

---

## 1. 단위 테스트 기초

Flisk는 CLI 단위 테스트에 [Vitest](https://vitest.dev/)를 사용합니다.

### 테스트 파일 위치

- 테스트 대상 모듈 바로 옆의 `__tests__/` 디렉터리에 단위 테스트를 배치합니다:
  - CLI 명령어: `cli/src/commands/__tests__/<command>.test.ts`
  - 코드 생성기: `cli/src/generator/__tests__/<generator>.test.ts`
  - 공용 유틸리티: `cli/src/utils/__tests__/<utility>.test.ts`
- **명명 규칙**: 소스 파일 이름 뒤에 `.test.ts`를 붙여 테스트 파일 이름을 지정합니다(Ink 기반 터미널 UI 컴포넌트의 경우 `.test.tsx`). 예를 들어, `completion-install.test.ts`는 `completion-install.ts`를 테스트합니다.

### 핵심 Vitest 구조

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPathSafe } from "../validation.js";

describe("isPathSafe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["ordinary relative path", "src/index.ts", true],
    ["parent traversal (not checked here)", "../secret", true],
    ["null byte", "a\0b", false],
    ["reserved character", "a|b", false],
  ])("%s -> %s", (_label, input, expected) => {
    expect(isPathSafe(input)).toBe(expected);
  });
});
```

### 테이블 기반 테스트 (`it.each`)

순수 함수와 유효성 검사기(validator)에는 매개변수화된 테이블(`it.each`)을 사용하는 것이 좋습니다. 입력을 처리하는 모든 함수는 다음을 테스트해야 합니다:
1. **정상 경로 (Happy path)**: 문서화된 각 형식에 대한 유효한 입력.
2. **빈 값 및 오류 케이스**: 빈 문자열, 누락된 키, 잘못된 형식의 입력, 예외 발생 상황.
3. **경계 조건 (Boundary conditions)**: 경계값 (예: 최소 및 최대 포트 번호, 경로 깊이 제한).

---

가이드의 나머지 부분은 [08-write-cli-unit-tests.md](../08-write-cli-unit-tests.md)에서 영어로 제공됩니다.
