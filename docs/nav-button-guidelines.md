# 네비게이션 버튼 추가 규칙

상단 메뉴 버튼이 필요한 모듈은 임의 DOM 삽입보다 공용 helper를 우선 사용한다.

## 기본 원칙

- 버튼 주입은 `shared/nav-menu.js`의 `installNavButton()`을 기본 경로로 사용한다.
- 노출 기준은 `패턴분석기`, `미출고체크`처럼 상단 네비게이션이 있는 일반 화면을 따른다.
- 버튼을 `home` 전용으로 좁히는 식의 page gate는 기본값으로 두지 않는다.
- 특정 작업 화면에서만 숨겨야 하는 예외가 있으면 `shouldRun()`에서 명시적으로 제외한다.

## 구현 규칙

- `buttonId`, `label`, `insertBeforeLabel`은 모듈 상수로 고정한다.
- 재시도, 프레임 탐색, 중복 삽입 방지는 공용 helper에 맡기고 모듈은 `onClick` 동작만 책임진다.
- 직접 `MutationObserver`를 만들거나 메뉴 DOM을 반복 탐색하는 코드는 예외 상황이 아니면 추가하지 않는다.
- 이미 있는 다른 버튼을 가리거나 제거해야 할 때만 `removeLabels`를 사용한다.

## 권장 흐름

```javascript
const navMenu = globalThis.__tmNavMenu;

navMenu.installNavButton(window, {
  buttonId: "tm-sample-nav-button",
  label: "샘플기능",
  insertBeforeLabel: "상담전용창",
  onClick() {
    openDashboard(window);
  },
});
```

## 예외 처리

- 버튼은 일반 상단 메뉴 페이지에서 보이되, 기능과 무관한 별도 작업 화면은 `shouldRun()`에서 제외한다.
- 예외 조건은 URL 패턴으로 짧고 명시적으로 유지한다.
- 예를 들어 `site3217`처럼 특정 작업 화면 하나만 빼야 할 때도 직접 DOM 분기 대신 `shouldRun()`의 제외 패턴으로만 처리한다.
- 예외가 생겨도 공용 helper 경로는 유지하고, 실행 가드만 추가한다.
