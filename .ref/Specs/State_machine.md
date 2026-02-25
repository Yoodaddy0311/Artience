# 상태머신(초안)

## AgentState
- IDLE / WALK / THINKING / RUNNING(옵션) / SUCCESS / ERROR / NEEDS_INPUT(옵션)

## JobState
- QUEUED → RUNNING → (SUCCESS|ERROR|CANCELED)

## 전환 규칙(MVP)
- Job 시작: 담당 에이전트 → RUNNING
- 로그 키워드:
  - think/plan → THINKING
  - run/exec/build/test → RUNNING
- Job 종료:
  - exitCode==0 → SUCCESS(짧게) → IDLE
  - else → ERROR(짧게) → IDLE
