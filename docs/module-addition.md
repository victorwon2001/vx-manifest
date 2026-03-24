# 신규 모듈 추가 가이드

## 목표

신규 모듈을 추가할 때 필요한 파일, 계약, 테스트, 릴리스 절차를 한 번에 정리한 문서다.  
이 문서 기준으로 추가하면 관리창 노출, 동기화, 캐시, 릴리스 흐름이 맞게 연결된다.

## 1. 이름과 ID 확정

먼저 사용자에게 표시 이름을 확인받는다.

- 표시 이름: 관리창과 UI에 그대로 보이는 이름
- `moduleId`: 소문자 kebab-case

예시:

- 표시 이름: `재고이동 자동화`
- `moduleId`: `stock-move-automation`

이름은 아래 두 파일에서 반드시 같아야 한다.

- `config/registry.json`
- `modules/<moduleId>/meta.json`

## 2. 필요한 파일 만들기

신규 모듈은 최소 아래 두 파일이 필요하다.

- `modules/<moduleId>/meta.json`
- `modules/<moduleId>/main.js`

대부분의 경우 registry도 함께 수정한다.

- `config/registry.json`

필요하면 테스트도 추가한다.

- `tests/<module>.test.js`
- 또는 기존 `tests/loader.test.js` / 계약 테스트 보강

## 3. registry 등록

`config/registry.json`에 새 스크립트를 추가한다.

필수 필드:

- `id`
- `name`
- `enabledByDefault`
- `matches`
- `metaPath`

예시:

```json
{
  "id": "new-module",
  "name": "신규 모듈",
  "enabledByDefault": true,
  "matches": [
    "https://example.com/path*"
  ],
  "metaPath": "modules/new-module/meta.json"
}
```

## 4. meta.json 작성

`modules/<moduleId>/meta.json`에는 실행에 필요한 메타 정보를 넣는다.

기본 예시:

```json
{
  "id": "new-module",
  "name": "신규 모듈",
  "version": "0.1.0",
  "description": "신규 모듈 설명",
  "entry": "modules/new-module/main.js",
  "dependencies": [
    {
      "id": "module-ui",
      "version": "0.2.2",
      "path": "shared/module-ui.js"
    }
  ],
  "checksum": "",
  "loaderApiVersion": 2,
  "updatedAt": "2026-03-24 12:00:00"
}
```

메모:

- `id`는 registry와 반드시 같아야 한다.
- `entry`는 실제 파일 경로와 같아야 한다.
- 공통 UI를 쓰면 `shared/module-ui.js` dependency를 넣는다.
- 새 모듈은 `loaderApiVersion: 2` 기준을 기본으로 쓴다.
- `capabilities`는 필요할 때만 optional로 선언한다.

## 5. main.js 작성

모듈은 CommonJS 형태로 export 해야 한다.

최소 계약:

```javascript
module.exports = (function (root) {
  "use strict";

  const MODULE_ID = "new-module";
  const MODULE_NAME = "신규 모듈";
  const MATCHES = ["https://example.com/path*"];

  function run(context) {
    const win = context && context.window ? context.window : root;
    const loader = context && context.loader ? context.loader : null;
    void win;
    void loader;
  }

  return {
    id: MODULE_ID,
    name: MODULE_NAME,
    version: "0.1.0",
    matches: MATCHES,
    run,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
```

권장 사항:

- 전역 GM 함수 대신 `context.loader`를 우선 사용한다.
- 공통 UI는 `globalThis.__tmModuleUi` 또는 dependency가 주입하는 helper를 사용한다.
- 부작용 있는 자동 실행은 `run(context)` 안에서만 시작한다.
- top-level에서 대상 페이지 DOM을 바로 건드리지 않는다.

## 6. 디자인 기준

신규 모듈 UI는 기존 디자인을 기준으로 맞춘다.  
같은 표면에 뜨는 모듈이면 새 레이아웃을 발명하기보다 기존 셸과 토큰을 재사용하는 것이 우선이다.

기본 원칙:

- 먼저 기존 모듈과 `shared/module-ui.js`를 읽고, 이미 있는 패널/팝업/툴바 구조를 최대한 따른다.
- 같은 표면이면 같은 밀도와 톤을 유지한다.
  - 임베디드 툴바형
  - 플로팅 패널형
  - 독립 팝업형
- 색은 상태 강조나 주요 액션에만 제한적으로 쓴다.
- 과한 카드 중첩, 과한 그라디언트, 과한 장식보다 읽기 쉬운 운영 UI를 우선한다.
- 버튼 높이, 필드 높이, 테이블 패딩은 기존 모듈과 맞춘다.
- 가능하면 공통 클래스와 토큰으로 해결하고, 모듈 전용 CSS는 부족한 부분만 최소로 추가한다.

