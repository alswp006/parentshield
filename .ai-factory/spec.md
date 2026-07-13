# SPEC

## Common Principles

### MVP 범위/제약 (앱인토스 환경)
- 이 MVP는 **디바이스 수준의 앱 차단/사용시간 강제 제어/푸시 알림**을 제공하지 않는다. (앱인토스 웹 환경에서 OS 권한·백그라운드 감시·푸시가 불가)
- 대신 부모가 **규칙(앱 카테고리별 목표 시간)**을 설정하고, 자녀와 함께 **세션(사용 시간) 기록** 및 **주간 리포트**를 확인하는 “합의 기반 관리” 도구로 제공한다.
- AI 기능(유해 콘텐츠 탐지)은 **외부 API(별도 서버)** 호출로 텍스트 분석을 수행하며, AI 고지/라벨 표시를 필수로 한다.

### UI/UX 원칙 (TDS + 모바일 최적화)
- 모든 UI는 **@toss/tds-mobile 컴포넌트만** 사용한다. 여백은 **`Spacing`**만 사용하며 Tailwind/인라인으로 padding/margin을 덮어쓰지 않는다.
- 모든 인터랙션 요소는 **터치 타겟 44px 이상**(TDS `Button`, `ListRow` 기본 크기 준수)이어야 한다.
- 폼 화면은 모바일 키보드에 대응한다:
  - 숫자 입력은 `TextField inputMode="numeric"` 사용
  - 포커스 시 입력 필드가 가려지지 않도록 **스크롤 컨테이너에서 `scrollIntoView({ block: "center" })`** 처리
  - 하단 1차 액션은 **고정 푸터(SubmitFooter 패턴)** 또는 화면 폭 100% `Button`으로 제공

### 라우팅/네비게이션 원칙
- React Router (`react-router-dom`) 사용.
- 하단 탭은 템플릿 제공 **`FloatingTabBar`** 사용: 홈(`/`), 규칙(`/rules`), 리포트(`/report`), 설정(`/settings`)

### 광고/과금 원칙 (템플릿 컴포넌트 고정 사용)
- 배너 광고: `<AdSlot adGroupId={import.meta.env.VITE_TOSS_AD_GROUP_ID} />`
  - 콘텐츠를 덮지 않고 **섹션과 섹션 사이**에만 배치
- 보상형 광고 게이트(결과/분석/추천 화면): `<TossRewardAd slotId={import.meta.env.VITE_TOSS_AD_SLOT_ID}>{children}</TossRewardAd>`
- 결제(IAP): `<TossPurchase sku={import.meta.env.VITE_TOSS_IAP_SKU} ... />`
  - PRD의 “구독”은 MVP에서는 **30일 이용권(1회성 결제)**로 구현 (서버 없이 월 구독 상태 검증 불가)

### 프리미엄 판정(엔타이틀먼트) 공통 규칙
- 프리미엄 유효 판정은 아래의 “유효 프리미엄(effective premium)”으로 통일한다.
  - `effectivePremium = entitlement.isPremium === true && entitlement.expiresAtISO !== null && nowISO < entitlement.expiresAtISO`
- **만료 정리(normalize) 규칙**
  - 앱 진입 시(최소 `/` 최초 렌더 1회) 및 `/content-check/result` 진입 시 1회:
    - `effectivePremium === false` 이고 `entitlement.isPremium === true`인 경우, localStorage의 `entitlement.isPremium`을 `false`로 업데이트한다.
- 화면별 사용
  - S1: `effectivePremium`이면 홈에 “프리미엄 활성” 표시
  - S7: `effectivePremium`이면 보상형 광고 게이트 없이 결과 즉시 노출
  - S9: 구매 성공 시 `expiresAtISO = purchasedAtISO + 30일`로 저장

---

## Data Model (Core Entities)

> 아래 4개 코어 엔티티는 화면/캐스케이드 삭제/리포트/AI 결과 저장 등 전반에서 참조되므로 **필드/타입/타임스탬프/스토리지 키**를 명시한다.  
> 모든 타임스탬프는 `new Date().toISOString()` 형식의 **ISO 문자열**이다.

### 1) ChildProfile
```ts
export interface ChildProfile {
  id: string;
  name: string; // 1..20 chars
  grade: "초4" | "초5" | "초6" | "중1" | "중2" | "중3";
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
```
- localStorage
  - Key: `ps:v1:childProfiles`
  - Shape: `ChildProfile[]`

### 2) TimeRule
```ts
export type AppCategory = "게임" | "SNS" | "동영상" | "교육" | "기타";

export interface TimeRule {
  id: string;
  childId: string; // FK -> ChildProfile.id
  category: AppCategory;
  dailyLimitMin: number; // 0..600
  enabled: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
```
- localStorage
  - Key: `ps:v1:rules`
  - Shape: `TimeRule[]`

### 3) SessionLog
```ts
export interface SessionLog {
  id: string;
  childId: string; // FK -> ChildProfile.id
  category: AppCategory;

  startAtISO: string; // ISO
  endAtISO: string | null; // null while running
  durationMin: number; // computed when ended, 0..1440

  memo: string; // 0..50 chars

  createdAt: string; // ISO
  updatedAt: string; // ISO
}
```
- localStorage
  - Key: `ps:v1:sessions`
  - Shape: `SessionLog[]`

### 4) ContentCheck
```ts
export type RiskLevel = "낮음" | "보통" | "높음";

export interface ContentCheck {
  id: string;
  childId: string; // FK -> ChildProfile.id

  inputText: string; // 1..500 chars (trim 전 원문 저장 가능)
  status: "pending" | "done" | "error";

  riskLevel: RiskLevel | null;
  reasons: string[]; // 0..5 items, each 1..80 chars
  suggestedAction: string | null; // 0..200 chars
  errorMessage: string | null; // 표시용 에러 메시지
  model: string | null; // e.g. "gpt-4.1-mini"

  createdAt: string; // ISO
  updatedAt: string; // ISO
}
```
- localStorage
  - Key: `ps:v1:contentChecks`
  - Shape: `ContentCheck[]`

---

## Local Storage Access Wrapper (오류 탐지/테스트 가능 조건)

> AC-S1-5, AC-S2-7, AC-S3-6, AC-S10-7 등에서 언급되는 “로드/쓰기 실패”는 아래 래퍼의 **명시적 에러 코드**로만 판정한다.

### Error Types
```ts
export type StorageErrorCode =
  | "PARSE_ERROR"         // JSON.parse 실패
  | "QUOTA_EXCEEDED"      // setItem 시 용량 초과
  | "STRINGIFY_ERROR"     // JSON.stringify 실패(순환 참조 등)
  | "STORAGE_READ_FAILED" // 그 외 read 경로 예외
  | "STORAGE_WRITE_FAILED"; // 그 외 write 경로 예외

export class StorageError extends Error {
  code: StorageErrorCode;
  key: string;
  constructor(params: { code: StorageErrorCode; key: string; message?: string }) {
    super(params.message ?? params.code);
    this.code = params.code;
    this.key = params.key;
  }
}
```

### readStore / writeStore (단일 키)
```ts
export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new StorageError({ code: "PARSE_ERROR", key });
    }
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw new StorageError({ code: "STORAGE_READ_FAILED", key });
  }
}

function isQuotaExceededError(e: unknown): boolean {
  // DOMException name 기준 + Safari/legacy code 방어
  return (
    (e instanceof DOMException && e.name === "QuotaExceededError") ||
    // @ts-expect-error legacy
    (typeof e === "object" && e !== null && "code" in e && (e as any).code === 22)
  );
}

export function writeStore<T>(key: string, value: T): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new StorageError({ code: "STRINGIFY_ERROR", key });
  }
  try {
    localStorage.setItem(key, serialized);
  } catch (e) {
    if (isQuotaExceededError(e)) throw new StorageError({ code: "QUOTA_EXCEEDED", key });
    throw new StorageError({ code: "STORAGE_WRITE_FAILED", key });
  }
}
```

### writeManyTransactionally (멀티 키 원자성/롤백)

> localStorage는 트랜잭션이 없으므로, “부분 삭제/부분 초기화 없음”을 만족하기 위해 **사전 스냅샷 + 실패 시 복구(롤백)**를 정의한다.  
> AC에서 말하는 “롤백”은 “실패 시 reload 했을 때도 변경이 없어야 함”을 의미하며, 아래 알고리즘으로만 달성한다.

```ts
export function writeManyTransactionally(updates: Array<{ key: string; value: unknown }>): void {
  // 1) 이전 값 스냅샷(문자열 그대로)
  const prev = updates.map(({ key }) => ({ key, raw: localStorage.getItem(key) })); // raw may be null

  // 2) 모든 value를 먼저 stringify (여기서 실패하면 setItem을 0회 수행)
  const next = updates.map(({ key, value }) => {
    try {
      return { key, raw: JSON.stringify(value) };
    } catch {
      throw new StorageError({ code: "STRINGIFY_ERROR", key });
    }
  });

  // 3) 커밋(고정 순서대로 setItem). 중간 실패 시 rollback 수행
  try {
    for (const { key, raw } of next) {
      try {
        localStorage.setItem(key, raw);
      } catch (e) {
        if (isQuotaExceededError(e)) throw new StorageError({ code: "QUOTA_EXCEEDED", key });
        throw new StorageError({ code: "STORAGE_WRITE_FAILED", key });
      }
    }
  } catch (commitErr) {
    // 4) rollback: 이전 상태로 복구(고정 순서, 가능한 범위에서 복구)
    for (const { key, raw } of prev) {
      try {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
      } catch {
        // rollback 자체 실패는 추가 throw로 확장하지 않음(최초 commitErr 유지)
      }
    }
    throw commitErr;
  }
}
```

