# 구현 로드맵(MVP) — IDE에 단계별로 던지기

## 0) 부트스트랩
- Prompts/01_repo_bootstrap_all_in_one.txt 실행 → 레포 생성

## 1) Studio 흐름 확인
- Draft/Preview/Apply/History/Rollback
- generator는 규칙 기반이라도 “오피스처럼 보이는 맵” 생성

## 2) Run 기본
- 25 에이전트 스폰 + 랜덤 이동 + 충돌 회피
- demo job 실행 + 로그 스트리밍 + 상태 전환

## 3) Export/Import
- Export ZIP → Import ZIP 재현 테스트
- 스냅샷 포함 검증

## 4) 안정화
- Validate(동선) 리포트
- 에러 메시지/로그 저장
