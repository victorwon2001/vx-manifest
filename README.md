# tamp스크립트

GitHub 레지스트리 기반 Tampermonkey 로더와 원격 스크립트 저장소다. Tampermonkey에는 `loader/loader.user.js`만 설치하고, 실제 스크립트는 GitHub raw에서 레지스트리와 버전을 확인해 내려받는다. 로더 메뉴에서는 어느 사이트에서든 최상위 관리 모달을 열 수 있다.

## 구조

- `loader/loader.user.js`: 고정 Tampermonkey 로더
- `registry/registry.json`: 스크립트 레지스트리
- `scripts/<scriptId>/meta.json`: 스크립트 메타
- `scripts/<scriptId>/main.js`: 실제 원격 스크립트
- `tools/release.ps1`: 버전업, changelog, commit, push 자동화
- `CHANGELOG.md`: 한국어 변경 이력

## 운영 규칙

- 이벗매니저 접근이 필요한데 로그아웃 상태면 먼저 로그인 후 사용자가 요구한 사이트나 접근권한이 필요한 곳으로 진입
- 새 스크립트를 추가하거나 기존 스크립트를 개선하면 `tools/release.ps1`로 버전업, changelog, commit, push를 함께 처리한다
- 각 PC에서는 Tampermonkey 로더 메뉴로 스크립트별 ON/OFF를 개별 설정한다

## 설치

1. Tampermonkey에 아래 raw URL을 등록한다.
   - `https://raw.githubusercontent.com/victorwon2001/tamp-scripts/main/loader/loader.user.js`
2. Tampermonkey 메뉴에서 `tamp스크립트 로더 열기`를 실행한다.
3. 최상위 모달에서 전체 스크립트 리스트와 상태를 확인한다.
4. 필요하면 개별 `동기화`, `캐시삭제`, `ON/OFF` 또는 `전체 동기화`를 실행한다.

## 설치 URL

- 로더 설치/업데이트 URL: `https://raw.githubusercontent.com/victorwon2001/tamp-scripts/main/loader/loader.user.js`
- 레지스트리 URL: `https://raw.githubusercontent.com/victorwon2001/tamp-scripts/main/registry/registry.json`

## 로더 관리 모달

- 어느 사이트에서든 Tampermonkey 메뉴의 `tamp스크립트 로더 열기`로 접근할 수 있다.
- 모달에서는 전체 스크립트 목록, 현재 페이지 적용 여부, ON/OFF, 캐시 버전, 원격 버전, 마지막 동기화 시각을 볼 수 있다.
- 각 행에서 `동기화`, `캐시삭제`, `ON/OFF`를 직접 조작할 수 있다.
- 상단에서 `현재 페이지만` 필터와 `전체 동기화`, `전체 캐시 삭제`를 실행할 수 있다.

## 테스트

```powershell
node --test C:\Users\victor\tamp스크립트\tests\loader.test.js
```

## 릴리스

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\victor\tamp스크립트\tools\release.ps1 -ScriptId site3217 -Message "site3217 로더 구조로 이관"
```
