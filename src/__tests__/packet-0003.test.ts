import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Type Definitions (copied from SPEC — these will be used by implementations)
// ============================================================================

export interface ChildProfile {
  id: string;
  name: string;
  grade: "초4" | "초5" | "초6" | "중1" | "중2" | "중3";
  createdAt: string;
  updatedAt: string;
}

export type AppCategory = "게임" | "SNS" | "동영상" | "교육" | "기타";

export interface TimeRule {
  id: string;
  childId: string;
  category: AppCategory;
  dailyLimitMin: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionLog {
  id: string;
  childId: string;
  category: AppCategory;
  startAtISO: string;
  endAtISO: string | null;
  durationMin: number;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export type RiskLevel = "낮음" | "보통" | "높음";

export interface ContentCheck {
  id: string;
  childId: string;
  inputText: string;
  status: "pending" | "done" | "error";
  riskLevel: RiskLevel | null;
  reasons: string[];
  suggestedAction: string | null;
  errorMessage: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Entitlement {
  isPremium: boolean;
  expiresAtISO: string | null;
}

export interface UiFlags {
  aiNoticeShown: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
}

// ============================================================================
// AC-1: repo.ts — load*/save* 함수 존재 및 localStorage 저장 검증
// ============================================================================

describe("AC-1: repo.ts load/save functions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("AC-1[P0]: loadChildProfiles returns empty array when no data", async () => {
    // These imports will fail until the implementation exists — that's TDD
    const { loadChildProfiles } = await import("@/lib/storage/repo");
    const result = await loadChildProfiles();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("AC-1[P0]: saveChildProfiles persists to localStorage with correct key", async () => {
    const { loadChildProfiles, saveChildProfiles } = await import("@/lib/storage/repo");

    const profile: ChildProfile = {
      id: "child-1",
      name: "철수",
      grade: "초4",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await saveChildProfiles([profile]);

    // Verify localStorage key is correct
    const stored = localStorage.getItem("ps:v1:childProfiles");
    expect(stored).toBeTruthy();
    expect(stored).toContain("철수");

    // Verify load retrieves saved data
    const loaded = await loadChildProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(profile);
  });

  it("AC-1[P1]: saveRules, loadRules work with correct key", async () => {
    const { loadRules, saveRules } = await import("@/lib/storage/repo");

    const rule: TimeRule = {
      id: "rule-1",
      childId: "child-1",
      category: "게임",
      dailyLimitMin: 120,
      enabled: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await saveRules([rule]);

    const stored = localStorage.getItem("ps:v1:rules");
    expect(stored).toBeTruthy();

    const loaded = await loadRules();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(rule);
  });

  it("AC-1[P1]: saveSessions, loadSessions work with correct key", async () => {
    const { loadSessions, saveSessions } = await import("@/lib/storage/repo");

    const session: SessionLog = {
      id: "session-1",
      childId: "child-1",
      category: "게임",
      startAtISO: "2026-01-01T10:00:00Z",
      endAtISO: "2026-01-01T10:30:00Z",
      durationMin: 30,
      memo: "테스트",
      createdAt: "2026-01-01T10:00:00Z",
      updatedAt: "2026-01-01T10:30:00Z",
    };

    await saveSessions([session]);

    const stored = localStorage.getItem("ps:v1:sessions");
    expect(stored).toBeTruthy();

    const loaded = await loadSessions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(session);
  });

  it("AC-1[P1]: saveContentChecks, loadContentChecks work with correct key", async () => {
    const { loadContentChecks, saveContentChecks } = await import("@/lib/storage/repo");

    const check: ContentCheck = {
      id: "check-1",
      childId: "child-1",
      inputText: "테스트 텍스트",
      status: "done",
      riskLevel: "낮음",
      reasons: [],
      suggestedAction: null,
      errorMessage: null,
      model: "gpt-4.1-mini",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    await saveContentChecks([check]);

    const stored = localStorage.getItem("ps:v1:contentChecks");
    expect(stored).toBeTruthy();

    const loaded = await loadContentChecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(check);
  });

  it("AC-1[P1]: saveEntitlement, loadEntitlement work with correct key", async () => {
    const { loadEntitlement, saveEntitlement } = await import("@/lib/storage/repo");

    const entitlement: Entitlement = {
      isPremium: true,
      expiresAtISO: "2026-02-01T00:00:00Z",
    };

    await saveEntitlement(entitlement);

    const stored = localStorage.getItem("ps:v1:entitlement");
    expect(stored).toBeTruthy();

    const loaded = await loadEntitlement();
    expect(loaded).toEqual(entitlement);
  });

  it("AC-1[P1]: saveUiFlags, loadUiFlags work with correct key", async () => {
    const { loadUiFlags, saveUiFlags } = await import("@/lib/storage/repo");

    const flags: UiFlags = {
      aiNoticeShown: true,
    };

    await saveUiFlags(flags);

    const stored = localStorage.getItem("ps:v1:uiFlags");
    expect(stored).toBeTruthy();

    const loaded = await loadUiFlags();
    expect(loaded).toEqual(flags);
  });
});

// ============================================================================
// AC-2: repo.ts — deleteChildCascade 원자성 & writeManyTransactionally 호출
// ============================================================================

describe("AC-2: deleteChildCascade cascade deletion", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("AC-2[P0]: deleteChildCascade deletes child and related rules, sessions, contentChecks with writeManyTransactionally", async () => {
    const {
      saveChildProfiles, saveRules, saveSessions, saveContentChecks,
      loadChildProfiles, loadRules, loadSessions, loadContentChecks,
      deleteChildCascade
    } = await import("@/lib/storage/repo");

    // Setup: create child + related records
    const childId = "child-1";
    await saveChildProfiles([
      {
        id: childId,
        name: "철수",
        grade: "초4",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await saveRules([
      {
        id: "rule-1",
        childId,
        category: "게임",
        dailyLimitMin: 120,
        enabled: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "rule-2",
        childId: "other-child",
        category: "SNS",
        dailyLimitMin: 60,
        enabled: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await saveSessions([
      {
        id: "session-1",
        childId,
        category: "게임",
        startAtISO: "2026-01-01T10:00:00Z",
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
    ]);

    await saveContentChecks([
      {
        id: "check-1",
        childId,
        inputText: "테스트",
        status: "done",
        riskLevel: "낮음",
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    // Execute cascade delete
    await deleteChildCascade(childId);

    // Verify: target child deleted, related records deleted, others untouched
    const children = await loadChildProfiles();
    expect(children).toHaveLength(0);

    const rules = await loadRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("rule-2");

    const sessions = await loadSessions();
    expect(sessions).toHaveLength(0);

    const checks = await loadContentChecks();
    expect(checks).toHaveLength(0);
  });

  it("AC-2[P0]: deleteChildCascade updates in correct order (childProfiles→rules→sessions→contentChecks)", async () => {
    const { deleteChildCascade } = await import("@/lib/storage/repo");

    // Mock writeManyTransactionally to verify call order
    const mockWriteMany = vi.fn();
    vi.stubGlobal("writeManyTransactionally", mockWriteMany);

    // Note: this test checks that the implementation calls writeManyTransactionally
    // We'll verify order by inspecting the keys in the updates array
    await deleteChildCascade("child-1");

    // Verify writeManyTransactionally was called exactly once
    expect(mockWriteMany).toHaveBeenCalledTimes(1);

    // Get the updates array
    const callArgs = mockWriteMany.mock.calls[0][0] as Array<{ key: string }>;

    // Verify order: childProfiles → rules → sessions → contentChecks
    const keyOrder = callArgs.map((u) => u.key);
    const expectedOrder = [
      "ps:v1:childProfiles",
      "ps:v1:rules",
      "ps:v1:sessions",
      "ps:v1:contentChecks",
    ];

    expect(keyOrder).toEqual(expectedOrder);

    vi.unstubAllGlobals();
  });
});

// ============================================================================
// AC-3: repo.ts — buildExportJson 내보내기
// ============================================================================

describe("AC-3: buildExportJson export function", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("AC-3[P0]: buildExportJson returns JSON string containing all 6 keys", async () => {
    const { buildExportJson, saveChildProfiles, saveRules, saveSessions, saveContentChecks, saveEntitlement, saveUiFlags } = await import("@/lib/storage/repo");

    // Setup: save at least one item for each entity
    await saveChildProfiles([
      {
        id: "child-1",
        name: "철수",
        grade: "초4",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await saveRules([
      {
        id: "rule-1",
        childId: "child-1",
        category: "게임",
        dailyLimitMin: 120,
        enabled: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await saveSessions([
      {
        id: "session-1",
        childId: "child-1",
        category: "게임",
        startAtISO: "2026-01-01T10:00:00Z",
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
    ]);

    await saveContentChecks([
      {
        id: "check-1",
        childId: "child-1",
        inputText: "테스트",
        status: "done",
        riskLevel: "낮음",
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);

    await saveEntitlement({
      isPremium: true,
      expiresAtISO: "2026-02-01T00:00:00Z",
    });

    await saveUiFlags({
      aiNoticeShown: true,
    });

    // Execute export
    const exportJson = await buildExportJson();

    // Verify it's a valid JSON string
    expect(typeof exportJson).toBe("string");
    expect(exportJson.length).toBeGreaterThan(0);

    const parsed = JSON.parse(exportJson);

    // Verify all 6 keys are present
    expect(parsed).toHaveProperty("childProfiles");
    expect(parsed).toHaveProperty("rules");
    expect(parsed).toHaveProperty("sessions");
    expect(parsed).toHaveProperty("contentChecks");
    expect(parsed).toHaveProperty("entitlement");
    expect(parsed).toHaveProperty("uiFlags");

    // Verify data is correct
    expect(parsed.childProfiles).toHaveLength(1);
    expect(parsed.childProfiles[0].name).toBe("철수");
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.contentChecks).toHaveLength(1);
    expect(parsed.entitlement.isPremium).toBe(true);
    expect(parsed.uiFlags.aiNoticeShown).toBe(true);
  });

  it("AC-3[P1]: buildExportJson includes empty arrays when no records exist", async () => {
    const { buildExportJson } = await import("@/lib/storage/repo");

    const exportJson = await buildExportJson();
    const parsed = JSON.parse(exportJson);

    expect(parsed.childProfiles).toEqual([]);
    expect(parsed.rules).toEqual([]);
    expect(parsed.sessions).toEqual([]);
    expect(parsed.contentChecks).toEqual([]);
  });
});

// ============================================================================
// AC-4: pagination.ts — getSessionLogsPage 페이지네이션 및 정렬/필터
// ============================================================================

describe("AC-4: getSessionLogsPage pagination", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("AC-4[P0]: getSessionLogsPage returns Page<SessionLog> with startAtISO descending sort", async () => {
    const { saveSessions } = await import("@/lib/storage/repo");
    const { getSessionLogsPage } = await import("@/lib/pagination");

    // Setup: create sessions with different timestamps
    await saveSessions([
      {
        id: "session-1",
        childId: "child-1",
        category: "게임",
        startAtISO: "2026-01-01T10:00:00Z", // oldest
        endAtISO: "2026-01-01T10:30:00Z",
        durationMin: 30,
        memo: "",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:30:00Z",
      },
      {
        id: "session-2",
        childId: "child-1",
        category: "SNS",
        startAtISO: "2026-01-02T15:00:00Z", // newest
        endAtISO: "2026-01-02T15:30:00Z",
        durationMin: 30,
        memo: "",
        createdAt: "2026-01-02T15:00:00Z",
        updatedAt: "2026-01-02T15:30:00Z",
      },
      {
        id: "session-3",
        childId: "child-1",
        category: "동영상",
        startAtISO: "2026-01-01T18:00:00Z", // middle
        endAtISO: "2026-01-01T18:45:00Z",
        durationMin: 45,
        memo: "",
        createdAt: "2026-01-01T18:00:00Z",
        updatedAt: "2026-01-01T18:45:00Z",
      },
    ]);

    // Execute pagination
    const result = await getSessionLogsPage({ page: 1, pageSize: 20 });

    // Verify result shape
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(3);

    // Verify descending order by startAtISO
    expect(result.items[0].startAtISO).toBe("2026-01-02T15:00:00Z");
    expect(result.items[1].startAtISO).toBe("2026-01-01T18:00:00Z");
    expect(result.items[2].startAtISO).toBe("2026-01-01T10:00:00Z");
  });

  it("AC-4[P1]: getSessionLogsPage filters by childId", async () => {
    const { saveSessions } = await import("@/lib/storage/repo");
    const { getSessionLogsPage } = await import("@/lib/pagination");

    await saveSessions([
      {
        id: "session-1",
        childId: "child-1",
        category: "게임",
        startAtISO: "2026-01-01T10:00:00Z",
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
      {
        id: "session-2",
        childId: "child-2",
        category: "SNS",
        startAtISO: "2026-01-02T15:00:00Z",
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-02T15:00:00Z",
        updatedAt: "2026-01-02T15:00:00Z",
      },
    ]);

    const result = await getSessionLogsPage({ page: 1, pageSize: 20, childId: "child-1" });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].childId).toBe("child-1");
  });

  it("AC-4[P1]: getSessionLogsPage filters by week range (inclusive)", async () => {
    const { saveSessions } = await import("@/lib/storage/repo");
    const { getSessionLogsPage } = await import("@/lib/pagination");

    await saveSessions([
      {
        id: "session-1",
        childId: "child-1",
        category: "게임",
        startAtISO: "2026-01-01T10:00:00Z", // before range
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
      {
        id: "session-2",
        childId: "child-1",
        category: "SNS",
        startAtISO: "2026-01-05T15:00:00Z", // within range
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-05T15:00:00Z",
        updatedAt: "2026-01-05T15:00:00Z",
      },
      {
        id: "session-3",
        childId: "child-1",
        category: "동영상",
        startAtISO: "2026-01-10T18:00:00Z", // after range
        endAtISO: null,
        durationMin: 0,
        memo: "",
        createdAt: "2026-01-10T18:00:00Z",
        updatedAt: "2026-01-10T18:00:00Z",
      },
    ]);

    // Week: 2026-01-04 ~ 2026-01-10 (Sunday to Saturday, inclusive)
    const result = await getSessionLogsPage({
      page: 1,
      pageSize: 20,
      weekStartISO: "2026-01-04T00:00:00Z",
      weekEndISO: "2026-01-10T23:59:59Z",
    });

    expect(result.total).toBe(2); // session-2 and session-3
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("session-3"); // descending order
    expect(result.items[1].id).toBe("session-2");
  });

  it("AC-4[P1]: getSessionLogsPage returns empty items when total is 0", async () => {
    const { getSessionLogsPage } = await import("@/lib/pagination");

    const result = await getSessionLogsPage({ page: 1, pageSize: 20 });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.page).toBe(1);
  });

  it("AC-4[P1]: getSessionLogsPage handles pagination correctly", async () => {
    const { saveSessions } = await import("@/lib/storage/repo");
    const { getSessionLogsPage } = await import("@/lib/pagination");

    // Create 30 sessions
    const sessions = Array.from({ length: 30 }, (_, i) => ({
      id: `session-${i}`,
      childId: "child-1",
      category: "게임" as const,
      startAtISO: new Date(2026, 0, 1 + Math.floor(i / 10), i % 10).toISOString(),
      endAtISO: null,
      durationMin: 0,
      memo: "",
      createdAt: new Date(2026, 0, 1).toISOString(),
      updatedAt: new Date(2026, 0, 1).toISOString(),
    }));

    await saveSessions(sessions);

    // Page 1: first 20
    const page1 = await getSessionLogsPage({ page: 1, pageSize: 20 });
    expect(page1.total).toBe(30);
    expect(page1.page).toBe(1);
    expect(page1.items).toHaveLength(20);

    // Page 2: remaining 10
    const page2 = await getSessionLogsPage({ page: 2, pageSize: 20 });
    expect(page2.total).toBe(30);
    expect(page2.page).toBe(2);
    expect(page2.items).toHaveLength(10);
  });
});

// ============================================================================
// AC-5: premium.ts — getEffectivePremium 및 normalizeEntitlementIfExpired
// ============================================================================

describe("AC-5: premium functions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("AC-5[P0]: getEffectivePremium returns true when isPremium=true and not expired", async () => {
    const { saveEntitlement } = await import("@/lib/storage/repo");
    const { getEffectivePremium } = await import("@/lib/premium");

    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(); // 1 day from now
    await saveEntitlement({
      isPremium: true,
      expiresAtISO: futureDate,
    });

    const effective = await getEffectivePremium();
    expect(effective).toBe(true);
  });

  it("AC-5[P0]: getEffectivePremium returns false when isPremium=false", async () => {
    const { saveEntitlement } = await import("@/lib/storage/repo");
    const { getEffectivePremium } = await import("@/lib/premium");

    await saveEntitlement({
      isPremium: false,
      expiresAtISO: null,
    });

    const effective = await getEffectivePremium();
    expect(effective).toBe(false);
  });

  it("AC-5[P0]: getEffectivePremium returns false when expired", async () => {
    const { saveEntitlement } = await import("@/lib/storage/repo");
    const { getEffectivePremium } = await import("@/lib/premium");

    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
    await saveEntitlement({
      isPremium: true,
      expiresAtISO: pastDate,
    });

    const effective = await getEffectivePremium();
    expect(effective).toBe(false);
  });

  it("AC-5[P0]: getEffectivePremium returns false when expiresAtISO is null", async () => {
    const { saveEntitlement } = await import("@/lib/storage/repo");
    const { getEffectivePremium } = await import("@/lib/premium");

    await saveEntitlement({
      isPremium: true,
      expiresAtISO: null,
    });

    const effective = await getEffectivePremium();
    expect(effective).toBe(false);
  });

  it("AC-5[P0]: normalizeEntitlementIfExpired sets isPremium=false when expired", async () => {
    const { saveEntitlement, loadEntitlement } = await import("@/lib/storage/repo");
    const { normalizeEntitlementIfExpired } = await import("@/lib/premium");

    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    await saveEntitlement({
      isPremium: true,
      expiresAtISO: pastDate,
    });

    // Execute normalize
    await normalizeEntitlementIfExpired();

    // Verify isPremium is now false
    const normalized = await loadEntitlement();
    expect(normalized.isPremium).toBe(false);
    expect(normalized.expiresAtISO).toBe(pastDate); // expiration date unchanged
  });

  it("AC-5[P1]: normalizeEntitlementIfExpired does nothing when not expired", async () => {
    const { saveEntitlement, loadEntitlement } = await import("@/lib/storage/repo");
    const { normalizeEntitlementIfExpired } = await import("@/lib/premium");

    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    await saveEntitlement({
      isPremium: true,
      expiresAtISO: futureDate,
    });

    // Execute normalize
    await normalizeEntitlementIfExpired();

    // Verify isPremium is still true
    const normalized = await loadEntitlement();
    expect(normalized.isPremium).toBe(true);
  });

  it("AC-5[P1]: normalizeEntitlementIfExpired does nothing when already false", async () => {
    const { saveEntitlement, loadEntitlement } = await import("@/lib/storage/repo");
    const { normalizeEntitlementIfExpired } = await import("@/lib/premium");

    await saveEntitlement({
      isPremium: false,
      expiresAtISO: "2026-02-01T00:00:00Z",
    });

    // Execute normalize
    await normalizeEntitlementIfExpired();

    // Verify nothing changed
    const normalized = await loadEntitlement();
    expect(normalized.isPremium).toBe(false);
  });
});

// ============================================================================
// Additional: Bonus getContentChecksPage test for completeness
// ============================================================================

describe("Bonus: getContentChecksPage pagination", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getContentChecksPage returns Page<ContentCheck> sorted by createdAt descending", async () => {
    const { saveContentChecks } = await import("@/lib/storage/repo");
    const { getContentChecksPage } = await import("@/lib/pagination");

    await saveContentChecks([
      {
        id: "check-1",
        childId: "child-1",
        inputText: "텍스트 1",
        status: "done",
        riskLevel: "낮음",
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
      {
        id: "check-2",
        childId: "child-1",
        inputText: "텍스트 2",
        status: "done",
        riskLevel: "높음",
        reasons: ["이유 1"],
        suggestedAction: "주의",
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-02T10:00:00Z",
        updatedAt: "2026-01-02T10:00:00Z",
      },
    ]);

    const result = await getContentChecksPage({ page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    // Descending order: newest first
    expect(result.items[0].createdAt).toBe("2026-01-02T10:00:00Z");
    expect(result.items[1].createdAt).toBe("2026-01-01T10:00:00Z");
  });

  it("getContentChecksPage filters by childId", async () => {
    const { saveContentChecks } = await import("@/lib/storage/repo");
    const { getContentChecksPage } = await import("@/lib/pagination");

    await saveContentChecks([
      {
        id: "check-1",
        childId: "child-1",
        inputText: "텍스트",
        status: "done",
        riskLevel: "낮음",
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
      {
        id: "check-2",
        childId: "child-2",
        inputText: "텍스트",
        status: "done",
        riskLevel: "높음",
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-02T10:00:00Z",
        updatedAt: "2026-01-02T10:00:00Z",
      },
    ]);

    const result = await getContentChecksPage({ page: 1, pageSize: 20, childId: "child-1" });

    expect(result.total).toBe(1);
    expect(result.items[0].childId).toBe("child-1");
  });

  it("getContentChecksPage filters by status", async () => {
    const { saveContentChecks } = await import("@/lib/storage/repo");
    const { getContentChecksPage } = await import("@/lib/pagination");

    await saveContentChecks([
      {
        id: "check-1",
        childId: "child-1",
        inputText: "텍스트",
        status: "pending",
        riskLevel: null,
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: null,
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
      },
      {
        id: "check-2",
        childId: "child-1",
        inputText: "텍스트",
        status: "done",
        riskLevel: "낮음",
        reasons: [],
        suggestedAction: null,
        errorMessage: null,
        model: "gpt-4.1-mini",
        createdAt: "2026-01-02T10:00:00Z",
        updatedAt: "2026-01-02T10:00:00Z",
      },
    ]);

    const result = await getContentChecksPage({ page: 1, pageSize: 20, status: "done" });

    expect(result.total).toBe(1);
    expect(result.items[0].status).toBe("done");
  });
});
