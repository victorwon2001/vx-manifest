# 로더 아키텍처

## 목적

로더는 단일 userscript 파일로 설치되며, 원격 구성과 로컬 캐시를 조합해 페이지별 모듈을 실행한다. 모듈은 `run(context)` 계약만 공유하고, 실제 기능은 `modules/<moduleId>/main.js` 안에서 독립적으로 동작한다.

## 부팅 순서

1. `config/registry.json` 캐시를 먼저 읽는다.
2. 캐시가 있으면 현재 URL과 일치하는 모듈을 즉시 실행한다.
3. 캐시가 없으면 원격 registry를 불러온 뒤 필요한 모듈을 동기화하고 실행한다.
4. 부팅이 끝나면 background refresh가 registry와 활성 모듈 meta/code를 다시 확인한다.

이 구조 덕분에 재방문 시 체감 로드는 캐시 기반으로 유지하고, 원격 변경은 뒤에서 따라오게 할 수 있다.

## 캐시 계층

키 prefix는 모두 `tm-loader:v1:`를 사용한다.

- `registry:raw`: 마지막 registry 원본
- `registry:checkedAt`: 마지막 registry 확인 시각
- `meta:prewarmedAt`: 마지막 meta/code 예열 시각
- `remote:status`: 신규/업데이트 상태 맵
- `script:<id>:enabled`: PC별 활성화 override
- `script:<id>:meta`: 캐시된 meta
- `script:<id>:code`: 캐시된 main.js
- `script:<id>:assets`: 의존성 캐시 키 목록
- `asset:<id>:<suffix>`: 의존성 코드 캐시

## Background Refresh

- registry 확인 주기: 15분
- 활성 모듈 meta/code 예열 주기: 1시간
- 중복 요청 방지: registry, meta 예열 각각 lock key 사용

registry diff 결과로 신규 모듈 추가, 제거 모듈 캐시 정리, 원격 상태 갱신을 처리한다.

## `context.loader` 계약

모듈 `run(context)`에 전달되는 `context.loader`는 아래 helper를 제공한다.

- `request`, `gmRequest`: 네트워크 요청
- `download`: 파일 다운로드
- `copyText`: 클립보드 복사
- `notify`: 사용자 알림
- `openTab`: 새 탭 열기
- `storage.get/set/delete/list`: 모듈별 namespaced 저장소
- `script`: registry 기준 스크립트 정보
- `meta`: 현재 실행한 meta 정보
- `capabilities`: meta에 선언된 capability 정보
- `loaderApiVersion`: 현재 loader API 버전

기존 모듈 호환을 위해 `request`와 `gmRequest`는 같은 함수를 가리킨다.

## Registry / Meta 계약

`tools/validate-manifest.js`는 아래 항목을 검증한다.

- registry script의 `id`, `name`, `metaPath`, `matches`
- meta의 `id`, `name`, `version`, `entry`
- registry id / meta id 일치 여부
- entry 파일 존재 여부
- dependency path 존재 여부
- optional `capabilities`, `loaderApiVersion` 형식

공통 계약이 깨지면 릴리스 스크립트가 commit/push 전에 중단된다.

## 릴리스 안전 규칙

`tools/release.ps1`는 기본적으로 모듈 파일과 changelog만 stage 한다.

- `modules/<id>/meta.json`
- `modules/<id>/main.js`
- `CHANGELOG.md`

공통 파일은 `-ExtraPaths`로 명시해야 한다. 이미 staged 된 파일 중 허용 범위를 벗어난 항목이 있으면 릴리스는 실패한다.

## UTF-8 주의사항

저장소 파일은 UTF-8 기준이다. 콘솔 코드페이지가 `949`이면 PowerShell 출력만 깨져 보일 수 있다. 이 경우 소스 인코딩을 다시 저장하기보다, 파일 자체가 UTF-8인지 먼저 확인한다.
