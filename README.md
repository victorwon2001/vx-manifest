# VX Manifest

공개 저장소에는 로더, 구성 파일, 모듈 배포본과 운영 도구만 둡니다. 설치 측에서는 원격 구성 정보를 조회해 필요한 모듈만 동기화하고 실행합니다.

## 구조

- `client/loader.user.js`: 설치용 로더
- `config/registry.json`: 구성 인덱스
- `modules/<moduleId>/meta.json`: 모듈 메타 정보
- `modules/<moduleId>/main.js`: 모듈 본체
- `tools/release.ps1`: 버전, changelog, commit, push 처리 스크립트
- `CHANGELOG.md`: 변경 이력

## 설치

1. 아래 raw URL로 로더를 설치합니다.
   - `https://raw.githubusercontent.com/victorwon2001/vx-manifest/main/client/loader.user.js`
2. Tampermonkey 메뉴에서 `VX Console 열기`를 실행합니다.
3. 팝업 관리창에서 모듈 상태를 확인하고 동기화나 ON/OFF를 조정합니다.

## 주요 주소

- 로더 설치/업데이트 URL: `https://raw.githubusercontent.com/victorwon2001/vx-manifest/main/client/loader.user.js`
- 구성 URL: `https://raw.githubusercontent.com/victorwon2001/vx-manifest/main/config/registry.json`

## 반영 경로

- 관리창은 `main` 브랜치의 로더와 구성 파일을 기준으로 모듈 목록을 표시합니다.
- 기능 브랜치에만 올라간 모듈은 관리창에 나타나지 않습니다. 관리창 노출이 필요하면 `config/registry.json`, `modules/<moduleId>/*` 변경이 최종적으로 `origin/main`에 반영되어야 합니다.
- 로더 코드 변경이 없는 경우에는 로더 재설치가 필요하지 않습니다. `main` 반영 후 관리창에서 동기화하면 새 모듈을 불러옵니다.

## 운영 메모

- 공개 문서에는 내부 운영 맥락이나 외부 서비스명을 직접 쓰지 않습니다.
- 각 PC의 ON/OFF 상태는 로컬 저장소 기준으로 따로 유지됩니다.
- 모듈 개선 시 `tools/release.ps1`로 버전과 changelog를 함께 갱신합니다.
- 기본 검증은 단위 테스트, 정적 검증, 계약 검증을 우선합니다.
- 실제 프론트 조작이나 부작용이 있는 기능 검증은 프론트 확인 단계나 별도 테스트 환경에서 진행합니다.

## 테스트

```powershell
node --test C:\Users\victor\tamp스크립트\tests\loader.test.js
node -c C:\Users\victor\tamp스크립트\client\loader.user.js
```

## 릴리스 예시

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\victor\tamp스크립트\tools\release.ps1 -ScriptId module-a -Message "모듈 개선"
```