- **캐스케이드 삭제 / 전체 초기화 / 다중 키 업데이트**는 반드시 `writeManyTransactionally`를 사용한다.
- AC에서의 “localStorage 로드 실패”는 `readStore`가 `StorageError(code: "PARSE_ERROR" | "STORAGE_READ_FAILED")`를 throw한 경우로만 판정한다.
- AC에서의 “쓰기 실패(용량 부족)”는 `writeStore` 또는 `writeManyTransactionally`가 `StorageError(code: "QUOTA_EXCEEDED")`를 throw한 경우로만 판정한다.

---

## (추가) Client-only 리스트/페이지네이션 계약 (MVP: 서버 페이지네이션 범위 제외)

> 이 MVP는 서버가 없으므로 **리스트/히스토리 화면의 페이지네이션은 클라이언트(in-memory)에서 slice로만 구현**한다.  
> 즉, “list/pagination endpoint”는 **외부 API로 제공하지 않으며**, 아래의 로컬 함수 계약을 표준으로 사용한다.

### 공통 Page Shape
```ts
export interface Page<T> {
  items: T[];
  total: number; // 필터 적용 후 전체 개수
  page: number;  // 1-based
}
```

### SessionLog 페이지 계약
- 정렬: `startAtISO` 내림차순
- 필터(옵션): `childId`, `weekStartISO~weekEndISO`(inclusive)
```ts
export function getSessionLogsPage(params: {
  page: number;        // >= 1
  pageSize: number;    // 1..100 (기본 20)
  childId?: string;
  weekStartISO?: string;
  weekEndISO?: string;
}): Page<SessionLog>;
```

### ContentCheck 페이지 계약
- 정렬: `createdAt` 내림차순
- 필터(옵션): `childId`, `status`
```ts
export function getContentChecksPage(params: {
  page: number;        // >= 1
  pageSize: number;    // 1..100 (기본 20)
  childId?: string;
  status?: ContentCheck["status"];
}): Page<ContentCheck>;
```

- **Pass/Fail 규칙(공통)**: `pageSize=20`, `page=1`, `total=0`인 경우 반드시 `items.length===0`이어야 한다.
- **Out of Scope**: 무한 스크롤을 위한 서버 커서/토큰, DB 기반 검색/필터링.

---

## External API Spec — AI 콘텐츠 점검 서버(별도 Railway 등 배포)

> S6/S7의 “AI 기능은 외부 API 호출” 요구를 충족하기 위한 **클라이언트→외부 서버** 계약이다. 서버는 본 프로젝트(미니앱) 범위 밖이며, CORS 허용이 전제다.

### Base URL
- `VITE_AI_API_BASE_URL` (예: `https://<your-domain>.railway.app`)
- 모든 요청은 `${VITE_AI_API_BASE_URL}` 하위 경로로 호출한다.

### 인증(선택)
- 서버가 인증을 요구하는 경우에만 사용:
  - Header: `x-api-key: <string>`
  - 값: `import.meta.env.VITE_AI_API_KEY`
- 인증이 필요한데 헤더가 없거나 유효하지 않으면 401을 반환한다.

---

### Endpoint 1) 텍스트 점검 생성(동기 결과 반환)
- **Method/Path**: `POST /api/content-check`
- **목적**: 텍스트를 분석하고, 결과를 **즉시(동기)** 반환한다(MVP 단순화).

#### Request Headers
- `Content-Type: application/json`
- (옵션) `x-api-key: string` (인증 사용 시)

#### Request Body (TypeScript)
> **FIX:** 요청 바디는 `ContentCheck.inputText`와 동일한 의미를 가지며, 클라이언트는 trim 적용 후 전송한다.
```ts
export interface ContentCheckCreateRequest {
  childId: string;        // local ChildProfile.id를 그대로 전달
  inputText: string;      // 1..500 chars (trim 적용 후)
}
```

#### 200 Response Body (TypeScript)
> **FIX:** 응답 스키마는 클라이언트 `ContentCheck`의 결과 필드에 **직접 매핑 가능**해야 한다.
- 매핑 규칙(클라이언트):
  - `ContentCheck.status = "done"`
  - `ContentCheck.riskLevel = response.riskLevel`
  - `ContentCheck.reasons = response.reasons`
  - `ContentCheck.suggestedAction = response.suggestedAction`
  - `ContentCheck.model = response.model`
  - `ContentCheck.errorMessage = null`

```ts
export interface ContentCheckCreateResponse {
  // 서버가 점검 ID를 별도로 발급하는 경우(옵션).
  // 클라이언트는 내비게이션/저장 키로 local ContentCheck.id를 사용하므로,
  // 이 값은 저장하더라도 필수 사용값이 아니다.
  serverCheckId?: string;

  riskLevel: "낮음" | "보통" | "높음";
  reasons: string[];          // 0..5 items, each 1..80 chars
  suggestedAction: string;    // 0..200 chars (서버가 비어있게 보내지 않도록 권장)
  aiLabel: "AI_GENERATED";    // 클라이언트 라벨 표시 검증용(고정값)
  model: string;              // 예: "gpt-4.1-mini"
}
```

#### Error Response Body(공통)
```ts
export interface ApiErrorResponse {
  error: string;     // 예: "INVALID_INPUT"
  message?: string;  // 표시용(옵션)
}
```

#### 오류 코드 테이블(필수)
> **FIX:** 400/401/404/5xx 포함 + 클라이언트 `ContentCheck.status:"error"` 매핑 규칙을 명시한다.  
> 클라이언트 매핑 규칙(공통): 아래 표의 **HTTP가 200이 아닌 경우**, 해당 요청에 대응하는 로컬 `ContentCheck.status`는 `"error"`로 저장되어야 한다. (S6 AC에 의해 결과 화면 자동 이동 금지)

| HTTP | error 값 예시 | 트리거(서버) | 클라이언트 기대 동작(요약) |
|---:|---|---|---|
| 400 | `INVALID_INPUT` / `INVALID_TEXT` | `inputText`가 비어있음/500자 초과/형식 오류 또는 `childId` 형식 오류 | S6에서 토스트 후 재시도 유도(자동 이동 금지) + `ContentCheck.status="error"` 저장 |
| 401 | `UNAUTHORIZED` | `x-api-key` 누락 또는 불일치 | S6에서 토스트 `"인증에 실패했어요"` 후 자동 이동 금지 + `ContentCheck.status="error"` 저장 |
| 404 | `CHILD_NOT_FOUND` | `childId`가 유효하지 않음(서버가 유효성 검증/레지스트리 기반 운영 시) | S6에서 AlertDialog `"자녀 정보를 찾을 수 없어요"` 후 `/`로 replace + `ContentCheck.status="error"` 저장 |
| 429 | `RATE_LIMITED` | 분당 요청 초과 | S6에서 토스트 `"요청이 많아요. 1분 후 다시 시도해주세요"` 후 자동 이동 금지 + `ContentCheck.status="error"` 저장 |
| 5xx | `UPSTREAM_FAILURE` / `INTERNAL_ERROR` | 모델/상위 서비스 장애/서버 내부 오류 | S6에서 토스트 `"분석 서버에 문제가 있어요"` 후 자동 이동 금지 + `ContentCheck.status="error"` 저장 |

- **네트워크 오류(HTTP 응답 없음)**: 클라이언트는 `"네트워크 오류가 발생했어요"` 토스트를 표시하고 `ContentCheck.status="error"`로 저장한다. (S6 AC 기준)

---

### Screen Definitions

아래 모든 화면은 공통적으로:
- 페이지 골격: `ScreenScaffold`(본 프로젝트에서 구현)로 감싼다. (`Top` + 콘텐츠 영역 + 선택적 하단 액션)
- 레이아웃은 `Spacing`, `Stack`(또는 간단한 flex 레이아웃) 사용
- 버튼/리스트 행 등 모든 터치 요소는 44px 이상

#### S1. 홈 대시보드
- Route: `/`
- TDS Components: `Top`, `Typography`(예: `Paragraph.Text`), `Card`, `ListRow`, `Button`, `Chip`, `Spacing`, `Toast`, `BottomSheet`
- 광고: 요약 카드 섹션 아래에 `AdSlot` 1개 배치(콘텐츠 비중을 가리지 않도록 하단 섹션 사이)
- 상태
  - Empty: 자녀 프로필이 0개면 `Asset.ContentIcon` + “자녀 프로필을 추가해주세요”
  - Error: 로컬 저장 로드 실패 시 `Toast` “데이터를 불러오지 못했어요”
- Touch interactions
  - “자녀 추가”, “규칙 설정”, “세션 시작”, “콘텐츠 점검”은 `Button` 또는 `ListRow` 전체 탭
- Navigation state contract
  - Outgoing:
    - “자녀 추가” → `navigate('/profile')`
    - “규칙 설정” → `navigate('/rules')`
    - “세션 시작” → `navigate('/timer', { state: { childId: string } })`
    - “콘텐츠 점검” → `navigate('/content-check', { state: { childId: string } })`
  - Incoming: `location.state` 사용 없음
