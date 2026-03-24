# VX Manifest

원격 구성 기반 userscript 로더와 모듈 배포본을 관리하는 저장소다. 로더는 `config/registry.json`을 기준으로 필요한 모듈만 동기화하고, 각 모듈은 `modules/<moduleId>` 아래에서 독립적으로 배포된다.

## 구조

- `client/loader.user.js`: 설치용 로더
- `config/registry.json`: 모듈 인덱스
- `modules/<moduleId>/meta.json`: 모듈 메타 정보
- `modules/<moduleId>/main.js`: 모듈 본체
- `shared/`: 공통 런타임 자산
- `tools/release.ps1`: 모듈 릴리스 스크립트
- `tools/validate-manifest.js`: registry/meta 계약 검증기
- `tests/`: 로더, 모듈, 계약 검증 테스트

## 설치

1. 아래 URL로 로더를 설치한다.
   - `https://raw.githubusercontent.com/victorwon2001/vx-manifest/main/client/loader.user.js`
2. Tampermonkey 메뉴에서 `VX Console 열기`를 실행한다.
3. 관리창에서 현재 페이지 적용 여부, 캐시 버전, 원격 버전, 업데이트 상태를 확인한다.

## 로더 동작

로더는 `cache-first + stale-while-revalidate` 방식으로 동작한다.

1. 캐시된 registry, meta, code가 있으면 현재 페이지에 맞는 모듈을 먼저 실행한다.
2. 원격 registry 확인은 백그라운드에서 처리한다.
3. registry가 갱신되면 신규 모듈 추가, 제거 모듈 정리, 원격 버전 상태 갱신을 수행한다.
4. 활성 모듈 meta/code 예열은 별도 주기로 백그라운드에서 진행한다.

## 관리창과 동기화

- 관리창은 `main` 브랜치의 `client/loader.user.js`와 `config/registry.json`을 기준으로 모듈 목록을 표시한다.
- 로더 코드 변경이 없으면 로더 재설치 없이 관리창 `동기화`만으로 새 모듈과 새 버전을 가져올 수 있다.
- 로더 자체가 바뀐 경우에만 로더를 다시 설치해야 한다.
- 각 PC의 ON/OFF 상태와 캐시는 로컬 저장소 기준으로 별도 유지된다.

## 릴리스

모듈 릴리스는 `tools/release.ps1`를 사용한다. 스크립트는 기본적으로 아래 파일만 stage 한다.

- `modules/<id>/meta.json`
- `modules/<id>/main.js`
- `CHANGELOG.md`

공통 파일을 함께 싣는 경우에만 `-ExtraPaths`로 명시한다.

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\victor\tamp스크립트\tools\release.ps1 `
  -ScriptId module-a `
  -Message "모듈 개선" `
  -ExtraPaths @("shared/module-ui.js")
```

릴리스 전에 아래 검증이 자동으로 실행된다.

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

저장소 파일은 UTF-8을 기준으로 관리한다. Windows PowerShell 콘솔 코드페이지가 `949`인 환경에서는 한글이 깨져 보일 수 있지만, 소스 인코딩이 깨진 것이 아니면 파일을 대량 재저장하지 않는다.
