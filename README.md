# VX Manifest

원격 구성 기반 userscript 로더와 기능 모듈을 관리하는 저장소다.  
로더는 `config/registry.json`을 기준으로 현재 페이지에 맞는 모듈만 불러오고, 각 모듈은 `modules/<moduleId>` 아래에서 독립적으로 배포된다.

## 구조

- `client/loader.user.js`: 공통 로더 userscript
- `config/registry.json`: 모듈 목록과 페이지 매칭 규칙
- `modules/<moduleId>/meta.json`: 모듈 메타 정보
- `modules/<moduleId>/main.js`: 모듈 본체
- `shared/`: 공통 UI, 공통 런타임 자산
- `tools/release.ps1`: 모듈 릴리스 스크립트
- `tools/validate-manifest.js`: registry/meta 계약 검증기
- `tests/`: 로더, 모듈, 계약 검증 테스트
- `docs/loader-architecture.md`: 로더 동작/캐시/운영 규칙
- `docs/module-addition.md`: 신규 모듈 추가 절차

## 설치와 확인

1. Tampermonkey에 `client/loader.user.js`를 설치한다.
2. 메뉴에서 `VX Console 열기`를 실행한다.
3. 관리창에서 현재 페이지 적용 여부, 캐시 버전, 원격 버전, 최근 동기화 시각을 확인한다.

## 로더 동작

로더는 `cache-first + stale-while-revalidate` 방식으로 동작한다.

1. 캐시된 registry, meta, code가 있으면 현재 페이지와 맞는 모듈을 먼저 실행한다.
2. 원격 registry 확인은 부팅 후 백그라운드에서 처리한다.
3. registry가 바뀌면 신규 모듈 추가, 제거 모듈 캐시 정리, 원격 버전 상태 갱신을 반영한다.
4. 활성 모듈의 meta/code는 별도 주기로 백그라운드 예열한다.
5. dependency나 module code 평가가 실패하면 깨진 캐시를 버리고 원격 코드를 다시 받아 자동 복구한다.

## 신규 모듈 추가 핵심 규칙

신규 모듈 추가 전에는 반드시 표시 이름을 먼저 확정한다.  
그 뒤 아래 네 군데를 같이 맞춰야 한다.

- `config/registry.json`
- `modules/<moduleId>/meta.json`
- `modules/<moduleId>/main.js`
- 필요한 경우 `tests/*`

빠른 요약은 이렇다.

1. `moduleId`는 소문자 kebab-case로 정한다.
2. `name`은 사용자에게 보이는 최종 표시 이름으로 확정한다.
3. `registry.json`에 `id`, `name`, `enabledByDefault`, `matches`, `metaPath`를 추가한다.
4. `meta.json`에 `id`, `name`, `version`, `entry`, `dependencies`, `loaderApiVersion`를 맞춘다.
5. `main.js`는 `module.exports = { id, name, version, matches, run }` 계약을 지킨다.
6. 공통 기능은 전역 GM 함수 대신 `context.loader`를 기본 사용 경로로 삼는다.
7. 디자인은 기존 모듈과 `shared/module-ui.js`를 먼저 참고하고, 같은 표면이면 같은 톤과 밀도를 유지한다.
8. 테스트와 `node tools/validate-manifest.js`를 통과시킨다.
9. 릴리스 후 `main`에 반영해야 관리창에서 보인다.

상세 절차는 [docs/module-addition.md](C:/Users/victor/tamp스크립트/docs/module-addition.md)를 본다.

## 관리창과 동기화

- 관리창은 `main` 브랜치의 `client/loader.user.js`와 `config/registry.json` 기준으로 모듈 목록을 보여 준다.
- 기능 브랜치에만 있는 신규 모듈은 관리창에 나타나지 않는다.
- 로더 코드가 바뀌지 않았다면 로더 재설치 없이 관리창 `동기화`만으로 모듈/버전을 가져올 수 있다.
- 로더 파일이 바뀐 경우에만 로더 재설치가 필요하다.

## 릴리스

모듈 릴리스는 `tools/release.ps1`로 진행한다.  
기본 stage 범위는 아래 세 파일이다.

- `modules/<id>/meta.json`
- `modules/<id>/main.js`
- `CHANGELOG.md`

공통 파일이나 registry를 함께 실어야 하면 `-ExtraPaths`로 명시한다.

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\victor\tamp스크립트\tools\release.ps1 `
  -ScriptId new-module `
  -Message "신규 모듈 추가" `
  -ExtraPaths @("config/registry.json", "shared/module-ui.js")
```

릴리스 전에는 아래 검증이 먼저 돈다.

- `node tools/validate-manifest.js`
- `node --test tests/loader.test.js tests/validate-manifest.test.js`

## 테스트

```powershell
node -c C:\Users\victor\tamp스크립트\client\loader.user.js
node C:\Users\victor\tamp스크립트\tools\validate-manifest.js
node --test C:\Users\victor\tamp스크립트\tests\loader.test.js
node --test C:\Users\victor\tamp스크립트\tests\validate-manifest.test.js
node --test C:\Users\victor\tamp스크립트\tests\*.test.js
```

## UTF-8 메모

저장소 파일은 UTF-8 기준으로 관리한다.  
Windows PowerShell 코드페이지가 `949`인 환경에서는 콘솔 출력만 깨져 보일 수 있다. 이 경우 파일 인코딩을 다시 저장하기 전에 실제 파일이 UTF-8인지 먼저 확인한다.
