# 연동데이터 불러오기 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 주문가져오기 자동화 스크립트를 `연동데이터 불러오기` 로더 모듈로 추가하고, 원본 동작을 유지하면서 순수 로직 테스트와 정적 검증을 갖춘 상태로 배포한다.

**Architecture:** 단일 모듈 파일 안에서 순수 로직과 브라우저 런타임을 분리한다. 스캔, 결과 파싱, 완료 판정, 저장소 상태 전이는 테스트 가능한 헬퍼로 만들고, 패널 주입과 대화상자 패치, 폴링 루프, iframe 감시는 런타임 계층에서만 수행한다.

**Tech Stack:** Tampermonkey loader module, plain JavaScript, localStorage, DOM APIs, node:test

---

## Chunk 1: 등록과 테스트 골격

### Task 1: 레지스트리와 메타 등록

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/config/registry.json`
- Create: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/meta.json`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/tests/loader.test.js`

- [ ] **Step 1: 로더 테스트에 `연동데이터 불러오기` 레지스트리/메타 기대값을 추가한다**
- [ ] **Step 2: `node --test C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\tests\\loader.test.js` 로 실패를 확인한다**
- [ ] **Step 3: registry와 meta를 최소 구현으로 추가한다**
- [ ] **Step 4: 같은 테스트를 다시 실행해 통과시킨다**
- [ ] **Step 5: 변경 파일을 커밋한다**

### Task 2: 순수 함수 테스트 골격 작성

**Files:**
- Create: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/tests/order-import-sync.test.js`
- Create: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`

- [ ] **Step 1: 스캔 정규화, 결과 파싱, 완료 판정, 상태 전이 테스트를 먼저 작성한다**
- [ ] **Step 2: `node --test C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\tests\\order-import-sync.test.js` 로 실패를 확인한다**
- [ ] **Step 3: 테스트를 통과시키는 최소 export 뼈대를 추가한다**
- [ ] **Step 4: 같은 테스트를 다시 실행해 실패 지점을 더 구체적으로 줄인다**

## Chunk 2: 순수 로직 구현

### Task 3: 프리뷰 스캔과 정렬 엔진 구현

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/tests/order-import-sync.test.js`

- [ ] **Step 1: 판매처 행 정보를 정규화하는 헬퍼를 구현한다**
- [ ] **Step 2: 신규주문수 `0초과`와 버튼 존재 여부로 필터링하는 헬퍼를 구현한다**
- [ ] **Step 3: 주문수 내림차순, 이름 오름차순 정렬 헬퍼를 구현한다**
- [ ] **Step 4: 관련 테스트만 다시 실행해 통과시킨다**
- [ ] **Step 5: 변경 파일을 커밋한다**

### Task 4: 결과 파싱과 완료 판정 구현

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/tests/order-import-sync.test.js`

- [ ] **Step 1: 결과 테이블 후보를 판정하는 헬퍼를 구현한다**
- [ ] **Step 2: 결과 행에서 성공/실패 집계를 계산하는 헬퍼를 구현한다**
- [ ] **Step 3: 완료 메시지 기반 파서를 구현한다**
- [ ] **Step 4: 주문수 감소 기반 백업 완료 판정 헬퍼를 구현한다**
- [ ] **Step 5: 관련 테스트만 다시 실행해 통과시킨다**
- [ ] **Step 6: 변경 파일을 커밋한다**

### Task 5: 저장소 상태 전이 구현

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/tests/order-import-sync.test.js`

- [ ] **Step 1: 큐, 인덱스, 현재 판매처, 자동확인 상태를 다루는 래퍼를 구현한다**
- [ ] **Step 2: 판매처별 결과 저장과 전체 상태 요약 헬퍼를 구현한다**
- [ ] **Step 3: 실행 시작, 정지, 완료 상태 전이 헬퍼를 구현한다**
- [ ] **Step 4: 관련 테스트만 다시 실행해 통과시킨다**
- [ ] **Step 5: 변경 파일을 커밋한다**

## Chunk 3: 브라우저 런타임 통합

### Task 6: 패널 UI와 자동확인 런타임 이식

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`

- [ ] **Step 1: 로더 진입점과 페이지 매치 가드를 추가한다**
- [ ] **Step 2: 패널 생성, 축소/확장, 상태/로그 업데이트 코드를 이식한다**
- [ ] **Step 3: `confirm/alert/prompt` 자동 처리와 iframe 재패치를 이식한다**
- [ ] **Step 4: 진입 시 자동 프리뷰와 세션 재개 흐름을 연결한다**

### Task 7: 실행 루프와 결과 감지 통합

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`

- [ ] **Step 1: 판매처 버튼 클릭과 결과 대기 루프를 이식한다**
- [ ] **Step 2: 현재 문서와 iframe을 함께 스캔하는 결과 탐색 흐름을 연결한다**
- [ ] **Step 3: 결과 미감지, 타임아웃, 주문수 감소 백업 처리 분기를 연결한다**
- [ ] **Step 4: 판매처별 프리뷰 상태 갱신과 최종 요약 표시를 연결한다**

## Chunk 4: 검증과 릴리스

### Task 8: 전체 검증과 릴리스

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/CHANGELOG.md`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/meta.json`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/order-import-sync/modules/order-import-sync/main.js`

- [ ] **Step 1: `node --test C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\tests\\loader.test.js` 실행**
- [ ] **Step 2: `node --test C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\tests\\order-import-sync.test.js` 실행**
- [ ] **Step 3: `node -c C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\client\\loader.user.js` 실행**
- [ ] **Step 4: `node -c C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\modules\\order-import-sync\\main.js` 실행**
- [ ] **Step 5: `powershell -ExecutionPolicy Bypass -File C:\\Users\\victor\\.config\\superpowers\\worktrees\\tamp스크립트\\order-import-sync\\tools\\release.ps1 -ScriptId order-import-sync -Message "연동데이터 불러오기 추가 및 최적화"` 실행**
- [ ] **Step 6: 원격 브랜치 푸시 후 `main` 반영까지 마무리한다**
