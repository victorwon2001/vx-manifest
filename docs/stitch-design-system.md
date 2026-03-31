# Stitch 디자인 시스템 작업 규칙

## 목적

Stitch는 단순 스크린샷 보관용이 아니라, 실제 코드 반영 기준이 되는 운영 UI 레퍼런스를 관리하는 곳으로 사용한다.
기존 asset을 덮어쓰기보다 새 asset과 reference screen을 분리해서 관리한다.

## 현재 기준

- 프로젝트: `17597125723148867155`
- 주 기준 asset: `Gridstone Mono Ops`
- asset id: `assets/15864920938751748475`

현재 기준 reference screen은 아래 6개다.

- `Operator Panel - Docked View`
- `Operator Panel - Running State`
- `Operational Data Table Modal`
- `Data Details Modal`
- `Scan & Filter Workspace`
- `Operational Summary Popup`

이 6개 화면을 공통 운영 UI의 기준 화면으로 본다.

## 저장 규칙

- `DESIGN.md`는 markdown 파일 자체를 따로 저장하는 개념이 아니다.
- MCP에서는 `DesignSystem.theme.designMd` 문자열로 저장한다.
- `create_design_system`, `update_design_system`에는 raw markdown만 보내지 않고 `DesignSystem` 객체를 보낸다.
- `list_design_systems` 결과를 그대로 `update_design_system`에 다시 보내지 않는다.
  - `namedColors` 같은 확장 필드는 제거한다.
  - 허용 필드만 다시 구성해서 보낸다.

## 권장 DesignSystem 필드

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

작업 순서는 아래로 고정한다.

1. 새 design system asset 생성 또는 기존 기준 asset 업데이트
2. reference screen 생성 또는 기존 reference screen 확인
3. `get_project` 또는 `list_screens`로 실제 screen / screen instance 상태 확인
4. `apply_design_system`으로 기준 asset 적용
5. 최종 screen 구조를 코드 기준으로 번역

## apply_design_system 주의점

- `apply_design_system`은 실제 프로젝트의 screen instance id를 기준으로 적용한다.
- 같은 프로젝트 안에 동일한 screen source가 여러 instance로 놓일 수 있으므로, 적용 전에 현재 프로젝트의 instance id를 다시 확인한다.

## 디자인 방향

`Gridstone Mono Ops`는 아래 원칙을 기준으로 사용한다.

- 블랙/화이트 중심의 운영 톤
- 블루는 주요 액션, 진행, 성공
- 레드는 경고, 오류, 음수
- 도킹형 버튼과 패널은 같은 한 장의 시트처럼 보여야 함
- 테이블은 기본 가운데 정렬
- 긴 텍스트 열만 좌측 정렬
- 스크롤 영역의 첫 헤더 행은 불투명 sticky 헤더

## 네비게이션 버튼 규칙

- 상단 메뉴 버튼은 공용 helper를 우선 사용한다.
- page-specific gate는 예외 화면만 차단하는 용도로만 둔다.
- 새 버튼 로직을 모듈마다 새로 만들기 전에 공용 helper로 해결 가능한지 먼저 확인한다.
