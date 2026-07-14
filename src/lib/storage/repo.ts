import type {
  ChildProfile,
  TimeRule,
  SessionLog,
  ContentCheck,
  Entitlement,
  UiFlags,
} from "@/lib/types";
import { readStore, writeStore, writeManyTransactionally } from "./core";
import { STORAGE_KEYS } from "./keys";

function resolveWriteManyTransactionally(): typeof writeManyTransactionally {
  return (
    (globalThis as unknown as { writeManyTransactionally?: typeof writeManyTransactionally })
      .writeManyTransactionally ?? writeManyTransactionally
  );
}

export async function loadChildProfiles(): Promise<ChildProfile[]> {
  return readStore<ChildProfile[]>(STORAGE_KEYS.childProfiles, []);
}

export async function saveChildProfiles(profiles: ChildProfile[]): Promise<void> {
  writeStore(STORAGE_KEYS.childProfiles, profiles);
}

export async function loadRules(): Promise<TimeRule[]> {
  return readStore<TimeRule[]>(STORAGE_KEYS.rules, []);
}

export async function saveRules(rules: TimeRule[]): Promise<void> {
  writeStore(STORAGE_KEYS.rules, rules);
}

export async function loadSessions(): Promise<SessionLog[]> {
  return readStore<SessionLog[]>(STORAGE_KEYS.sessions, []);
}

export async function saveSessions(sessions: SessionLog[]): Promise<void> {
  writeStore(STORAGE_KEYS.sessions, sessions);
}

export async function loadContentChecks(): Promise<ContentCheck[]> {
  return readStore<ContentCheck[]>(STORAGE_KEYS.contentChecks, []);
}

export async function saveContentChecks(checks: ContentCheck[]): Promise<void> {
  writeStore(STORAGE_KEYS.contentChecks, checks);
}

const DEFAULT_ENTITLEMENT: Entitlement = { isPremium: false, expiresAtISO: null };

export async function loadEntitlement(): Promise<Entitlement> {
  return readStore<Entitlement>(STORAGE_KEYS.entitlement, DEFAULT_ENTITLEMENT);
}

export async function saveEntitlement(entitlement: Entitlement): Promise<void> {
  writeStore(STORAGE_KEYS.entitlement, entitlement);
}

const DEFAULT_UI_FLAGS: UiFlags = { aiNoticeShown: false };

export async function loadUiFlags(): Promise<UiFlags> {
  return readStore<UiFlags>(STORAGE_KEYS.uiFlags, DEFAULT_UI_FLAGS);
}

export async function saveUiFlags(flags: UiFlags): Promise<void> {
  writeStore(STORAGE_KEYS.uiFlags, flags);
}

export async function deleteChildCascade(childId: string): Promise<void> {
  const [childProfiles, rules, sessions, contentChecks] = await Promise.all([
    loadChildProfiles(),
    loadRules(),
    loadSessions(),
    loadContentChecks(),
  ]);

  const updates = [
    { key: STORAGE_KEYS.childProfiles, value: childProfiles.filter((c) => c.id !== childId) },
    { key: STORAGE_KEYS.rules, value: rules.filter((r) => r.childId !== childId) },
    { key: STORAGE_KEYS.sessions, value: sessions.filter((s) => s.childId !== childId) },
    { key: STORAGE_KEYS.contentChecks, value: contentChecks.filter((c) => c.childId !== childId) },
  ];

  resolveWriteManyTransactionally()(updates);
}

export async function buildExportJson(): Promise<string> {
  const [childProfiles, rules, sessions, contentChecks, entitlement, uiFlags] = await Promise.all([
    loadChildProfiles(),
    loadRules(),
    loadSessions(),
    loadContentChecks(),
    loadEntitlement(),
    loadUiFlags(),
  ]);

  return JSON.stringify({ childProfiles, rules, sessions, contentChecks, entitlement, uiFlags });
}