- Layout/Presentation contract
  - 상단: `Top` 타이틀 “ParentShield”
  - 본문: (1) 오늘 사용 요약 Card, (2) 빠른 액션 ListRow 그룹, (3) `AdSlot`, (4) 최근 세션 3개 미니 리스트
  - childId 결정 규칙(네비게이션 상태 충족):
    - 자녀가 1명인 경우 해당 childId를 자동 선택한다.
    - 자녀가 2명 이상인 경우 “세션 시작/콘텐츠 점검” 탭 시 `BottomSheet`로 자녀 선택 리스트를 띄워 선택된 childId로 이동한다.
  - 최근 세션 미니 리스트 데이터 읽기 계약(로컬 페이지 규격):
    - `getSessionLogsPage({ page: 1, pageSize: 3 }) -> { items: SessionLog[], total: number, page: number }`
    - 정렬: `startAtISO` 내림차순
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S1-1 [S]: **WHILE** `ChildProfile[]` 길이가 `0`인 경우 **THE 시스템은** 빈 상태(아이콘 포함)와 문구 `"자녀 프로필을 추가해주세요"`를 렌더링해야 한다.
  - AC-S1-2 [E]: **WHEN** 사용자가 “자녀 추가”를 탭하면 **THE 시스템은** `navigate('/profile')`를 호출해야 한다. *(pass: 경로가 `/profile`로 변경)*
  - AC-S1-3 [E]: **WHEN** 자녀가 정확히 1명이고 사용자가 “세션 시작”을 탭하면 **THE 시스템은** `navigate('/timer', { state:{ childId:<that id> }})`로 이동해야 한다. *(pass: location.state.childId 존재)*
  - AC-S1-4 [E]: **WHEN** 자녀가 2명 이상이고 사용자가 “콘텐츠 점검”을 탭하면 **THE 시스템은** 자녀 선택 `BottomSheet`를 먼저 표시해야 하며, **AND WHEN** 사용자가 특정 자녀를 탭하면 **THE 시스템은** `navigate('/content-check', { state:{ childId:selectedId }})`로 이동해야 한다.
  - AC-S1-5 [W]: **IF** 로컬 데이터 로드가 예외를 발생시키면(= `readStore(...)`가 `StorageError` with `code in {"PARSE_ERROR","STORAGE_READ_FAILED"}`를 throw) **THE 시스템은** 토스트 `"데이터를 불러오지 못했어요"`를 1회 표시해야 하며, **AND** 화면은 크래시 없이 렌더링을 유지해야 한다. *(pass: 라우트 유지 + 토스트 표시)*
  - AC-S1-6 [W]: **IF** 자녀가 0명인 상태에서 사용자가 “세션 시작” 또는 “콘텐츠 점검”을 탭하면 **THE 시스템은** 이동을 수행하지 않아야 하며, **AND** 토스트 `"먼저 자녀 프로필을 추가해주세요"`를 표시해야 한다. *(pass: 경로 변경 없음)*

#### S2. 자녀 프로필 생성/수정
- Route: `/profile`
- TDS Components: `Top`, `TextField`, `Button`, `Spacing`, `AlertDialog`, `Toast`
- 상태
  - Empty: (수정 진입이 아닌 경우) 입력 필드는 빈 값
  - Error: 저장 실패 시 `Toast` “저장에 실패했어요”
- 키보드 대응: 이름 `TextField` 포커스 시 `scrollIntoView`
- Navigation state contract
  - Outgoing: 저장 성공 → `navigate('/', { replace: true })`
  - Incoming: `location.state = undefined | { childId: string }`
- Layout/Presentation contract
  - 1차 액션: 하단 고정 `Button` “저장”(폭 100%)
  - 수정 모드(`location.state.childId` 존재)에서는 보조 액션으로 “프로필 삭제” 버튼을 표시한다.
- 삭제(외래키) 처리 규칙(필수) — **FIX: 캐스케이드/원자성 명시**
  - `ChildProfile` 삭제 시 **연관 데이터는 모두 캐스케이드 삭제**한다.
    - `TimeRule.childId === childId` 인 규칙 삭제
    - `SessionLog.childId === childId` 인 세션 삭제
    - `ContentCheck.childId === childId` 인 점검 삭제
  - 원자성/롤백 규칙(필수):
    - 삭제는 반드시 `writeManyTransactionally([{key:childProfiles...},{key:rules...},{key:sessions...},{key:contentChecks...}])`로 **단일 커밋**한다.
    - 커밋 중 예외 발생 시(예: `StorageError.code==="QUOTA_EXCEEDED"` 또는 `"STORAGE_WRITE_FAILED"`) **즉시 롤백**하여 reload 후에도 부분 삭제가 남지 않아야 한다.
    - 업데이트 순서(고정): `ps:v1:childProfiles` → `ps:v1:rules` → `ps:v1:sessions` → `ps:v1:contentChecks`
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S2-1 [E]: **WHEN** 사용자가 생성 모드에서 이름(1..20자)과 학년을 입력하고 “저장”을 탭하면 **THE 시스템은** `ChildProfile`을 1개 생성해 localStorage `ps:v1:childProfiles`에 추가해야 하며, **AND** `navigate('/', { replace:true })`를 수행해야 한다.
  - AC-S2-2 [E]: **WHEN** 사용자가 수정 모드(`state.childId`)로 진입하면 **THE 시스템은** 200ms 이내에 해당 프로필의 `name/grade`를 입력 필드에 프리필해야 한다.
  - AC-S2-3 [W]: **IF** `name.trim().length === 0`인 상태에서 사용자가 “저장”을 탭하면 **THE 시스템은** 에러 텍스트 `"이름을 입력해주세요"`를 표시해야 하며, **AND** localStorage의 `childProfiles` 길이는 변경되면 안 된다.
  - AC-S2-4 [W]: **IF** `name.length > 20`인 상태에서 “저장”을 탭하면 **THE 시스템은** 에러 텍스트 `"이름은 20자 이내로 입력해주세요"`를 표시해야 하며, **AND** 저장을 수행하면 안 된다.
  - AC-S2-5 [E]: **WHEN** 수정 모드에서 사용자가 “프로필 삭제”를 탭하고 AlertDialog에서 “삭제”를 확정하면 **THE 시스템은** `writeManyTransactionally`를 사용해 해당 `ChildProfile`을 삭제해야 하며, **AND** `TimeRule/SessionLog/ContentCheck` 중 `childId`가 일치하는 항목도 모두 삭제해야 하며, **AND** `/`로 `replace` 이동해야 한다. *(pass: 3개 스토리지 배열에서 childId 항목 0개)*
  - AC-S2-6 [W]: **IF** 수정 진입 `childId`가 존재하지 않으면 **THE 시스템은** `AlertDialog` 제목 `"프로필을 찾을 수 없어요"`를 표시해야 하며, **AND WHEN** 확인을 탭하면 `/`로 `replace` 이동해야 한다.
  - AC-S2-7 [W]: **IF** 저장/삭제 과정에서 localStorage 쓰기가 실패하면(= `writeStore`/`writeManyTransactionally`가 `StorageError`를 throw) **THE 시스템은** 토스트 `"저장에 실패했어요"` 또는 `"삭제에 실패했어요"`를 표시해야 하며, **AND** `writeManyTransactionally` 롤백 규칙에 따라 부분 변경이 남지 않아야 한다. *(pass: reload 후 데이터 불변)*
  - **AC-S2-8 [W] (FIX: 캐스케이드 부분 실패 롤백 검증)**: **IF** 프로필 삭제 커밋 중 2번째 키(`ps:v1:rules`) 저장에서 `StorageError.code==="STORAGE_WRITE_FAILED"`가 발생하도록 모킹했을 때 **THE 시스템은** 예외를 throw해야 하며, **AND** reload 후 `ps:v1:childProfiles/rules/sessions/contentChecks`는 삭제 시도 전과 **완전히 동일**해야 한다. *(pass: 4개 키 모두 불변)*

#### S3. 규칙 목록
- Route: `/rules`
- TDS Components: `Top`, `ListRow`, `Switch`, `Button`, `Spacing`, `Asset.ContentIcon`, `Toast`
- 상태
  - Empty: 규칙이 0개면 `Asset.ContentIcon` + “규칙을 추가해보세요”
  - Loading: 최초 진입 시 200ms 동안 스켈레톤(간단 placeholder Card 2개)
  - Error: 로드 실패 시 `Toast` “규칙을 불러오지 못했어요”
- 리스트 스크롤
  - 규칙이 100개 초과 시 `react-window` 기반 가상 스크롤(고정 행 높이)
- Navigation state contract
  - Outgoing:
    - “규칙 추가” → `navigate('/rules/new')`
    - 규칙 행 탭 → `navigate('/rules/new', { state: { ruleId: string } })`
  - Incoming: `location.state` 사용 없음
- Layout/Presentation contract
  - 각 규칙은 `ListRow` + 우측 `Switch`(enabled 토글)
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S3-1 [S]: **WHILE** `TimeRule[]` 길이가 `0`인 경우 **THE 시스템은** 빈 상태 아이콘과 문구 `"규칙을 추가해보세요"`를 렌더링해야 한다.
  - AC-S3-2 [E]: **WHEN** 사용자가 “규칙 추가”를 탭하면 **THE 시스템은** `navigate('/rules/new')`로 이동해야 한다.
  - AC-S3-3 [E]: **WHEN** 사용자가 규칙 행(임의의 `ruleId`)을 탭하면 **THE 시스템은** `navigate('/rules/new', { state:{ ruleId } })`로 이동해야 한다.
  - AC-S3-4 [E]: **WHEN** 사용자가 특정 규칙의 `Switch`를 토글하면 **THE 시스템은** 해당 `TimeRule.enabled` 값을 반전해 localStorage `ps:v1:rules`에 저장해야 한다. *(pass: reload 후 동일 상태 유지)*
  - AC-S3-5 [W]: **IF** `Switch` 토글 저장이 실패하면(= `writeStore`가 `StorageError` throw) **THE 시스템은** 토스트 `"저장에 실패했어요"`를 표시해야 하며, **AND** 스위치 UI 상태를 원래 값으로 되돌려야 한다. *(pass: 토글 후 즉시 원복)*
  - AC-S3-6 [W]: **IF** 규칙 목록 로드(파싱 포함) 중 오류가 발생하면(= `readStore`가 `StorageError.code in {"PARSE_ERROR","STORAGE_READ_FAILED"}` throw) **THE 시스템은** 토스트 `"규칙을 불러오지 못했어요"`를 표시해야 하며, **AND** 목록은 `[]`로 렌더링되어야 한다.
  - AC-S3-7 [E]: **WHEN** 규칙 수가 `101`개 이상일 때 **THE 시스템은** 가상 스크롤을 사용해 동시 렌더링되는 규칙 행 수가 `40`개 이하가 되도록 해야 한다. *(pass: DOM 상 ListRow 수 ≤ 40)*

