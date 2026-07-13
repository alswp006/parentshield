# TASKS (SPEC → Implementable)

## Epic 1. TypeScript types + interfaces (src/lib/types.ts)
### Task 1.1 타입/계약 단일 소스 정의 (+ RouteState 필수)
- Description: SPEC의 모든 엔티티/에러/API/Page/라우트 state 계약을 **런타임 코드 없이** `src/lib/types.ts`에 정의한다. (페이지 간 `location.state` 불일치 방지)
- DoD:
  - `src/lib/types.ts`에 아래 항목들이 **컴파일 에러 없이 export** 된다.
    - Core: `ChildProfile`, `AppCategory`, `TimeRule`, `SessionLog`, `RiskLevel`, `ContentCheck`
    - Premium/UI: `PremiumEntitlement`, `UiFlags`
    - Storage errors: `StorageErrorCode`, `StorageError`(class)
    - Pagination: `Page<T>`, `GetSessionLogsPageParams`, `GetContentChecksPageParams`
    - External API: `ContentCheckCreateRequest`, `ContentCheckCreateResponse`, `ApiErrorResponse`
  - **RouteState 타입이 반드시 포함**되며, 아래 라우트의 `location.state` shape가 정확히 명시된다:
    - `"/": undefined`
    - `"/profile": undefined | { childId: string }`
    - `"/rules": undefined`
    - `"/rules/new": undefined | { ruleId: string }`
    - `"/timer": undefined | { childId: string }`
    - `"/content-check": undefined | { childId: string }`
    - `"/content-check/result": undefined | { checkId: string }`
    - `"/report": undefined`
    - `"/premium": undefined`
    - `"/settings": undefined`
- Covers: [라우팅 state 계약(공통), F1-AC1(타입 기반 안정성 전제)]
- Files: [`src/lib/types.ts`]
- Depends on: [none]

**Risk Analysis (Epic 1)**
- Complexity: Low
- Risk factors: RouteState 누락/오타로 페이지 간 state 불일치 → 런타임 크래시
- Mitigation: 첫 태스크에서 RouteState를 “단일 진실 소스”로 고정, 이후 페이지에서 import 강제


---

## Epic 2. Data layer (storage helpers, state management)

### Task 2.1 localStorage 코어 래퍼 구현 (readStore/writeStore/writeManyTransactionally)
- Description: SPEC의 스토리지 접근 래퍼를 그대로 구현해 에러 코드로 판정 가능하게 만든다.
- DoD:
  - `readStore<T>(key,fallback)`:
    - `getItem(key)===null` → `fallback` 반환
    - `JSON.parse` 실패 → `StorageError{code:"PARSE_ERROR", key}` throw
    - 그 외 예외 → `StorageError{code:"STORAGE_READ_FAILED", key}` throw
  - `writeStore<T>(key,value)`:
    - `JSON.stringify` 실패 → `StorageError{code:"STRINGIFY_ERROR"}` throw
    - quota 초과 → `StorageError{code:"QUOTA_EXCEEDED"}` throw
    - 그 외 예외 → `StorageError{code:"STORAGE_WRITE_FAILED"}` throw
  - `writeManyTransactionally(updates)`:
    - stringify 선행(실패 시 setItem 0회)
    - commit 중 실패 시 rollback 후 **원래 commit 에러를 throw**
  - 스토리지 키 상수 export:
    - `ps:v1:childProfiles`, `ps:v1:rules`, `ps:v1:sessions`, `ps:v1:contentChecks`, `ps:v1:entitlement`, `ps:v1:uiFlags`
- Covers: [AC-S2-5, AC-S2-7, AC-S2-8, AC-S10-6, AC-S10-7, F1-AC4, F7-AC1]
- Files:
  - `src/lib/storage/keys.ts`
  - `src/lib/storage/core.ts`
- Depends on: [Task 1.1]

### Task 2.2 엔티티 repo(CRUD) + 캐스케이드 삭제 + 내보내기 JSON 빌더
- Description: 각 엔티티별 load/save 함수와, 프로필 삭제 캐스케이드(트랜잭션 1회) 및 export JSON 생성 함수를 만든다.
- DoD:
  - 아래 함수들이 존재하며, 성공 시 localStorage 반영:
    - `loadChildProfiles()/saveChildProfiles()`
    - `loadRules()/saveRules()`
    - `loadSessions()/saveSessions()`
    - `loadContentChecks()/saveContentChecks()`
    - `loadEntitlement()/saveEntitlement()` (기본값 포함)
    - `loadUiFlags()/saveUiFlags()` (기본값 포함)
  - `deleteChildCascade(childId)`:
    - childProfiles/rules/sessions/contentChecks에서 `childId` 매칭 항목 제거
    - `writeManyTransactionally` **1회** 호출
    - 업데이트 순서가 **고정**: childProfiles → rules → sessions → contentChecks
  - `buildExportJson()`:
    - JSON 문자열 1개에 `childProfiles,rules,sessions,contentChecks,entitlement,uiFlags` 키가 모두 포함
    - 반환 문자열 `length > 0`
