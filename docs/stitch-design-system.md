# Stitch 디자인 시스템 작업 규칙

## 목적

Stitch 레퍼런스는 단순 스크린샷 보관이 아니라, 실제 코드 번역의 기준이 되는 디자인 자산으로 관리한다.
새 기준을 만들 때는 기존 asset을 덮어쓰지 말고 새 asset과 새 reference screen을 분리해서 생성한다.

## 저장 규칙

- `DESIGN.md`는 markdown 파일 자체를 저장하는 개념이 아니다.
- MCP에서는 `DesignSystem.theme.designMd` 문자열로 저장한다.
- `create_design_system`, `update_design_system`에는 raw markdown 문자열이 아니라 `DesignSystem` 객체를 보낸다.
- `list_design_systems`가 반환한 전체 asset 객체를 그대로 다시 `update_design_system`에 보내지 않는다.
  - `namedColors` 같은 확장 필드는 제거한다.
  - 허용 필드만 다시 구성해서 보낸다.

## 권장 theme 필드

- `displayName`
- `theme.colorMode`
- `theme.headlineFont`
- `theme.bodyFont`
- `theme.labelFont`
- `theme.roundness`
- `theme.customColor`
- `theme.colorVariant`
- `theme.overridePrimaryColor`
- `theme.overrideSecondaryColor`
- `theme.overrideTertiaryColor`
- `theme.overrideNeutralColor`
- `theme.designMd`

## 적용 규칙

- 새 design system asset을 만든 뒤, 레퍼런스 screen을 생성한다.
- 생성된 screen을 프로젝트에 둔 상태에서 `get_project`로 `screenInstances`를 다시 읽는다.
- `apply_design_system`은 screen id 문자열 배열이 아니라 `{ id, sourceScreen }` 객체 배열을 쓴다.
- 기준 절차는 아래 순서로 고정한다.
  1. 새 asset 생성
  2. reference screen 생성
  3. `get_project`로 `screenInstances` 재조회
  4. `apply_design_system`으로 새 asset 적용
  5. 최종 screenshot 기준으로 코드 번역

## 현재 운영 기준

- 기준 프로젝트: `17597125723148867155`
- 기존 asset: `Gridstone Neo`
- 신규 운영 asset: `Gridstone Mono Ops`

`Gridstone Mono Ops`는 아래 방향을 기준으로 유지한다.

- 블랙/화이트 중심
- 블루: 주요 액션, 진행, 성공
- 레드: 경고, 오류, 음수
- 도킹형 패널은 우측 상단 고정
- 표는 기본 가운데 정렬
- 긴 열만 좌측 정렬
- 스크롤 표의 첫 헤더 행은 불투명 sticky 헤더

## 네비게이션 버튼 규칙

- 상단 메뉴 버튼은 공용 helper를 우선 사용한다.
- page-specific gate는 예외 화면만 차단한다.
- 버튼 주입 로직을 모듈마다 새로 만들지 말고, 공용 경로를 먼저 검토한다.