#### S4. 규칙 생성/수정
- Route: `/rules/new`
- TDS Components: `Top`, `TextField`, `Chip`(카테고리 선택), `Button`, `Spacing`, `AlertDialog`, `Toast`
- 상태
  - Loading: ruleId로 진입 시 기존 값 로드 전 placeholder
  - Error: 저장 실패 시 `Toast` “저장에 실패했어요”
- 키보드 대응: 제한 시간 `TextField` 포커스 시 스크롤
- Navigation state contract
  - Outgoing: 저장 성공 → `navigate('/rules', { replace: true })`
  - Incoming: `location.state = undefined | { ruleId: string }`
- Layout/Presentation contract
  - 카테고리 선택은 `Chip` 그룹(단일 선택)
  - 1차 액션: 하단 고정 `Button` “저장”(폭 100%)
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S4-1 [E]: **WHEN** 사용자가 생성 모드에서 카테고리를 1개 선택하고 `dailyLimitMin`(0..600)을 입력한 뒤 “저장”을 탭하면 **THE 시스템은** `TimeRule` 1개를 생성하여 `ps:v1:rules`에 저장해야 하며, **AND** `/rules`로 `replace` 이동해야 한다.
  - AC-S4-2 [E]: **WHEN** 사용자가 수정 모드(`state.ruleId`)로 진입하면 **THE 시스템은** 200ms 이내에 해당 규칙의 `category/dailyLimitMin/enabled` 값을 프리필해야 한다.
  - AC-S4-3 [W]: **IF** `dailyLimitMin < 0` 또는 `dailyLimitMin > 600`인 상태에서 “저장”을 탭하면 **THE 시스템은** 에러 메시지 `"0~600분 사이로 입력해주세요"`를 표시해야 하며, **AND** localStorage는 변경되면 안 된다.
  - AC-S4-4 [W]: **IF** 동일한 `childId + category` 조합의 규칙이 이미 존재하는 상태에서 사용자가 생성 모드로 “저장”을 탭하면 **THE 시스템은** `AlertDialog`로 중복 안내를 표시해야 하며, **AND** 규칙 개수는 증가하면 안 된다.
  - AC-S4-5 [W]: **IF** 수정 진입 `ruleId`가 존재하지 않으면 **THE 시스템은** `AlertDialog` 제목 `"규칙을 찾을 수 없어요"`를 표시해야 하며, **AND WHEN** 확인을 탭하면 `/rules`로 `replace` 이동해야 한다.
  - AC-S4-6 [W]: **IF** 저장 과정에서 localStorage 쓰기가 실패하면(= `writeStore`가 `StorageError` throw) **THE 시스템은** 토스트 `"저장에 실패했어요"`를 표시해야 하며, **AND** `/rules`로 이동하면 안 된다. *(pass: route 유지)*

#### S5. 세션 타이머(사용 기록)
- Route: `/timer`
- TDS Components: `Top`, `Card`, `Typography`, `Button`, `TextField`(메모), `Spacing`, `Toast`, `AlertDialog`
- 상태
  - Empty: 활성 세션이 없으면 “세션 시작” CTA
  - Loading: 세션 시작/종료 처리 중 `Button` loading
  - Error: 중복 세션/저장 실패 시 `Toast`
- Navigation state contract
  - Incoming: `location.state = { childId: string }`
  - Outgoing: 종료 후 → `navigate('/', { replace: true })`
- Layout/Presentation contract
  - 핵심 정보(진행 시간)는 `Card` + 큰 타이포(예: t2~t3)
- 중복 세션 정의(명시)
  - “활성 세션(active session)” = `SessionLog.endAtISO === null`
  - “중복 세션(duplicate)” = **동일 `childId`에 대해** 이미 활성 세션이 존재하는데 다시 시작을 시도하는 경우
- durationMin 계산 규칙(명시)
  - 세션 종료 시 `durationMin = Math.max(0, Math.floor((endAt - startAt) / 60000))`
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S5-1 [E]: **WHEN** `/timer`가 `location.state.childId`를 가지고 진입했고 활성 세션이 없을 때 사용자가 카테고리를 선택 후 “세션 시작”을 탭하면 **THE 시스템은** `SessionLog`를 생성하고 `startAtISO`를 현재 시각(ISO)으로 기록하며 `endAtISO=null`로 저장해야 한다.
  - AC-S5-2 [E]: **WHEN** 활성 세션이 있는 상태에서 사용자가 “세션 종료”를 탭하면 **THE 시스템은** 해당 세션의 `endAtISO`를 현재 시각으로 기록하고 `durationMin`을 규칙에 따라 계산하여 저장해야 하며, **AND** `/`로 `replace` 이동해야 한다.
  - AC-S5-3 [S]: **WHILE** 활성 세션이 존재하면 **THE 시스템은** 진행 시간을 표시하는 `Card`를 렌더링해야 하며, **AND** “세션 시작” CTA는 렌더링되면 안 된다. *(pass: 시작 버튼 미노출)*
  - AC-S5-4 [W]: **IF** 동일 `childId`에 대한 활성 세션이 이미 존재할 때 사용자가 “세션 시작”을 탭하면 **THE 시스템은** 새 세션을 생성하면 안 되며, **AND** 토스트 `"이미 진행 중인 세션이 있어요"`를 표시해야 한다.
  - AC-S5-5 [W]: **IF** 활성 세션이 없는 상태에서 사용자가 “세션 종료”를 탭하면 **THE 시스템은** 저장을 수행하면 안 되며, **AND** 토스트 `"진행 중인 세션이 없어요"`를 표시해야 한다.
  - AC-S5-6 [W]: **IF** `/timer` 진입 시 `location.state`가 없거나 `childId`가 비어있으면 **THE 시스템은** `AlertDialog` 제목 `"자녀를 선택해주세요"`를 표시해야 하며, **AND WHEN** 확인을 탭하면 `/`로 `replace` 이동해야 한다.

#### S6. 콘텐츠 점검 입력
- Route: `/content-check`
- TDS Components: `Top`, `TextField`(멀티라인), `Button`, `Spacing`, `Toast`, `AlertDialog`
- 상태
  - Empty: 텍스트 비어있으면 안내 문구 표시
  - Loading: 분석 요청 중 `Button` loading + “분석 중…” 텍스트
  - Error: 네트워크/429 등 `Toast`
- 키보드 대응: 멀티라인 `TextField` 포커스 시 스크롤
- Navigation state contract
  - Incoming: `location.state = { childId: string }`
  - Outgoing: 분석 요청 성공 → `navigate('/content-check/result', { state: { checkId: string } })`
- Layout/Presentation contract
  - 1차 액션: 하단 고정 `Button` “점검하기”(폭 100%)
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S6-1 [W]: **IF** `/content-check` 진입 시 `location.state.childId`가 없으면 **THE 시스템은** `AlertDialog` 제목 `"자녀를 선택해주세요"`를 표시해야 하며, **AND WHEN** 확인을 탭하면 `/`로 `replace` 이동해야 한다.
  - AC-S6-2 [W]: **IF** `inputText.trim().length === 0`인 상태에서 사용자가 “점검하기”를 탭하면 **THE 시스템은** 에러 메시지 `"점검할 텍스트를 입력해주세요"`를 표시해야 하며, **AND** 외부 API 호출은 0회여야 한다.
  - AC-S6-3 [W]: **IF** `inputText.length > 500`인 상태에서 “점검하기”를 탭하면 **THE 시스템은** 에러 메시지 `"500자 이내로 입력해주세요"`를 표시해야 하며, **AND** 외부 API 호출은 0회여야 한다.
  - AC-S6-4 [E]: **WHEN** 사용자가 유효한 텍스트로 “점검하기”를 탭하면 **THE 시스템은** `ContentCheck`를 `status:"pending"`으로 localStorage(`ps:v1:contentChecks`)에 먼저 저장해야 하며, **AND** 외부 API `POST /api/content-check`를 1회 호출해야 한다.
  - AC-S6-5 [E]: **WHEN** 외부 API가 200으로 응답하면 **THE 시스템은** 해당 `ContentCheck`를 `status:"done"`으로 업데이트하고 `riskLevel/reasons/suggestedAction/model`을 저장해야 하며, **AND** `navigate('/content-check/result', { state:{ checkId }})`로 이동해야 한다. *(pass: result route state.checkId 존재)*
  - AC-S6-6 [W]: **IF** 외부 API가 429를 반환하면 **THE 시스템은** 토스트 `"요청이 많아요. 1분 후 다시 시도해주세요"`를 표시해야 하며, **AND** `ContentCheck.status`를 `"error"`로 저장해야 하며, **AND** 결과 화면으로 자동 이동하면 안 된다.
  - AC-S6-7 [W]: **IF** 외부 API가 네트워크 오류/500을 반환하면 **THE 시스템은** 토스트 `"네트워크 오류가 발생했어요"` 또는 `"분석 서버에 문제가 있어요"`를 표시해야 하며, **AND** `ContentCheck.status`를 `"error"`로 저장해야 하며, **AND** 결과 화면으로 자동 이동하면 안 된다.

#### S7. 콘텐츠 점검 결과 (보상형 광고 게이트 적용 화면)
- Route: `/content-check/result`
- TDS Components: `Top`, `Card`, `Typography`, `Chip`(위험도), `Badge`(AI 라벨), `Button`, `Spacing`, `Asset.ContentIcon`, `Toast`
- 광고: 무료 이용자는 결과 Card 영역을 `<TossRewardAd>`로 감싸 “광고 시청 후 결과 표시”
- 상태
  - Loading: 결과 로드 전 스켈레톤 Card
  - Empty: checkId 결과가 없으면 `Asset.ContentIcon` + “결과를 찾을 수 없어요”
  - Error: 로드 실패 `Toast` “결과를 불러오지 못했어요”
- Navigation state contract
  - Incoming: `location.state = { checkId: string }`
  - Outgoing: “다시 점검” → `navigate('/content-check', { replace: true, state: { childId: string } })` (childId는 저장된 체크에서 역참조)