실무 기준:

- `shared/module-ui.js`로 표현 가능한 구조면 새 스타일 시스템을 만들지 않는다.
- 같은 기능군의 기존 모듈이 있으면 제목 구조, 상태 바, 액션 배치, 테이블 모양을 먼저 참고한다.
- 새 폰트, 새 색 체계, 새 상호작용 패턴은 기존 UI로 해결이 안 될 때만 검토한다.

## 7. dependency와 공통 자산

공통 UI나 vendor 자산이 필요하면 `meta.json`의 `dependencies`에 넣는다.

예시:

- `shared/module-ui.js`
- `shared/nav-menu.js`
- `vendor/xlsx.full.min.js`
- `vendor/jquery-3.6.0.min.js`

로더는 dependency를 먼저 평가하고, 이후 모듈 본체를 실행한다.  
캐시된 dependency가 깨져 있어도 현재 로더는 자동으로 다시 받아 복구한다.

네비게이션 바에 버튼을 추가하는 모듈이면 `shared/nav-menu.js`를 우선 쓴다.

- 기본 selector는 `.nav.navbar-nav.navbar-right`다.
- 버튼 위치는 `insertBeforeLabel` 또는 `insertAfterLabel`로 맞춘다.
- 기존 메뉴를 숨기거나 치워야 하면 `removeLabels`를 쓴다.
- 모듈 안에서 직접 `MutationObserver`, 재시도 타이머, 메뉴 삽입 코드를 매번 다시 쓰지 않는다.

예시:

```javascript
const navMenu = globalThis.__tmNavMenu;

navMenu.installNavButton(window, {
  buttonId: "tm-new-module-nav-button",
  label: "새 기능",
  insertBeforeLabel: "상담전용창",
  removeLabels: ["알림", "메모"],
  onClick() {
    openDashboard(window);
  },
});
```

## 8. 테스트와 검증

신규 모듈 추가 후 최소한 아래 검증은 돌린다.

```powershell
node C:\Users\victor\tamp스크립트\tools\validate-manifest.js
node --test C:\Users\victor\tamp스크립트\tests\*.test.js
```

가능하면 아래도 추가한다.

- export 계약 테스트
- HTML builder / 상태 reducer / parser 같은 순수 함수 테스트
- registry/meta 정합성 테스트

## 9. 릴리스

모듈 추가나 개선은 `tools/release.ps1`로 버전, changelog, commit, push를 같이 처리한다.

신규 모듈 추가는 registry가 같이 바뀌므로 `-ExtraPaths`에 `config/registry.json`을 넣는 것이 기본이다.

예시:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\victor\tamp스크립트\tools\release.ps1 `
  -ScriptId new-module `
  -Message "신규 모듈 추가" `
  -ExtraPaths @("config/registry.json")
```

공통 자산도 같이 바뀌면 `shared/module-ui.js` 같은 파일을 `-ExtraPaths`에 추가한다.

## 10. 관리창 노출과 반영

중요한 점:

- 관리창 노출 기준은 `main` 브랜치의 `client/loader.user.js`와 `config/registry.json`이다.
- 기능 브랜치에만 올린 신규 모듈은 관리창에 보이지 않는다.
- 사용자가 로더에서 바로 테스트하길 원하면 최종적으로 `main`에 반영해야 한다.

## 11. 로더 재설치가 필요한지 판단

아래는 로더 재설치가 필요 없다.

- 신규 모듈 추가
- registry 수정
- meta 수정
- module code 수정
- shared dependency 수정

이 경우 `main` 반영 후 관리창 `동기화`로 충분하다.

아래는 로더 재설치가 필요하다.

- `client/loader.user.js` 수정
- 새 grant/connect 요구가 생긴 경우
- `context.loader` 계약 변경

## 12. 실제 작업 체크리스트

작업 전에:

1. 표시 이름 확인
2. `moduleId` 결정
3. 페이지 매칭 규칙 정리
4. dependency 필요 여부 정리
5. 기존 디자인 참고 대상 선정

작업 중:

1. `meta.json` 생성
2. `main.js` 생성
3. `config/registry.json` 등록
4. 기존 모듈과 공통 UI 기준으로 구조와 스타일 맞춤
5. 테스트 추가/수정
6. `validate-manifest` 통과 확인

작업 후:

1. `tools/release.ps1` 실행
2. `main` 반영
3. 로더 수정이 없으면 관리창 동기화 안내
4. 로더 수정이 있으면 재설치 안내