- Covers: [AC-S2-5, AC-S2-7, AC-S2-8, AC-S10-3, F1-AC2, F7-AC3]
- Files: [`src/lib/storage/repo.ts`]
- Depends on: [Task 2.1]

### Task 2.3 클라이언트 페이지네이션/정렬 함수 구현 (SessionLog/ContentCheck)
- Description: SPEC의 `getSessionLogsPage`, `getContentChecksPage`를 in-memory slice로 구현한다.
- DoD:
  - `getSessionLogsPage(params)`:
    - 정렬: `startAtISO` 내림차순
    - 필터: `childId`, `weekStartISO~weekEndISO`(inclusive) 적용
    - 반환: `{ items, total, page }`
    - 공통 pass/fail: `pageSize=20,page=1,total=0`이면 `items.length===0`
  - `getContentChecksPage(params)`:
    - 정렬: `createdAt` 내림차순
    - 필터: `childId`, `status` 적용
    - 공통 pass/fail 동일
- Covers: [S1 최근 세션 계약, S8 세션 리스트 계약, F1-AC5]
- Files: [`src/lib/pagination.ts`]
- Depends on: [Task 1.1, Task 2.2]

### Task 2.4 프리미엄 판정/만료 정리 헬퍼 (effectivePremium + normalize)
- Description: SPEC의 effectivePremium 규칙 및 만료 시 isPremium 자동 비활성화를 공통 함수로 구현한다.
- DoD:
  - `getEffectivePremium(entitlement, nowISO)`:
    - `entitlement.isPremium===true && entitlement.expiresAtISO!==null && nowISO < entitlement.expiresAtISO`일 때만 `true`
  - `normalizeEntitlementIfExpired(nowISO)`:
    - `effectivePremium===false && entitlement.isPremium===true`면 `isPremium=false`로 저장
- Covers: [AC-S7-3, AC-S7-4, F6-AC4]
- Files: [`src/lib/premium.ts`]
- Depends on: [Task 2.2]

### Task 2.5 전역 상태(AppDataProvider) 구성 (write 성공 후 setState)
- Description: 앱 전역에서 프로필/규칙/세션/점검/entitlement/uiFlags를 제공하고, **쓰기 성공 후에만 상태를 반영**하도록 만든다.
- DoD:
  - `AppDataProvider`가 마운트 시 repo load로 초기 상태를 구성한다.
  - write 액션은 **(1) storage write 성공 → (2) setState** 순서로만 상태가 바뀐다.
  - `/` 최초 렌더 기준 1회, `normalizeEntitlementIfExpired(new Date().toISOString())`가 실행된다. (만료 정리 규칙)
  - read 실패(`StorageError`)는 그대로 throw하지 않고, Provider 내부에서 fallback 상태로 유지 가능해야 하며 **console.error를 호출하지 않는다**.
- Covers: [F1-AC1, F1-AC4(메모리만 반영 금지 전제), F6-AC2]
- Files:
  - `src/lib/state/AppDataContext.tsx`
  - `src/lib/state/useAppData.ts`
- Depends on: [Task 2.2, Task 2.4]

### Task 2.6 AI API 클라이언트 구현 (`POST /api/content-check`)
- Description: 외부 API 호출을 단일 함수로 캡슐화(헤더/에러 분기 가능)한다.
- DoD:
  - `createContentCheckRemote(req)`:
    - POST `${VITE_AI_API_BASE_URL}/api/content-check`
    - body: JSON, `Content-Type: application/json`
    - `VITE_AI_API_KEY`가 존재하면 `x-api-key` 헤더 포함
  - 반환 형태가 호출자가 아래를 구분 가능해야 한다(구현 택1: union return 또는 throw + 에러 객체):
    - `httpStatus === 200` 성공
    - `httpStatus === 429` 과다요청
    - `httpStatus === 401` 인증실패
    - `httpStatus === 404` CHILD_NOT_FOUND
    - `httpStatus >= 500` 서버오류
    - 네트워크 오류(HTTP 응답 없음)
- Covers: [AC-S6-4, AC-S6-5, AC-S6-6, AC-S6-7, F4-AC6, F4-AC7]
- Files: [`src/lib/api/ai.ts`]
- Depends on: [Task 1.1]

**Risk Analysis (Epic 2)**
- Complexity: Medium
- Risk factors:
  - localStorage 부분 커밋으로 데이터 손상(캐스케이드 삭제/초기화)
  - QUOTA_EXCEEDED에서 “메모리만 반영”되는 상태 불일치
  - API 오류 분기 누락(429/401/404/5xx/네트워크)
- Mitigation:
  - (2.1) 트랜잭션/에러코드 선구현 → (2.2) 캐스케이드/초기화가 항상 transactional
  - (2.5) “write 성공 후 setState”로 F1-AC4 롤백 요구를 구조적으로 방지
  - (2.6) API 호출을 단일 모듈로 모아 화면 분기 누락 위험 감소