- Layout/Presentation contract (검증용 testid 필수)
  - 결과는 `data-testid="ai-result-card"`를 가진 `Card` 1개 이상에 표시
  - “AI가 생성한 결과입니다” 라벨은 `data-testid="ai-generated-label"`로 표시
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S7-1 [W]: **IF** `/content-check/result` 진입 시 `location.state.checkId`가 없으면 **THE 시스템은** 빈 상태 `"결과를 찾을 수 없어요"`를 렌더링해야 하며, **AND** “다시 점검” 탭 시 `/content-check`로 이동하면 안 되고 `/`로 `replace` 이동해야 한다. *(pass: 잘못된 진입 보호)*
  - AC-S7-2 [S]: **WHILE** `checkId`에 해당하는 `ContentCheck`가 로딩 중이면 **THE 시스템은** 스켈레톤 `Card`를 1개 이상 렌더링해야 한다.
  - AC-S7-3 [E]: **WHEN** `effectivePremium === false`이고 `ContentCheck.status==="done"`인 상태에서 화면을 렌더링하면 **THE 시스템은** 결과 영역을 `<TossRewardAd>`로 감싸야 하며, **AND WHEN** 사용자가 광고 시청을 완료하면 `data-testid="ai-result-card"`가 표시되어야 한다.
  - AC-S7-4 [E]: **WHEN** `effectivePremium === true`이고 결과가 존재하면 **THE 시스템은** `<TossRewardAd>` 없이 즉시 `data-testid="ai-result-card"`를 표시해야 한다.
  - AC-S7-5 [E]: **WHEN** 결과 카드가 표시될 때 **THE 시스템은** `data-testid="ai-generated-label"` 요소를 렌더링하고 텍스트 `"AI가 생성한 결과입니다"`를 포함해야 한다.
  - AC-S7-6 [W]: **IF** localStorage에 `checkId`에 해당하는 `ContentCheck`가 없으면 **THE 시스템은** 빈 상태 `"결과를 찾을 수 없어요"`를 렌더링해야 하며, **AND** 콘솔 에러 없이 동작해야 한다.
  - AC-S7-7 [W]: **IF** `ContentCheck.status==="error"`이면 **THE 시스템은** 토스트 `"결과를 불러오지 못했어요"`를 표시해야 하며, **AND** 위험도/근거 영역(`ai-result-card`)은 렌더링되면 안 된다.

#### S8. 주간 리포트
- Route: `/report`
- TDS Components: `Top`, `Card`, `Typography`, `Tab`(상단: 이번주/지난주), `Button`, `Spacing`, `Asset.ContentIcon`, `Toast`
- 광고: 차트/요약 카드 아래에 `AdSlot` 1개 (겹침 금지)
- 상태
  - Empty: 세션 로그 0개면 `Asset.ContentIcon` + “아직 기록이 없어요”
  - Loading: “리포트 생성” 처리 중 스켈레톤
  - Error: 계산 실패 시 `Toast` “리포트를 만들 수 없어요”
- Navigation state contract
  - Incoming: `location.state` 사용 없음
  - Outgoing: 없음
- Layout/Presentation contract (검증용 testid 필수)
  - 주간 요약 히어로 Card는 `data-testid="weekly-report-hero"`로 렌더링
- 세션/히스토리 리스트 데이터 읽기 계약(로컬 페이지 규격, 필수)
  - 리포트 화면 내 리스트/히스토리형 섹션(예: “세부 기록 보기”)은 아래 규격으로만 읽는다:
```ts
export interface SessionLogPage {
  items: SessionLog[];
  total: number;
  page: number;
}
```
  - 함수 계약(예시):
    - `getSessionLogsPage({ page: number, pageSize: number, weekStartISO: string, weekEndISO: string }): SessionLogPage`
  - 기본 `pageSize = 20`
  - 정렬: `startAtISO` 내림차순
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S8-1 [S]: **WHILE** 집계 대상 주에 해당하는 `SessionLog`가 0개이면 **THE 시스템은** 빈 상태 아이콘과 문구 `"아직 기록이 없어요"`를 렌더링해야 한다.
  - AC-S8-2 [E]: **WHEN** 집계 대상 주에 세션이 존재하면 **THE 시스템은** `data-testid="weekly-report-hero"`를 렌더링하고 총합(분) 텍스트를 포함해야 한다. *(pass: `"총 "` 및 `"분"` 포함)*
  - AC-S8-3 [E]: **WHEN** 사용자가 상단 `Tab`에서 `"지난주"`를 탭하면 **THE 시스템은** 200ms 동안 스켈레톤 `Card`를 1개 이상 표시한 뒤, 지난주 값으로 히어로를 갱신해야 한다.
  - AC-S8-4 [E]: **WHEN** 화면이 렌더링될 때 **THE 시스템은** `AdSlot`을 히어로 카드 아래 DOM 순서에 배치해야 하며, **AND** 히어로 영역을 덮는 레이아웃이 되면 안 된다. *(pass: DOM 순서 hero → AdSlot)*
  - AC-S8-5 [W]: **IF** 세션 데이터에 `durationMin < 0` 또는 `durationMin > 1440`인 항목이 존재하면 **THE 시스템은** 해당 항목을 집계에서 제외해야 하며, **AND** 토스트 `"일부 기록이 손상되어 제외했어요"`를 1회 표시해야 한다.
  - AC-S8-6 [W]: **IF** 주간 집계 계산 중 예외가 발생하면 **THE 시스템은** 토스트 `"리포트를 만들 수 없어요"`를 표시해야 하며, **AND** 화면은 크래시 없이 빈 상태 또는 이전 값으로 유지되어야 한다.

#### S9. 프리미엄(30일 이용권) 결제
- Route: `/premium`
- TDS Components: `Top`, `Card`, `Typography`, `Button`, `Spacing`, `Toast`
- 결제: `TossPurchase` 버튼을 화면 하단 섹션에 배치
- 상태
  - Loading: 결제 진행 중 `TossPurchase` 내부 loading
  - Error: 결제 실패 시 `Toast` “결제가 완료되지 않았어요”
- Navigation state contract
  - Outgoing: 구매 성공 → `navigate('/', { replace: true })`
  - Incoming: `location.state` 사용 없음
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S9-1 [E]: **WHEN** 사용자가 `/premium`에 진입하면 **THE 시스템은** “프리미엄 혜택”을 설명하는 `Card`를 1개 이상 렌더링해야 한다.
  - AC-S9-2 [E]: **WHEN** `TossPurchase.onPurchased`가 호출되면 **THE 시스템은** localStorage `ps:v1:entitlement.isPremium`을 `true`로, `lastPurchaseAtISO`를 현재 시각으로 저장하고, `expiresAtISO`를 `lastPurchaseAtISO + 30일`로 저장해야 하며, **AND** `/`로 `replace` 이동해야 한다.
  - AC-S9-3 [W]: **IF** 결제 플로우가 실패(`onError`)하면 **THE 시스템은** 토스트 `"결제가 완료되지 않았어요"`를 표시해야 하며, **AND** `ps:v1:entitlement`의 값은 변경되면 안 된다.
  - AC-S9-4 [S]: **WHILE** `TossPurchase`가 결제 진행 중이면 **THE 시스템은** 구매 버튼을 연속 탭할 수 없도록 disabled 상태여야 하며, **AND** `"결제 처리 중"` 텍스트를 표시해야 한다.
  - AC-S9-5 [W]: **IF** `effectivePremium === true`인 상태에서 사용자가 `/premium`에 진입하면 **THE 시스템은** 토스트 `"이미 프리미엄이 활성화되어 있어요"`를 1회 표시해야 하며, **AND** 구매 버튼을 disabled 처리해야 한다. *(pass: 버튼 탭 불가)*

#### S10. 설정
- Route: `/settings`
- TDS Components: `Top`, `ListRow`, `AlertDialog`, `Button`, `Spacing`, `Toast`, `BottomSheet`, `Paragraph.Text`
- 상태
  - Empty: 내보낼 데이터(세션/규칙/프로필)가 0개면 “내보낼 데이터가 없어요”
  - Error: 초기화 실패 시 `Toast` “초기화에 실패했어요”
- Navigation state contract
  - Outgoing: “프리미엄” → `navigate('/premium')`
  - Incoming: `location.state` 사용 없음
- 데이터 내보내기(명시)
  - 내보내기 내용은 아래 키를 포함하는 JSON 문자열 1개로 구성한다:
    - `childProfiles`, `rules`, `sessions`, `contentChecks`, `entitlement`, `uiFlags`
  - 내보내기 전달 방식(MVP): `BottomSheet`에 JSON을 표시하고, “복사” 버튼 탭 시 `navigator.clipboard.writeText(json)` 시도
- 전체 초기화 원자성/롤백 규칙(필수)
  - `ps:v1:childProfiles`, `ps:v1:rules`, `ps:v1:sessions`, `ps:v1:contentChecks`, `ps:v1:entitlement`, `ps:v1:uiFlags` 초기화는 반드시 `writeManyTransactionally`로 수행한다.
