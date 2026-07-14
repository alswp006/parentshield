# Changelog

## [0.1.0] - 2026-07-14

7/21 packets completed.

### Added
- feat: 전역 타입 단일 소스(types.ts) + RouteState 계약 (packet 0001)
- feat: localStorage 코어 래퍼(core/keys) 구현 (packet 0002)
- feat: 엔티티 repo(CRUD) + 캐스케이드 삭제 + 내보내기 + 로컬 페이지네이션 + 프리미엄 헬퍼 (packet 0003)
- feat: 전역 상태(AppDataProvider) + useAppData 훅 (packet 0004)
- feat: 외부 AI API 클라이언트(ai.ts) 구현 (packet 0005)
- feat: 공통 UI 컴포넌트(Scaffold/SubmitFooter/EmptyState/키보드 스크롤 훅) (packet 0007)
- feat: S1 홈(/) 대시보드 페이지 (packet 0008)

### Known Issues
- 콘텐츠 점검 submit 서비스(로컬 pending 생성→원격 호출→로컬 업데이트) (packet 0006) — failed
- S2 자녀 프로필 생성/수정(/profile) 페이지 (packet 0009) — failed
- S3 규칙 목록(/rules) 페이지 + 101개 이상 가상 스크롤 (packet 0010) — failed
- S6 콘텐츠 점검 입력(/content-check) 페이지(검증 + pending 생성) (packet 0013) — skipped
- S7 콘텐츠 점검 결과(/content-check/result) + 보상형 광고 게이트 (packet 0014) — skipped
- 외부 링크 이탈 차단 가드 + 정책 가드레일 스크립트 (packet 0018) — failed
- 라우팅 연결(App.tsx) + FloatingTabBar 흐름 + 외부 링크 차단 다이얼로그 연결 (packet 0019) — skipped
- 최종 UX 폴리시(App.tsx): AI 사전 고지 1회 + 라우트 단위 정리 (packet 0020) — skipped
- 라우팅 와이어링 + Provider 연결 + 통합 폴리시 (packet 0021) — skipped