---

## Epic 3. Core UI pages (src/pages/) — ONE page per task

### Task 3.0 공통 UI 컴포넌트(Scaffold/SubmitFooter/EmptyState/키보드 스크롤)
- Description: 모든 화면에서 공통으로 쓰는 모바일 레이아웃 및 키보드 대응 패턴을 구현한다.
- DoD:
  - `ScreenScaffold`: `Top` + 콘텐츠 영역 + optional footer slot 제공
  - `SubmitFooter`: 폭 100% 1차 버튼(하단 고정 패턴)
  - `useScrollIntoViewOnFocus()`: focus 시 `scrollIntoView({ block:"center" })`를 호출할 핸들러 제공
  - `EmptyState`: `Asset.ContentIcon` + 문구 텍스트 렌더
- Covers: [AC-S2-4, F2-AC4]
- Files:
  - `src/components/ScreenScaffold.tsx`
  - `src/components/SubmitFooter.tsx`
  - `src/components/EmptyState.tsx`
  - `src/lib/ui/useScrollIntoViewOnFocus.ts`
- Depends on: [none]

### Task 3.1 S1 홈 대시보드 페이지 (`/`)
- Description: 홈 UI/빠른 액션/자녀 선택 BottomSheet/최근 세션 3개/배너 광고/프리미엄 활성 표시.
- DoD:
  - 자녀 0명: `"자녀 프로필을 추가해주세요"` 빈 상태 렌더 (AC-S1-1)
  - “자녀 추가” 탭: `navigate('/profile')` (AC-S1-2)
  - 자녀 1명 + “세션 시작” 탭: `navigate('/timer', { state:{ childId } })` (AC-S1-3)
  - 자녀 2명+ “콘텐츠 점검” 탭: BottomSheet 먼저 표시, 자녀 선택 탭 시 `navigate('/content-check', { state:{ childId:selectedId }})` (AC-S1-4)
  - 로드 오류(`StorageError.code in {"PARSE_ERROR","STORAGE_READ_FAILED"}`) 감지 시 토스트 `"데이터를 불러오지 못했어요"` **1회** + 크래시 없이 렌더 유지 (AC-S1-5)
  - 자녀 0명 상태에서 “세션 시작/콘텐츠 점검” 탭: 라우트 변경 없음 + 토스트 `"먼저 자녀 프로필을 추가해주세요"` (AC-S1-6)
  - 최근 세션은 `getSessionLogsPage({ page:1, pageSize:3 })`로만 읽어 최대 3개 표시
  - `AdSlot` 1개가 섹션과 섹션 사이에 렌더 (S1 광고 규칙)
  - `effectivePremium===true`면 `"프리미엄 활성"` 텍스트 렌더 (F6-AC2)
- Covers: [AC-S1-1, AC-S1-2, AC-S1-3, AC-S1-4, AC-S1-5, AC-S1-6, F6-AC2]
- Files: [`src/pages/HomePage.tsx`]
- Depends on: [Task 2.3, Task 2.5, Task 2.4, Task 3.0]

### Task 3.2 S2 자녀 프로필 생성/수정 페이지 (`/profile`)
- Description: 생성/수정 프리필/삭제(캐스케이드+트랜잭션)/입력 검증/키보드 스크롤/저장 토스트.
- DoD:
  - `location.state`는 `RouteState["/profile"]`로 캐스팅해서 사용
  - 생성 저장 성공: localStorage에 프로필 1개 추가 + `navigate('/', { replace:true })` (AC-S2-1) + 토스트 `"저장했어요"` (F2-AC1)
  - 수정 진입(`state.childId`): 200ms 이내 name/grade 프리필 (AC-S2-2, F2-AC5)
  - `name.trim().length===0` 제출: 에러 `"이름을 입력해주세요"` + 저장 0회 (AC-S2-3, F2-AC2)
  - `name.length>20` 제출: 에러 `"이름은 20자 이내로 입력해주세요"` + 저장 0회 (AC-S2-4, F2-AC3)
  - 이름 TextField focus 시 `scrollIntoView({block:"center"})` 경로 존재 (AC-S2-키보드, F2-AC4)
  - 수정 모드: “프로필 삭제” 노출, AlertDialog에서 “삭제” 확정 시 `deleteChildCascade(childId)`로 삭제 + `/` replace (AC-S2-5)
  - 존재하지 않는 childId로 진입: AlertDialog 제목 `"프로필을 찾을 수 없어요"` + 확인 탭 시 `/` replace (AC-S2-6, F2-AC6)
  - 저장/삭제 쓰기 실패 시:
    - 저장: 토스트 `"저장에 실패했어요"`
    - 삭제: 토스트 `"삭제에 실패했어요"`
    - (트랜잭션 롤백은 data-layer 구현으로 충족) (AC-S2-7, AC-S2-8)