- **Acceptance Criteria (EARS, 4+ / 실패 2+)**
  - AC-S10-1 [E]: **WHEN** 사용자가 “프리미엄” ListRow를 탭하면 **THE 시스템은** `navigate('/premium')`로 이동해야 한다.
  - AC-S10-2 [W]: **IF** `childProfiles/rules/sessions/contentChecks`가 모두 비어있는 상태에서 사용자가 “데이터 내보내기”를 탭하면 **THE 시스템은** 토스트 `"내보낼 데이터가 없어요"`를 표시해야 하며, **AND** `BottomSheet`는 열리면 안 된다.
  - AC-S10-3 [E]: **WHEN** 내보낼 데이터가 1개 이상 있을 때 사용자가 “데이터 내보내기”를 탭하면 **THE 시스템은** `BottomSheet`를 열고 JSON 문자열(비어있지 않음)을 표시해야 한다. *(pass: BottomSheet 내 텍스트 length > 0)*
  - AC-S10-4 [E]: **WHEN** 사용자가 내보내기 `BottomSheet`에서 “복사”를 탭하면 **THE 시스템은** `navigator.clipboard.writeText`를 1회 호출해야 하며, **AND** 성공 시 토스트 `"복사했어요"`를 표시해야 한다.
  - AC-S10-5 [W]: **IF** 클립보드 복사가 실패하면 **THE 시스템은** 토스트 `"복사할 수 없어요"`를 표시해야 하며, **AND** JSON은 화면에 그대로 남아 사용자가 수동으로 선택/복사할 수 있어야 한다.
  - AC-S10-6 [E]: **WHEN** 사용자가 “데이터 초기화”를 탭하고 AlertDialog에서 “초기화”를 확정하면 **THE 시스템은** `writeManyTransactionally`로 관련 localStorage 키들을 명세대로 초기화하고 토스트 `"초기화했어요"`를 표시해야 한다.
  - AC-S10-7 [W]: **IF** 초기화 중 localStorage 쓰기가 실패하면(= `writeManyTransactionally`가 `StorageError` throw) **THE 시스템은** 토스트 `"초기화에 실패했어요"`를 표시해야 하며, **AND** 롤백 규칙에 따라 부분 초기화가 남지 않아야 한다. *(pass: reload 후 데이터 불변)*

---

## Data Models

### ChildProfile — 자녀 프로필
- Interface
```ts
export interface ChildProfile {
  id: string; // uuid
  name: string; // 1..20 chars
  grade: "초4" | "초5" | "초6" | "중1" | "중2" | "중3";
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
```
- localStorage
  - Key: `ps:v1:childProfiles`
  - Shape: `ChildProfile[]`
- Size estimation
  - 1개 ~ 120B, 5명 기준 < 1KB

### TimeRule — 카테고리별 목표 시간 규칙
- Interface
```ts
export type AppCategory = "게임" | "SNS" | "동영상" | "교육" | "기타";

export interface TimeRule {
  id: string; // uuid
  childId: string; // FK -> ChildProfile.id
  category: AppCategory;
  dailyLimitMin: number; // 0..600
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```
- localStorage
  - Key: `ps:v1:rules`
  - Shape: `TimeRule[]`
- Size estimation
  - 1개 ~ 160B, 50개 기준 < 10KB

### SessionLog — 사용 세션 기록(수동 기록)
- Interface
```ts
export interface SessionLog {
  id: string; // uuid
  childId: string;
  category: AppCategory;
  startAtISO: string;
  endAtISO: string | null; // null while running
  durationMin: number; // computed when ended, 0..1440
  memo: string; // 0..50 chars
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
```
- localStorage
  - Key: `ps:v1:sessions`
  - Shape: `SessionLog[]`
- Size estimation
  - 1개 ~ 220B, 500개 기준 < 110KB

### ContentCheck — AI 콘텐츠 점검 요청/결과
- Interface
```ts
export type RiskLevel = "낮음" | "보통" | "높음";

export interface ContentCheck {
  id: string; // uuid
  childId: string;
  inputText: string; // 1..500 chars
  status: "pending" | "done" | "error";
  riskLevel: RiskLevel | null;
  reasons: string[]; // 0..5 items, each 1..80 chars
  suggestedAction: string | null; // 0..200 chars
  errorMessage: string | null; // e.g., "네트워크 오류가 발생했어요"
  model: string | null; // e.g., "gpt-4.1-mini"
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
```
- localStorage
  - Key: `ps:v1:contentChecks`
  - Shape: `ContentCheck[]`
- Size estimation
  - 1개(500자 입력 포함) ~ 1.2KB, 200개 기준 < 240KB

### PremiumEntitlement — 프리미엄 상태(30일 이용권)
- Interface
```ts
export interface PremiumEntitlement {
  isPremium: boolean;
  expiresAtISO: string | null; // now < expiresAtISO => premium
  lastPurchaseAtISO: string | null;
}
```
- localStorage
  - Key: `ps:v1:entitlement`
  - Shape: `PremiumEntitlement`
- Size estimation
  - < 200B

### UiFlags — UI 플래그(AI 고지)
- Interface
```ts
export interface UiFlags {
  aiNoticeAccepted: boolean; // first-time disclosure
}
```
- localStorage
  - Key: `ps:v1:uiFlags`
  - Shape: `UiFlags`
- Size estimation
  - < 50B

### FK 삭제 규칙(캐스케이드) — **FIX: 단일 writeManyTransactionally + 실패 롤백 명시**
- `ChildProfile` 삭제 시 아래 종속 엔티티는 **모두 캐스케이드 삭제**한다.
  - `TimeRule.childId === deletedChildId`
  - `SessionLog.childId === deletedChildId`
  - `ContentCheck.childId === deletedChildId`
- 원자성 보장 방식:
  - 캐스케이드 삭제는 **반드시 단 1회의** `writeManyTransactionally` 호출로 수행한다.
  - 업데이트 순서(고정): `ps:v1:childProfiles` → `ps:v1:rules` → `ps:v1:sessions` → `ps:v1:contentChecks`
  - 커밋 중 예외 발생 시 롤백되어, **reload 후에도 부분 삭제가 남지 않아야 한다.** (검증 AC: AC-S2-7, AC-S2-8)

**총 저장 용량 예상:** 1MB 미만 (5MB 제한 대비 충분)

---

## Feature List

### F1. 로컬 데이터 레이어(저장/로드/마이그레이션)
- Description: 프로필, 규칙, 세션, 콘텐츠 점검, 프리미엄 상태를 localStorage에 저장하고 앱 재실행 시 복구한다. 저장 실패/파싱 실패 등 예외를 사용자에게 명확한 메시지로 안내하고, 손상된 데이터는 안전하게 초기화할 수 있게 한다.
- Data: `ChildProfile`, `TimeRule`, `SessionLog`, `ContentCheck`, `PremiumEntitlement`, `UiFlags`
- API: 없음
- Requirements:
- AC-1 [U][P0]: Scenario: 앱 시작 시 로컬 데이터 로드
  - Given localStorage에 `ps:v1:childProfiles`가 `[]`로 저장되어 있을 때
  - When 사용자가 `/`로 진입
  - Then 앱 상태의 childProfiles 길이는 `0`이어야 한다
  - And 화면에 콘솔 에러(`console.error`)가 0회여야 한다
- AC-2 [E][P0]: Scenario: 저장 함수 호출 시 localStorage 반영
  - Given 토스 로그인된 유저가 있을 때
  - When 시스템이 `ChildProfile { id:"c1", name:"민준", grade:"초5" }`를 저장
  - Then localStorage `ps:v1:childProfiles`에 id가 `"c1"`인 항목이 1개 존재해야 한다
- AC-3 [W][P1]: Scenario: JSON 파싱 실패 시 안전 초기화
  - Given localStorage `ps:v1:rules` 값이 문자열 `"NOT_JSON"`일 때
  - When 사용자가 `/rules`로 진입
  - Then 시스템은 `readStore('ps:v1:rules', [])`에서 `StorageError.code==="PARSE_ERROR"`를 감지하고 rules를 `[]`로 초기화해야 한다
  - And 토스트 메시지 `"규칙 데이터를 불러오지 못해 초기화했어요"`를 1회 표시해야 한다
- AC-4 [W][P1]: Scenario: localStorage 저장 실패(QuotaExceededError)
  - Given 브라우저가 localStorage 쓰기 시 `QuotaExceededError`를 발생시키도록 모킹되어 있을 때
  - When 사용자가 세션 저장을 시도
  - Then `writeStore('ps:v1:sessions', ...)` 또는 `writeManyTransactionally(...)`가 `StorageError.code==="QUOTA_EXCEEDED"`로 실패해야 한다
  - And 토스트 메시지 `"저장 공간이 부족해 저장할 수 없어요"`를 표시해야 한다
  - And 메모리 상태(리액트 상태)에만 임시 반영하지 않고 저장 실패로 롤백해야 한다
- AC-5 [E][P1]: Scenario: 데이터 없음(빈 상태) 화면 지원
  - Given localStorage에 `ps:v1:sessions`가 `[]`일 때
  - When 사용자가 `/report`로 진입
  - Then `Asset.ContentIcon`이 포함된 빈 상태가 렌더링되어야 한다
  - And 안내 문구 `"아직 기록이 없어요"`가 보여야 한다

---

### F2. 자녀 프로필 생성/수정(온보딩)
- Description: 부모가 자녀 프로필(이름, 학년)을 생성/수정할 수 있다. 프로필이 없으면 홈에서 프로필 생성으로 유도하며, 입력 검증을 통해 빈 값/길이 초과를 방지한다.
- Data: `ChildProfile`
- API: 없음
- Requirements:
- AC-1 [E][P0]: Scenario: 자녀 프로필 생성 성공
  - Given 토스 로그인된 유저가 있을 때
  - When 사용자가 `/profile`에서 `{ name:"민준", grade:"초5" }`로 “저장” 버튼을 탭
  - Then localStorage `ps:v1:childProfiles`에 name이 `"민준"`인 프로필이 1개 저장되어야 한다
  - And `Toast`로 `"저장했어요"`가 표시되어야 한다
- AC-2 [W][P1]: Scenario: 이름 공백 거부
  - Given 토스 로그인된 유저가 있을 때
  - When 사용자가 `/profile`에서 `{ name:"", grade:"초5" }`로 “저장” 버튼을 탭
  - Then 입력 에러 텍스트 `"이름을 입력해주세요"`가 표시되어야 한다
  - And localStorage `ps:v1:childProfiles` 길이는 변경되지 않아야 한다
- AC-3 [W][P1]: Scenario: 이름 20자 초과 거부
  - Given 토스 로그인된 유저가 있을 때
  - When 사용자가 `/profile`에서 `{ name:"가나다라마바사아자차카타파하가나다라마바사", grade:"초5" }`로 제출
  - Then 입력 에러 텍스트 `"이름은 20자 이내로 입력해주세요"`가 표시되어야 한다
