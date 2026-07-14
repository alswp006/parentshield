// Domain types — add your app-specific types here

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
