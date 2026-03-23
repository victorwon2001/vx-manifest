# 재고이동 자동화 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 재고이동 자동화 스크립트를 `재고이동 자동화` 로더 모듈로 추가하고, 순수 함수 테스트와 계약 검증을 갖춘 상태로 배포한다.

**Architecture:** 단일 모듈 파일 안에서 순수 로직과 브라우저 런타임을 분리한다. 입력 파싱, 검증 판정, 그룹화, 저장 파라미터 생성은 테스트 가능한 헬퍼로 만들고, 페이지 주입과 네트워크 호출은 런타임 계층에서만 수행한다.

**Tech Stack:** Tampermonkey loader module, plain JavaScript, localStorage, GM_xmlhttpRequest, node:test

---

## Chunk 1: 등록과 테스트 골격

### Task 1: 레지스트리/메타 등록

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/config/registry.json`
- Create: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/meta.json`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/tests/loader.test.js`

- [ ] **Step 1: 실패하는 로더 테스트를 먼저 추가한다**
- [ ] **Step 2: `node --test ...\\tests\\loader.test.js` 로 실패를 확인한다**
- [ ] **Step 3: registry와 meta를 최소 구현으로 추가한다**
- [ ] **Step 4: 같은 테스트를 다시 실행해 통과시킨다**

### Task 2: 순수 함수 테스트 골격 작성

**Files:**
- Create: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/tests/stock-move-automation.test.js`
- Create: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/main.js`

- [ ] **Step 1: 파서, 검증, 그룹화, 파라미터 생성, 상태 갱신 테스트를 먼저 작성한다**
- [ ] **Step 2: `node --test ...\\tests\\stock-move-automation.test.js` 로 실패를 확인한다**
- [ ] **Step 3: 테스트를 통과시키는 최소 export 뼈대를 추가한다**

## Chunk 2: 순수 로직 구현

### Task 3: 입력/검증 엔진 구현

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/main.js`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/tests/stock-move-automation.test.js`

- [ ] **Step 1: 입력 라인 파싱과 중복 병합 구현**
- [ ] **Step 2: 검색 결과 기반 검증 판정 구현**
- [ ] **Step 3: 목적지/출발지 그룹화 구현**
- [ ] **Step 4: 관련 테스트를 재실행해 통과시킨다**

### Task 4: 저장 파라미터 및 상태 로직 구현

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/main.js`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/tests/stock-move-automation.test.js`

- [ ] **Step 1: 목적지 선택 매칭 함수 구현**
- [ ] **Step 2: 배치 폼 데이터 파싱/직렬화 헬퍼 구현**
- [ ] **Step 3: 로그/통계/큐 상태 갱신 헬퍼 구현**
- [ ] **Step 4: 관련 테스트를 재실행해 통과시킨다**

## Chunk 3: 브라우저 런타임 통합

### Task 5: 메인/Edit 런타임 이식

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/main.js`

- [ ] **Step 1: 로더 진입점과 페이지 판별 추가**
- [ ] **Step 2: 메인 페이지 GUI와 검증 UI를 이식**
- [ ] **Step 3: edit 페이지 처리와 팝업 오버라이드를 이식**
- [ ] **Step 4: 원본 기능과 동일한 localStorage 키 흐름으로 연결한다**

## Chunk 4: 검증과 릴리스

### Task 6: 정적 검증과 릴리스

**Files:**
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/CHANGELOG.md`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/meta.json`
- Modify: `C:/Users/victor/.config/superpowers/worktrees/tamp스크립트/stock-move-automation/modules/stock-move-automation/main.js`

- [ ] **Step 1: `node --test ...\\tests\\loader.test.js` 실행**
- [ ] **Step 2: `node --test ...\\tests\\stock-move-automation.test.js` 실행**
- [ ] **Step 3: `node -c ...\\client\\loader.user.js` 와 `node -c ...\\modules\\stock-move-automation\\main.js` 실행**
- [ ] **Step 4: `tools/release.ps1 -ScriptId stock-move-automation -Message \"재고이동 자동화 추가 및 최적화\"` 실행**