- AC-4 [E][P1]: Scenario: 키보드로 입력 시 하단 저장 버튼 가림 방지
  - Given 사용자가 iOS Safari 환경에서 `/profile`에 있을 때
  - When 사용자가 이름 `TextField`에 포커스
  - Then 포커스된 `TextField`는 `scrollIntoView({ block:"center" })`로 화면 중앙 근처에 위치해야 한다
  - And “저장” 버튼은 화면 하단에서 탭 가능한 상태여야 한다
- AC-5 [E][P1]: Scenario: 수정 진입 시 로딩/프리필
  - Given localStorage `ps:v1:childProfiles`에 `{ id:"c1", name:"민준", grade:"초5" }`가 있을 때
  - When 사용자가 `navigate('/profile', { state:{ childId:"c1" } })`로 진입
  - Then 200ms 이내에 `TextField` 값이 `"민준"`으로 채워져야 한다
- AC-6 [W][P1]: Scenario: 존재하지 않는 childId로 수정 진입
  - Given localStorage에 childId `"nope"`가 없을 때
  - When 사용자가 `/profile`로 `location.state.childId="nope"`로 진입
  - Then `AlertDialog` 제목 `"프로필을 찾을 수 없어요"`가 표시되어야 한다
  - And 확인 탭 시 `/`로 `replace` 이동해야 한다

---

### F3. 시간 규칙 설정 + 세션 타이머 기록
- Description: 카테고리별 일일 목표 시간(분)을 설정하고, 실제 사용을 “세션 시작/종료”로 기록한다. 세션 종료 시 누적 시간이 규칙을 초과하면 경고를 보여 부모-자녀가 함께 조정할 수 있게 한다.
- Data: `TimeRule`, `SessionLog`
- API: 없음
- Requirements:
- AC-1 [E][P0]: Scenario: 규칙 생성 성공
  - Given localStorage `ps:v1:childProfiles`에 `{ id:"c1", name:"민준", grade:"초5" }`가 있을 때
  - When 사용자가 `/rules/new`에서 `{ childId:"c1", category:"게임", dailyLimitMin:60, enabled:true }`로 저장
  - Then localStorage `ps:v1:rules`에 `{ childId:"c1", category:"게임", dailyLimitMin:60 }` 규칙이 1개 존재해야 한다
- AC-2 [W][P1]: Scenario: 제한 시간 음수/초과 입력 거부
  - Given 토스 로그인된 유저가 있을 때
  - When 사용자가 `/rules/new`에서 dailyLimitMin에 `-1`을 입력 후 저장
  - Then 에러 메시지 `"0~600분 사이로 입력해주세요"`가 표시되어야 한다
  - And 저장이 수행되지 않아야 한다
- AC-3 [W][P1]: Scenario: 동일 자녀+카테고리 중복 규칙 방지
  - Given localStorage `ps:v1:rules`에 `{ childId:"c1", category:"게임", dailyLimitMin:60 }`가 있을 때
  - When 사용자가 `/rules/new`에서 `{ childId:"c1", category:"게임", dailyLimitMin:30 }`로 저장
  - Then `AlertDialog` 본문 `"이미 같은 카테고리 규칙이 있어요. 수정 화면에서 변경해주세요"`가 표시되어야 한다
  - And localStorage 규칙 개수는 증가하지 않아야 한다
- AC-4 [E][P0]: Scenario: 세션 시작/종료로 기록 생성
  - Given 사용자가 `navigate('/timer', { state:{ childId:"c1" } })`로 진입했을 때
  - When 사용자가 카테고리 `"게임"`을 선택하고 “세션 시작”을 탭한 뒤 1분 후 “세션 종료”를 탭
  - Then localStorage `ps:v1:sessions`에 `{ childId:"c1", category:"게임", durationMin:1 }`인 항목이 1개 존재해야 한다
- AC-5 [E][P1]: Scenario: 규칙 초과 시 경고 표시
  - Given `ps:v1:rules`에 `{ childId:"c1", category:"게임", dailyLimitMin:1 }`가 있고
  - And 오늘 날짜로 `ps:v1:sessions`에 `{ childId:"c1", category:"게임", durationMin:1 }`가 이미 있을 때
  - When 사용자가 추가로 `"게임"` 세션을 1분 기록하여 종료
  - Then `AlertDialog` 제목 `"오늘 목표 시간을 초과했어요"`가 표시되어야 한다
  - And 본문에 `"게임 1분 제한 / 현재 2분"` 텍스트가 포함되어야 한다
- AC-6 [E][P1]: Scenario: 규칙/세션 빈 상태
  - Given localStorage `ps:v1:rules`가 `[]`일 때
  - When 사용자가 `/rules`로 진입
  - Then 빈 상태 문구 `"규칙을 추가해보세요"`가 표시되어야 한다
- AC-7 [W][P1]: Scenario: 활성 세션 중복 시작 방지
  - Given localStorage `ps:v1:sessions`에 `{ id:"s1", childId:"c1", category:"게임", endAtISO:null }`가 있을 때
  - When 사용자가 `/timer`에서 “세션 시작”을 다시 탭
  - Then 토스트 `"이미 진행 중인 세션이 있어요"`가 표시되어야 한다
  - And 새로운 endAtISO:null 세션이 추가되면 안 된다

---

### F4. AI 유해 콘텐츠 점검(텍스트 분석) + 보상형 광고 게이트
- Description: 부모가 자녀의 대화/검색어/문구를 붙여넣어 유해 가능성을 점검한다. 분석 결과는 위험도/근거/권장 행동으로 제공하며, 무료 이용자는 결과 보기 전에 보상형 광고를 시청한다.
- Data: `ContentCheck`, `UiFlags`, `PremiumEntitlement`
- API: `POST /api/content-check` → AI 분석 결과 (상세 계약은 “External API Spec” 섹션 참조)
- Requirements:
- AC-1 [E][P0]: Scenario: AI 서비스 첫 이용 고지(1회)
  - Given localStorage `ps:v1:uiFlags.aiNoticeAccepted`가 `false`이거나 키가 없을 때
  - When 사용자가 `/content-check`로 처음 진입
  - Then `AlertDialog`에 `"이 서비스는 생성형 AI를 활용합니다"` 문구가 표시되어야 한다
  - And 사용자가 “확인”을 탭하면 localStorage `ps:v1:uiFlags.aiNoticeAccepted`가 `true`로 저장되어야 한다
- AC-2 [W][P1]: Scenario: 점검 텍스트 비어있음 거부
  - Given 사용자가 `/content-check`에 있을 때
  - When 사용자가 `inputText=""`로 “점검하기”를 탭
  - Then 에러 메시지 `"점검할 텍스트를 입력해주세요"`가 표시되어야 한다
  - And API 호출이 0회여야 한다
- AC-3 [E][P1]: Scenario: 분석 요청 로딩 상태
  - Given 사용자가 `/content-check`에 있고 inputText가 `"죽어버려"`일 때
  - When 사용자가 “점검하기”를 탭
  - Then 버튼은 loading 상태여야 한다
  - And 화면에 `"분석 중…"` 텍스트가 표시되어야 한다
- AC-4 [E][P0]: Scenario: 무료 이용자 결과 보기 전 보상형 광고
  - Given localStorage `ps:v1:entitlement.isPremium=false`일 때
  - And 분석이 완료되어 `/content-check/result`로 `checkId="k1"`로 진입했을 때
  - When 사용자가 TossRewardAd 광고 시청을 완료
  - Then `data-testid="ai-result-card"`가 화면에 표시되어야 한다
  - And `data-testid="ai-generated-label"`로 `"AI가 생성한 결과입니다"`가 표시되어야 한다
- AC-5 [E][P0]: Scenario: 프리미엄 이용자는 광고 없이 결과 표시
  - Given localStorage `ps:v1:entitlement.isPremium=true`이고 `expiresAtISO`가 미래일 때
  - When 사용자가 `/content-check/result`로 `checkId="k1"`로 진입
  - Then TossRewardAd 게이트 없이 즉시 `data-testid="ai-result-card"`가 표시되어야 한다
- AC-6 [W][P1]: Scenario: API 네트워크 오류 처리
  - Given API 서버가 네트워크 오류로 응답하지 않을 때
  - When 사용자가 `"성적인 사진"` 텍스트로 점검 요청
  - Then 토스트 `"네트워크 오류가 발생했어요"`가 표시되어야 한다
  - And 해당 `ContentCheck.status`는 `"error"`로 저장되어야 한다
- AC-7 [W][P1]: Scenario: API 429(과다 요청) 처리
  - Given API가 HTTP 429와 `{ error:"RATE_LIMITED" }`를 반환할 때
  - When 사용자가 점검 요청
  - Then 토스트 `"요청이 많아요. 1분 후 다시 시도해주세요"`가 표시되어야 한다
  - And 결과 화면으로 자동 이동하면 안 된다

---

### F5. 주간 리포트(세션 집계 + 시각적 요약) + 배너 광고
- Description: 저장된 세션 로그를 주 단위로 집계해 카테고리별 사용 시간을 보여준다. 기록이 없으면 빈 상태를 제공하고, 무료 이용자는 리포트 화면 내 배너 광고를 보게 된다.
- Data: `SessionLog`, `TimeRule`, `ChildProfile`, `PremiumEntitlement`
- API: 없음
- Requirements:
- AC-1 [E][P0]: Scenario: 주간 리포트 집계 표시
  - Given `ps:v1:sessions`에 `{ childId:"c1", category:"게임", durationMin:30 }`와 `{ childId:"c1", category:"교육", durationMin:60 }`가 같은 주에 저장되어 있을 때
  - When 사용자가 `/report`로 진입
  - Then `data-testid="weekly-report-hero"`에 `"총 90분"` 텍스트가 포함되어야 한다
  - And `"게임 30분"`과 `"교육 60분"`이 각각 표시되어야 한다