- Covers: [AC-S2-1, AC-S2-2, AC-S2-3, AC-S2-4, AC-S2-5, AC-S2-6, AC-S2-7, AC-S2-8, F2-AC1, F2-AC2, F2-AC3, F2-AC4, F2-AC5, F2-AC6]
- Files: [`src/pages/ProfilePage.tsx`]
- Depends on: [Task 1.1, Task 2.2, Task 2.5, Task 3.0]

### Task 3.3 S3 규칙 목록 페이지 (`/rules`) + 101개 이상 가상 스크롤
- Description: 규칙 리스트/토글 저장/로딩 스켈레톤/빈 상태/파싱 오류 안전 초기화/가상 스크롤.
- DoD:
  - 최초 진입 시 200ms 동안 스켈레톤 placeholder 2개 렌더 (S3 Loading)
  - 규칙 0개: `"규칙을 추가해보세요"` 빈 상태 렌더 (AC-S3-1, F3-AC6)
  - “규칙 추가”: `navigate('/rules/new')` (AC-S3-2)
  - 규칙 행 탭: `navigate('/rules/new', { state:{ ruleId } })` (AC-S3-3)
  - Switch 토글: `enabled` 반전 저장, reload 후 유지 (AC-S3-4)
  - Switch 저장 실패: 토스트 `"저장에 실패했어요"` + UI 즉시 원복 (AC-S3-5)
  - 로드 오류(`PARSE_ERROR`/`STORAGE_READ_FAILED`): 토스트 `"규칙을 불러오지 못했어요"` + 목록 `[]` 렌더 (AC-S3-6)
  - **F1-AC3 케이스**: rules 값이 `"NOT_JSON"`이면
    - 토스트 `"규칙 데이터를 불러오지 못해 초기화했어요"` **1회**
    - rules를 `[]`로 `writeStore` 저장 시도 후 `[]` 렌더 (F1-AC3)
  - 규칙 수가 101개 이상: `react-window` 기반 가상 스크롤 사용, DOM 상 규칙 행 수 `<= 40` (AC-S3-7)
- Covers: [AC-S3-1, AC-S3-2, AC-S3-3, AC-S3-4, AC-S3-5, AC-S3-6, AC-S3-7, F1-AC3, F3-AC6]
- Files:
  - `src/pages/RulesPage.tsx`
  - `package.json` (react-window 의존성 추가 시)
- Depends on: [Task 2.1, Task 2.2, Task 2.5, Task 3.0]

### Task 3.4 S4 규칙 생성/수정 페이지 (`/rules/new`)
- Description: 규칙 생성/수정 프리필/중복 방지/검증/저장 실패 처리.
- DoD:
  - `location.state`는 `RouteState["/rules/new"]`로 캐스팅해서 사용
  - 생성 저장 성공: `TimeRule` 1개 생성 저장 + `/rules` replace (AC-S4-1, F3-AC1)
  - 수정 진입(`state.ruleId`): 200ms 이내 `category/dailyLimitMin/enabled` 프리필 (AC-S4-2)
  - `dailyLimitMin < 0` 또는 `> 600`: 에러 `"0~600분 사이로 입력해주세요"` + 저장 0회 (AC-S4-3, F3-AC2)
  - 생성 모드 중복(`childId+category`): AlertDialog 본문에 `"이미 같은 카테고리 규칙이 있어요. 수정 화면에서 변경해주세요"` 포함 + 개수 증가 0 (AC-S4-4, F3-AC3)
  - 존재하지 않는 ruleId: AlertDialog 제목 `"규칙을 찾을 수 없어요"` + 확인 탭 시 `/rules` replace (AC-S4-5)
  - 저장 write 실패: 토스트 `"저장에 실패했어요"` + `/rules`로 이동하지 않음(라우트 유지) (AC-S4-6)
- Covers: [AC-S4-1, AC-S4-2, AC-S4-3, AC-S4-4, AC-S4-5, AC-S4-6, F3-AC1, F3-AC2, F3-AC3]
- Files: [`src/pages/RuleEditorPage.tsx`]
- Depends on: [Task 1.1, Task 2.2, Task 2.5, Task 3.0]

