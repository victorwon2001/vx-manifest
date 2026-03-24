# 로더 아키텍처

## 목적

로더는 단일 userscript 파일로 설치되고, 원격 구성과 로컬 캐시를 조합해 페이지별 모듈을 실행한다.  
모듈은 `run(context)` 계약만 공유하고, 실제 기능은 `modules/<moduleId>/main.js` 안에서 독립적으로 동작한다.

## 부팅 순서

1. `config/registry.json` 캐시를 먼저 읽는다.
2. 캐시가 있으면 현재 URL과 일치하는 모듈을 즉시 실행한다.
3. 캐시가 없으면 원격 registry를 가져와 필요한 모듈만 받아 실행한다.
4. 부팅 후 background refresh가 registry와 활성 모듈 meta/code를 다시 확인한다.

핵심은 첫 화면 체감 속도를 캐시 기반으로 유지하면서, 원격 변경은 뒤에서 따라오게 만드는 것이다.

## 캐시 계층

모든 키 prefix는 `tm-loader:v1:`를 사용한다.

- `registry:raw`: 마지막 registry 원본
- `registry:checkedAt`: 마지막 registry 확인 시각
- `meta:prewarmedAt`: 마지막 meta/code 예열 시각
- `remote:status`: 신규/업데이트 상태 맵
- `remote:meta`: 최근 원격 meta 캐시
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

## 실행 경로

모듈 실행 순서는 아래와 같다.

1. registry에서 현재 페이지와 맞는 스크립트를 찾는다.
2. 캐시된 meta를 우선 읽고, 필요하면 원격 meta를 받는다.
3. dependency를 먼저 불러와 page window에 평가한다.
4. module code를 평가해 `module.exports.run(context)`를 호출한다.
5. 같은 window에서 같은 버전은 중복 실행하지 않는다.

## 깨진 캐시 복구

로더는 dependency 또는 module code 평가가 `SyntaxError` 같은 예외로 실패하면, 그 캐시를 깨진 것으로 보고 자동 복구를 시도한다.

1. 캐시된 dependency 평가 실패 시 해당 asset cache를 삭제한다.
2. 원격 dependency를 다시 받아 재평가한다.
3. 캐시된 module code 평가 실패 시 script code cache를 삭제한다.
4. 원격 module code를 다시 받아 재평가한다.

따라서 한 번 잘못 저장된 캐시 때문에 모듈이 계속 죽는 상태를 줄일 수 있다.

## 관리창

관리창은 로더 내부 상태를 보여 주는 운영 UI다.

- 현재 페이지 적용 여부
- 캐시 버전 / 원격 버전
- 최근 동기화 시각
- 업데이트 대기 / 신규 모듈 상태

버튼 동작은 모두 실제 페이지 window 기준으로 처리한다.

- `현재 페이지만`
- `전체 동기화`
- `새로고침`
- `전체 캐시 삭제`
- 스크립트별 `켜기/끄기`
- 스크립트별 `동기화`
- 스크립트별 `캐시삭제`

팝업 창을 재사용해도 이벤트 핸들러는 매번 다시 바인딩되도록 유지한다.

## `context.loader` 계약

모듈 `run(context)`에 전달되는 `context.loader`는 아래 helper를 제공한다.

- `request`, `gmRequest`: 네트워크 요청
- `download`: 파일 다운로드
- `copyText`: 클립보드 복사
- `notify`: 사용자 알림
- `openTab`: 새 탭 열기
- `storage.get/set/delete/list`: 모듈별 namespaced 저장소
- `script`: registry 기준 스크립트 정보
- `meta`: 현재 실행 meta 정보
- `capabilities`: meta에 선언된 capability 정보
- `loaderApiVersion`: 현재 loader API 버전

신규 모듈은 직접 전역 GM 함수를 잡기보다 `context.loader`를 기본 경로로 쓰는 것이 안전하다.

## Registry / Meta 계약

`tools/validate-manifest.js`는 아래 항목을 검증한다.

- registry script의 `id`, `name`, `metaPath`, `matches`
- meta의 `id`, `name`, `version`, `entry`
- registry id / meta id 일치 여부
- entry 파일 존재 여부
- dependency path 존재 여부
- optional `capabilities`, `loaderApiVersion` 형식

계약이 깨지면 릴리스 스크립트가 commit/push 전에 중단된다.

## 로더 재설치가 필요한 경우

아래는 관리창 동기화만으로 충분하다.

- 신규 모듈 추가
- 모듈 제거
- 모듈 `main.js` 수정
- 모듈 `meta.json` 수정
- `config/registry.json` 수정
- 공통 dependency 자산 수정

아래는 로더 재설치가 필요하다.

- `client/loader.user.js` 수정
- 새 grant/connect 요구가 생겨 로더 헤더가 바뀐 경우
- `context.loader` 계약을 바꾸는 경우

## UTF-8 주의사항

저장소 파일은 UTF-8 기준이다.  
콘솔 코드페이지가 `949`이면 PowerShell 출력만 깨져 보일 수 있다. 이 경우 파일 자체를 다시 저장하기 전에 실제 인코딩부터 확인한다.