- AC-2 [E][P1]: Scenario: 기록 없음 빈 상태
  - Given localStorage `ps:v1:sessions`가 `[]`일 때
  - When 사용자가 `/report`로 진입
  - Then `Asset.ContentIcon`이 표시되어야 한다
  - And `"아직 기록이 없어요"` 텍스트가 표시되어야 한다
- AC-3 [E][P1]: Scenario: 리포트 로딩 상태(탭 전환)
  - Given 사용자가 `/report`에 있을 때
  - When 사용자가 상단 `Tab`에서 `"지난주"`를 탭
  - Then 200ms 동안 스켈레톤 Card가 1개 이상 표시되어야 한다
  - And 이후 지난주 집계 값으로 업데이트되어야 한다
- AC-4 [W][P1]: Scenario: 비정상 세션 데이터(음수/과다) 제외
  - Given `ps:v1:sessions`에 `{ durationMin:-5 }` 또는 `{ durationMin:20000 }`인 항목이 있을 때
  - When 사용자가 `/report`로 진입
  - Then 집계에는 해당 항목이 포함되지 않아야 한다
  - And 토스트 `"일부 기록이 손상되어 제외했어요"`가 1회 표시되어야 한다
- AC-5 [E][P1]: Scenario: 배너 광고가 콘텐츠를 덮지 않음
  - Given 사용자가 `/report`에 있을 때
  - When 화면이 렌더링될 때
  - Then `AdSlot`은 리포트 Card 섹션 아래에만 존재해야 한다
  - And `AdSlot`이 `data-testid="weekly-report-hero"` 영역과 겹치면 안 된다 (DOM 순서상 hero 이후에 위치)
- AC-6 [W][P1]: Scenario: 세션 목록이 많을 때 성능 유지(가상 스크롤)
  - Given `ps:v1:sessions`에 300개의 항목이 저장되어 있을 때
  - When 사용자가 `/report`에서 “세부 기록 보기” 섹션을 펼칠 때
  - Then 화면에는 동시에 40개 이하의 행만 렌더링되어야 한다(가상 스크롤)
  - And 스크롤로 나머지 항목을 볼 수 있어야 한다

---

### F6. 프리미엄(30일 이용권) 결제 및 기능 게이팅
- Description: 월 9,900원 구독 모델은 MVP에서 “30일 이용권(1회 결제)”로 제공한다. 결제 성공 시 프리미엄 만료일을 저장하고, 프리미엄 상태에서는 보상형 광고 게이트를 제거한다.
- Data: `PremiumEntitlement`
- API: IAP는 템플릿 `TossPurchase` 래퍼 사용 (외부 API 계약 없음)
- Requirements:
- AC-1 [E][P0]: Scenario: 결제 성공 시 프리미엄 30일 활성화
  - Given 사용자가 `/premium`에 있고 현재 시간이 `2026-07-13T00:00:00.000Z`로 고정되어 있을 때
  - When 사용자가 `TossPurchase`로 구매를 완료(onPurchased)했을 때
  - Then localStorage `ps:v1:entitlement.isPremium`은 `true`여야 한다
  - And `expiresAtISO`는 `"2026-08-12T00:00:00.000Z"`여야 한다
- AC-2 [E][P0]: Scenario: 앱 재실행 후 프리미엄 유지
  - Given localStorage `ps:v1:entitlement`에 `isPremium:true`와 미래 `expiresAtISO`가 저장되어 있을 때
  - When 사용자가 앱을 새로고침하고 `/`로 진입
  - Then 프리미엄 배지가 홈에 `"프리미엄 활성"`로 표시되어야 한다
- AC-3 [W][P1]: Scenario: 결제 실패 처리
  - Given `/premium` 화면에 있을 때
  - When 결제 플로우가 실패(onError)했을 때
  - Then 토스트 `"결제가 완료되지 않았어요"`가 표시되어야 한다
  - And localStorage `ps:v1:entitlement.isPremium` 값은 변경되면 안 된다
- AC-4 [W][P1]: Scenario: 만료된 프리미엄 자동 비활성화
  - Given localStorage `ps:v1:entitlement.isPremium=true`이고 `expiresAtISO="2026-07-01T00:00:00.000Z"`일 때
  - When 현재 시간이 `2026-07-13T00:00:00.000Z`이고 사용자가 `/content-check/result`로 진입
  - Then 시스템은 entitlement를 `isPremium=false`로 업데이트해야 한다
  - And 보상형 광고 게이트가 적용되어야 한다
- AC-5 [E][P1]: Scenario: 결제 화면 로딩 상태
  - Given 사용자가 `/premium`에 있을 때
  - When `TossPurchase`가 결제 진행 중 상태일 때
  - Then 구매 버튼은 연속 탭이 불가능해야 한다(disabled)
  - And `"결제 처리 중"` 텍스트가 표시되어야 한다
- AC-6 [E][P1]: Scenario: 프리미엄 미가입 안내(빈 상태)
  - Given localStorage `ps:v1:entitlement.isPremium=false`일 때
  - When 사용자가 `/premium`에 진입
  - Then “프리미엄 혜택” Card가 1개 이상 표시되어야 한다
  - And “30일 이용권” 가격 텍스트 `"월 9,900원"`이 표시되어야 한다

---

### F7. 설정(데이터 내보내기/초기화) + 정책/검수 가드레일
- Description: 사용자는 저장된 데이터를 내보내거나 초기화할 수 있다. 또한 앱인토스 정책 위반(외부 링크 이탈, 외부 로깅, HEX 색상 하드코딩 등)을 방지하는 가드레일을 포함한다.
- Data: 전 모델 읽기/삭제, `UiFlags`
- API: 없음
- Requirements:
- AC-1 [E][P0]: Scenario: 전체 데이터 초기화
  - Given localStorage에 `ps:v1:childProfiles`, `ps:v1:rules`, `ps:v1:sessions`가 각각 1개 이상 있을 때
  - When 사용자가 `/settings`에서 “데이터 초기화”를 탭하고 AlertDialog에서 “초기화”를 탭
  - Then 위 3개 키의 값은 모두 `[]`로 저장되어야 한다
  - And 토스트 `"초기화했어요"`가 표시되어야 한다
- AC-2 [W][P1]: Scenario: 초기화 취소
  - Given localStorage `ps:v1:sessions`에 항목이 1개 있을 때
  - When 사용자가 “데이터 초기화”를 탭한 뒤 AlertDialog에서 “취소”를 탭
  - Then localStorage `ps:v1:sessions` 길이는 변경되지 않아야 한다
- AC-3 [E][P1]: Scenario: 내보낼 데이터 없음(빈 상태)
  - Given localStorage `ps:v1:childProfiles`, `ps:v1:rules`, `ps:v1:sessions`가 모두 `[]`일 때
  - When 사용자가 `/settings`에서 “데이터 내보내기”를 탭
  - Then 토스트 `"내보낼 데이터가 없어요"`가 표시되어야 한다
- AC-4 [W][P1]: Scenario: 외부 도메인 이탈 차단(window.open/href)
  - Given 앱이 실행 중일 때
  - When 코드 경로에서 `window.open("https://example.com")` 또는 `window.location.href="https://example.com"` 호출이 시도되었을 때
  - Then 시스템은 해당 호출을 실행하지 않아야 한다
  - And `AlertDialog` 본문 `"외부 링크 이동이 제한되어 있어요"`를 표시해야 한다
- AC-5 [U][P0]: Scenario: 프로덕션에서 console.error 0회
  - Given 프로덕션 빌드 환경에서 `console.error`를 spy할 때
  - When 사용자가 `/` → `/rules` → `/report` → `/settings`로 순차 이동
  - Then `console.error` 호출 횟수는 `0`이어야 한다
- AC-6 [U][P1]: Scenario: 외부 로깅 SDK 미사용
  - Given 프로젝트 의존성 목록을 검사할 때
  - When 빌드 산출물에서 `"google-analytics"`, `"amplitude"` 문자열을 검색
  - Then 검색 결과는 0건이어야 한다
- AC-7 [U][P1]: Scenario: HEX 색상 하드코딩 금지
  - Given 프로젝트 소스에서 정규식 `/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/`로 검색할 때
  - When 검색을 실행
  - Then 매칭 결과는 0건이어야 한다

---

## Assumptions
1. 토스 앱 세션은 자동 제공되며 별도 로그인 UI/SDK 호출은 없다.
2. “실시간 차단/알림(푸시)”은 MVP에서 제외하고, 수동 기록/리포트로 문제를 부분 해결한다.
3. AI 분석 API 서버는 CORS를 올바르게 설정하며, 오류 응답은 `{ error: string }` 형태로 통일한다.
4. 프리미엄은 서버 검증 없이 localStorage 기반이므로 변조에 취약하며, MVP 검증 목적(가치 검증)에 한정한다.

---

## Open Questions
1. AI 분석 범위: “SNS 대화/검색어” 등 텍스트만 우선 지원하는 것으로 충분한가, 아니면 URL/이미지(스샷) 입력도 MVP에 포함해야 하는가? (현재 SPEC은 텍스트만)
2. 카테고리(AppCategory) 기본값을 “게임/SNS/동영상/교육/기타”로 고정해도 되는가?
3. 리포트의 단위: 자녀가 여러 명일 때 `/report`는 (a) 전체 합산, (b) 자녀 선택 후 단일 자녀 리포트 중 어느 쪽이 우선인가? (현재는 단순화를 위해 단일/선택형은 추후로 가정)
4. AI API 제공 방식: `VITE_AI_API_BASE_URL`로 외부 서버를 붙이는 것에 대한 운영 준비(레일웨이 배포, 키 관리)가 되어 있는가?
5. AI API 인증이 필요한가? 필요하다면 `VITE_AI_API_KEY` 같은 클라이언트 주입 키를 허용할지(401 처리 포함) 확정이 필요한가?