### Task 3.5 S5 세션 타이머 페이지 (`/timer`)
- Description: 세션 시작/종료 기록, 중복 시작 방지, duration 계산, 목표 초과 경고.
- DoD:
  - `location.state`는 `RouteState["/timer"]`로 캐스팅해서 사용
  - childId 없거나 비어있음: AlertDialog 제목 `"자녀를 선택해주세요"` + 확인 탭 시 `/` replace (AC-S5-6)
  - 활성 세션 없을 때 시작:
    - 카테고리 선택 후 “세션 시작” 탭 → `SessionLog` 생성, `startAtISO=now`, `endAtISO=null` 저장 (AC-S5-1)
  - 활성 세션 존재 시:
    - 진행 시간 Card 렌더
    - “세션 시작” CTA 미노출 (AC-S5-3)
  - 중복 시작(동일 childId active 존재): 토스트 `"이미 진행 중인 세션이 있어요"` + 새 세션 생성 0 (AC-S5-4, F3-AC7)
  - 활성 세션 없는데 종료 탭: 토스트 `"진행 중인 세션이 없어요"` + 저장 0 (AC-S5-5)
  - 종료 시:
    - `endAtISO=now`, `durationMin = Math.max(0, Math.floor((end-start)/60000))` 저장
    - 저장 성공 후 `/` replace (AC-S5-2, F3-AC4)
  - 규칙 초과 경고:
    - 오늘 동일 `childId+category` 누적(종료된 세션) + 이번 세션 합이 `dailyLimitMin` 초과 && rule.enabled=true면
    - AlertDialog 제목 `"오늘 목표 시간을 초과했어요"` + 본문에 `"게임 1분 제한 / 현재 2분"` 포함 (F3-AC5)
  - QUOTA_EXCEEDED 저장 실패 시 토스트 `"저장 공간이 부족해 저장할 수 없어요"` (F1-AC4)
- Covers: [AC-S5-1, AC-S5-2, AC-S5-3, AC-S5-4, AC-S5-5, AC-S5-6, F3-AC4, F3-AC5, F3-AC7, F1-AC4]
- Files: [`src/pages/TimerPage.tsx`]
- Depends on: [Task 1.1, Task 2.2, Task 2.5, Task 3.0]

### Task 3.6 S6 콘텐츠 점검 입력 페이지 (`/content-check`) (UI/검증/pending 저장/AI 고지 1회)
- Description: childId 가드, AI 고지(1회), 텍스트 검증, pending 저장 및 분석 요청 트리거까지 구현한다. (API 호출 로직은 별도 helper로 분리)
- DoD:
  - `location.state`는 `RouteState["/content-check"]`로 캐스팅해서 사용
  - childId 없으면 AlertDialog 제목 `"자녀를 선택해주세요"` + 확인 탭 시 `/` replace (AC-S6-1)
  - `uiFlags.aiNoticeAccepted`가 false/없음이면 AlertDialog에 `"이 서비스는 생성형 AI를 활용합니다"` 포함
    - 확인 탭 시 `aiNoticeAccepted=true` 저장 (F4-AC1)
  - `inputText.trim().length===0` 제출: 에러 `"점검할 텍스트를 입력해주세요"` + API 호출 경로 0회 (AC-S6-2, F4-AC2)
  - `inputText.length>500` 제출: 에러 `"500자 이내로 입력해주세요"` + API 호출 경로 0회 (AC-S6-3)
  - 유효 제출 시:
    - `ContentCheck`를 `status:"pending"`으로 **먼저** 저장 (AC-S6-4)
    - 버튼 loading + `"분석 중…"` 텍스트 표시 (F4-AC3)
    - 이후 `submitContentCheck(checkId)` (별도 파일) 호출 결과를 받아 처리하도록 연결(컴파일 가능)
- Covers: [AC-S6-1, AC-S6-2, AC-S6-3, AC-S6-4, F4-AC1, F4-AC2, F4-AC3]
- Files:
  - `src/pages/ContentCheckPage.tsx`
  - `src/lib/features/contentCheck/submitContentCheck.ts` (초기 스텁: 타입/함수 시그니처만 제공, 항상 “미구현 에러” union 반환)
- Depends on: [Task 1.1, Task 2.2, Task 2.5, Task 3.0]

### Task 3.7 콘텐츠 점검 submit 로직 구현(외부 API 호출/업데이트/에러 매핑)
- Description: `submitContentCheck.ts`에 실제 API 호출 및 `ContentCheck.status done/error` 업데이트를 구현한다. (페이지 파일 수정 없이 완료)
- DoD:
  - `submitContentCheck(params)`가 다음을 수행:
    - 외부 API `POST /api/content-check`를 정확히 1회 호출 (AC-S6-4)
    - 200 응답:
      - 해당 체크를 `status:"done"`으로 업데이트
      - `riskLevel/reasons/suggestedAction/model` 저장
      - 호출자에게 `{ ok:true, checkId }` 반환 (AC-S6-5)
    - 429:
      - 해당 체크 `status:"error"` 저장
      - `{ ok:false, kind:"RATE_LIMITED", toast:"요청이 많아요. 1분 후 다시 시도해주세요" }` 반환 (AC-S6-6, F4-AC7)
    - 네트워크 오류:
      - `status:"error"` 저장
      - `{ ok:false, kind:"NETWORK", toast:"네트워크 오류가 발생했어요" }` 반환 (AC-S6-7, F4-AC6)
    - 5xx:
      - `status:"error"` 저장
      - `{ ok:false, kind:"SERVER", toast:"분석 서버에 문제가 있어요" }` 반환 (AC-S6-7)
    - 401:
      - `status:"error"` 저장
      - `{ ok:false, kind:"UNAUTHORIZED", toast:"인증에 실패했어요" }` 반환 (External API Spec 요구)
    - 404:
      - `status:"error"` 저장
      - `{ ok:false, kind:"CHILD_NOT_FOUND", dialogTitle:"자녀 정보를 찾을 수 없어요" }` 반환 (External API Spec 요구)
