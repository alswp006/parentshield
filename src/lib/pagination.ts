import type { ContentCheck, Page, SessionLog } from "@/lib/types";
import { loadContentChecks, loadSessions } from "@/lib/storage/repo";

function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
  };
}

export async function getSessionLogsPage(params: {
  page: number;
  pageSize: number;
  childId?: string;
  weekStartISO?: string;
  weekEndISO?: string;
}): Promise<Page<SessionLog>> {
  const { page, pageSize, childId, weekStartISO, weekEndISO } = params;

  let sessions = await loadSessions();

  if (childId !== undefined) {
    sessions = sessions.filter((s) => s.childId === childId);
  }
  if (weekStartISO !== undefined) {
    sessions = sessions.filter((s) => s.startAtISO >= weekStartISO);
  }
  if (weekEndISO !== undefined) {
    sessions = sessions.filter((s) => s.startAtISO <= weekEndISO);
  }

  sessions = [...sessions].sort((a, b) => (a.startAtISO < b.startAtISO ? 1 : a.startAtISO > b.startAtISO ? -1 : 0));

  return paginate(sessions, page, pageSize);
}

export async function getContentChecksPage(params: {
  page: number;
  pageSize: number;
  childId?: string;
  status?: ContentCheck["status"];
}): Promise<Page<ContentCheck>> {
  const { page, pageSize, childId, status } = params;

  let checks = await loadContentChecks();

  if (childId !== undefined) {
    checks = checks.filter((c) => c.childId === childId);
  }
  if (status !== undefined) {
    checks = checks.filter((c) => c.status === status);
  }

  checks = [...checks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return paginate(checks, page, pageSize);
}