- Covers: [AC-S6-5, AC-S6-6, AC-S6-7, F4-AC6, F4-AC7]
- Files: [`src/lib/features/contentCheck/submitContentCheck.ts`]
- Depends on: [Task 2.6, Task 2.2, Task 3.6]

### Task 3.8 S7 콘텐츠 점검 결과 페이지 (`/content-check/result`) + 보상형 광고 게이트
- Description: 결과 로딩/빈 상태/에러/AI 라벨/testid/프리미엄이면 게이트 제거/무료면 TossRewardAd 적용 + 만료 정리 실행.
- DoD:
  - `location.state`는 `RouteState["/content-check/result"]`로 캐스팅해서 사용
  - checkId 없으면 `"결과를 찾을 수 없어요"` 빈 상태 렌더 + “다시 점검” 탭 시 `/`로 replace (AC-S7-1)
  - 로딩 중(최초 200ms) 스켈레톤 Card 1개 이상 렌더 (AC-S7-2)
  - checkId로 ContentCheck가 없으면 `"결과를 찾을 수 없어요"` 렌더 + 콘솔 에러 없이 동작 (AC-S7-6)
  - `ContentCheck.status==="error"`면 토스트 `"결과를 불러오지 못했어요"` + `ai-result-card` 렌더 금지 (AC-S7-7)
  - `status==="done"` 결과 표시 시:
    - `data-testid="ai-result-card"`를 가진 Card 1개 이상 렌더 (AC-S7-3/4 전제)
    - `data-testid="ai-generated-label"` 요소가 존재하고 텍스트 `"AI가 생성한 결과입니다"` 포함 (AC-S7-5)
  - `normalizeEntitlementIfExpired(nowISO)`를 결과 진입 시 1회 실행 (F6-AC4)
  - `effectivePremium === false` & done:
    - 결과 영역을 `<TossRewardAd>`로 감싸고, 광고 완료 후 `ai-result-card`가 보인다 (AC-S7-3, F4-AC4)
  - `effectivePremium === true` & done:
    - `<TossRewardAd>` 없이 즉시 `ai-result-card` 표시 (AC-S7-4, F4-AC5)
  - “다시 점검” 탭:
    - 체크에서 `childId` 역참조하여 `navigate('/content-check', { replace:true, state:{ childId }})` (S7 outgoing 계약)
- Covers: [AC-S7-1, AC-S7-2, AC-S7-3, AC-S7-4, AC-S7-5, AC-S7-6, AC-S7-7, F4-AC4, F4-AC5, F6-AC4]
- Files: [`src/pages/ContentCheckResultPage.tsx`]
- Depends on: [Task 1.1, Task 2.2, Task 2.4, Task 2.5, Task 3.0]

### Task 3.9 S8 주간 리포트 페이지 (`/report`) (탭 로딩/배너/손상 제외/가상 스크롤)
- Description: 이번주/지난주 탭, 주간 합계/카테고리 합계, 빈 상태, 손상 데이터 제외 토스트, AdSlot 위치, 세부 기록 가상 스크롤(300개).
- DoD:
  - 해당 주 `SessionLog` 0개면 `"아직 기록이 없어요"` 빈 상태 렌더 (AC-S8-1, F5-AC2, F1-AC5)
  - 세션 존재 시 `data-testid="weekly-report-hero"` 렌더 + `"총 "` 및 `"분"` 포함 (AC-S8-2)
  - F5-AC1 데이터 조건에서 `"총 90분"`, `"게임 30분"`, `"교육 60분"`이 표시된다 (F5-AC1)
  - `"지난주"` 탭 탭 시:
    - 200ms 동안 스켈레톤 Card 1개 이상
    - 이후 지난주 값으로 히어로 갱신 (AC-S8-3, F5-AC3)
  - `durationMin < 0` 또는 `> 1440` 항목은 집계 제외 + 토스트 `"일부 기록이 손상되어 제외했어요"` **1회** (AC-S8-5, F5-AC4)
  - `AdSlot`이 히어로 카드 아래 DOM 순서로 렌더 (hero → AdSlot) (AC-S8-4, F5-AC5)
  - 집계 계산 중 예외 발생 시 토스트 `"리포트를 만들 수 없어요"` + 크래시 없이 유지 (AC-S8-6)
  - “세부 기록 보기” 섹션(예: Button/Collapse 형태) 확장 시:
    - 세션 300개에서도 가상 스크롤로 DOM 행 `<= 40`
    - 스크롤로 나머지 항목을 볼 수 있음 (F5-AC6)
- Covers: [AC-S8-1, AC-S8-2, AC-S8-3, AC-S8-4, AC-S8-5, AC-S8-6, F5-AC1, F5-AC2, F5-AC3, F5-AC4, F5-AC5, F5-AC6, F1-AC5]
- Files: [`src/pages/ReportPage.tsx`]
- Depends on: [Task 2.3, Task 2.5, Task 3.0]

### Task 3.10 S9 프리미엄 결제 페이지 (`/premium`) (30일 저장/중복 구매 방지)
- Description: TossPurchase 성공/실패 처리, 30일 만료일 저장, 이미 프리미엄이면 disable + 토스트, 결제 진행 중 텍스트.
- DoD:
  - 진입 시 “프리미엄 혜택” Card 1개 이상 렌더 (AC-S9-1, F6-AC6)
  - 가격 텍스트 `"월 9,900원"` 표시 (F6-AC6)
  - `onPurchased`:
    - `entitlement.isPremium=true`
    - `lastPurchaseAtISO=nowISO`
    - `expiresAtISO = lastPurchaseAtISO + 30일` 저장
    - `/` replace 이동 (AC-S9-2, F6-AC1)
  - 고정 시간 테스트 조건: now=`2026-07-13T00:00:00.000Z`면 expires=`2026-08-12T00:00:00.000Z` (F6-AC1)
  - `onError`: 토스트 `"결제가 완료되지 않았어요"` + entitlement 불변 (AC-S9-3, F6-AC3)
  - 결제 진행 중: 연속 탭 불가(disabled) + `"결제 처리 중"` 텍스트 표시 (AC-S9-4, F6-AC5)
  - `effectivePremium===true`로 진입 시 토스트 `"이미 프리미엄이 활성화되어 있어요"` 1회 + 구매 버튼 disabled (AC-S9-5)
- Covers: [AC-S9-1, AC-S9-2, AC-S9-3, AC-S9-4, AC-S9-5, F6-AC1, F6-AC3, F6-AC5, F6-AC6]
- Files: [`src/pages/PremiumPage.tsx`]
- Depends on: [Task 2.2, Task 2.4, Task 2.5, Task 3.0]

### Task 3.11 S10 설정 페이지 (`/settings`) (내보내기/복사/초기화/프리미엄 이동)
- Description: export JSON BottomSheet + clipboard copy, transactional reset, premium 이동.
- DoD:
  - “프리미엄” ListRow 탭: `navigate('/premium')` (AC-S10-1)
  - 내보낼 데이터 없음(프로필/규칙/세션/점검 모두 0개):
    - 토스트 `"내보낼 데이터가 없어요"`
    - BottomSheet 열리지 않음 (AC-S10-2, F7-AC3)
  - 데이터 1개 이상:
    - BottomSheet 열림
    - JSON 문자열 표시, length > 0 (AC-S10-3)
  - “복사”:
    - `navigator.clipboard.writeText(json)` 1회 호출
    - 성공 시 토스트 `"복사했어요"` (AC-S10-4)
  - 복사 실패:
    - 토스트 `"복사할 수 없어요"`
    - JSON은 화면에 그대로 남음 (AC-S10-5)
  - “데이터 초기화”:
    - AlertDialog에서 “초기화” 확정 시 `writeManyTransactionally`로 6개 키를 초기화하고 토스트 `"초기화했어요"` (AC-S10-6, F7-AC1)
    - “취소” 탭 시 localStorage 불변 (F7-AC2)
  - 초기화 쓰기 실패:
    - 토스트 `"초기화에 실패했어요"`
    - rollback으로 부분 초기화 없음 (AC-S10-7)
- Covers: [AC-S10-1, AC-S10-2, AC-S10-3, AC-S10-4, AC-S10-5, AC-S10-6, AC-S10-7, F7-AC1, F7-AC2, F7-AC3]
- Files: [`src/pages/SettingsPage.tsx`]
- Depends on: [Task 2.2, Task 2.5, Task 3.0]

**Risk Analysis (Epic 3)**
- Complexity: High
- Risk factors:
  - 페이지별 state 캐스팅 누락 시 런타임 오류
  - 토스트/Alert 분기 누락으로 AC 미충족
  - 가상 스크롤 DOM 행 수(<=40) 미달
- Mitigation:
  - RouteState 캐스팅을 각 페이지 DoD에 포함
  - 가상 스크롤 요구는 `/rules`, `/report`에서 각각 명시적 pass/fail(“DOM 행 <=40”)로 고정


---

## Epic 4. Integration + polish (routing wiring, guardrails, final UX)

### Task 4.1 외부 링크 이탈 차단 가드 모듈 구현 (App 수정 없음)
- Description: `window.open`, `location.assign/replace`를 가로채고, 차단 이벤트를 앱에 전달할 수 있는 모듈을 만든다.
- DoD:
  - `installExternalLinkGuard({ onBlocked })` 구현:
    - `window.open("https://...")` 호출 시 실제 open 실행되지 않음 + `onBlocked(url)` 호출 (F7-AC4)
    - `window.location.assign/replace("https://...")` 호출 시 실제 이동 실행되지 않음 + `onBlocked(url)` 호출 (F7-AC4)
    - `uninstall()` 호출 시 원래 함수로 복구 가능
- Covers: [F7-AC4]
- Files: [`src/lib/guardrails/externalLinkGuard.ts`]
- Depends on: [none]

### Task 4.2 라우팅 연결 + FloatingTabBar 적용 + 외부 링크 차단 AlertDialog 노출
- Description: 모든 페이지를 React Router에 연결하고, 하단 탭을 FloatingTabBar로 구성하며, Task 4.1의 차단 이벤트를 AlertDialog로 노출한다.
- DoD:
  - 라우트가 최소 아래를 포함:
    - `/`, `/profile`, `/rules`, `/rules/new`, `/timer`, `/content-check`, `/content-check/result`, `/report`, `/premium`, `/settings`
  - 하단 탭은 `FloatingTabBar`로만 구현되고 탭 경로가 정확히 매칭된다:
    - 홈(`/`), 규칙(`/rules`), 리포트(`/report`), 설정(`/settings`)
  - `installExternalLinkGuard`를 앱 최초 1회 설치하고,
    - 차단 발생 시 `AlertDialog` 본문에 `"외부 링크 이동이 제한되어 있어요"`가 포함되어 표시된다 (F7-AC4)
  - 모든 페이지가 빌드/런타임에서 정상 렌더(화이트스크린 없음)
- Covers: [라우팅/네비 원칙(탭 4개), F7-AC4, AC-S1-2, AC-S3-2, AC-S10-1]
- Files: [`src/App.tsx`]
- Depends on: [Task 4.1, Task 3.1, Task 3.2, Task 3.3, Task 3.4, Task 3.5, Task 3.6, Task 3.7, Task 3.8, Task 3.9, Task 3.10, Task 3.11]

### Task 4.3 정책/검수 가드레일: console.error/외부 로깅 문자열/HEX 색상 금지 체크 스크립트
- Description: F7의 정적 정책 AC를 “실행 가능한 스크립트”로 제공해 pass/fail이 명확해지게 한다.
- DoD:
  - `scripts/policyCheck.mjs` 추가 후, 아래를 검사하고 위반 시 `process.exit(1)`:
    - 소스에서 `console.error(` 문자열 존재 시 실패 (F7-AC5, F1-AC1의 console.error 0 보조)
    - 소스/빌드 산출물(존재 시 dist)에서 `"google-analytics"`, `"amplitude"` 문자열 발견 시 실패 (F7-AC6)
    - 소스에서 정규식 `/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/` 매칭 발견 시 실패 (F7-AC7)
  - `package.json`에 `"policy:check": "node scripts/policyCheck.mjs"` 스크립트가 추가된다.
- Covers: [F7-AC5, F7-AC6, F7-AC7, F1-AC1]
- Files:
  - `scripts/policyCheck.mjs`
  - `package.json`
- Depends on: [Task 4.2]

**Risk Analysis (Epic 4)**
- Complexity: Medium
- Risk factors:
  - 라우팅 누락으로 특정 페이지 접근 불가
  - 외부 링크 가드가 전역 UI와 충돌(다이얼로그 중복)
  - 정적 정책 위반으로 검수 반려
- Mitigation:
  - 라우팅/탭/가드 설치를 한 번에(App.tsx) 연결해 누락 위험 감소
  - 정적 정책은 스크립트로 pass/fail 자동화


---

## AC Coverage
- Total ACs in SPEC: **109**
- Covered by tasks: **109**
  - F1: AC1(2.5,4.3), AC2(2.2), AC3(3.3), AC4(2.1,2.5,3.5), AC5(3.9)
  - F2: AC1~AC6(3.2)
  - F3: AC1~AC3(3.4), AC4~AC5(3.5), AC6(3.3), AC7(3.5)
  - F4: AC1(3.6), AC2~AC3(3.6), AC4~AC5(3.8), AC6~AC7(3.7)
  - F5: AC1~AC6(3.9)
  - F6: AC1(3.10), AC2(2.5,3.1), AC3(3.10), AC4(2.4,3.8), AC5(3.10), AC6(3.10)
  - F7: AC1~AC3(3.11), AC4(4.1,4.2), AC5~AC7(4.3)
  - Screen ACs:
    - S1 AC1~AC6(3.1)
    - S2 AC1~AC8(3.2)
    - S3 AC1~AC7(3.3)
    - S4 AC1~AC6(3.4)
    - S5 AC1~AC6(3.5)
    - S6 AC1~AC4(3.6), AC5~AC7(3.7)
    - S7 AC1~AC7(3.8)
    - S8 AC1~AC6(3.9)
    - S9 AC1~AC5(3.10)
    - S10 AC1~AC7(3.11)
- Uncovered: **0**