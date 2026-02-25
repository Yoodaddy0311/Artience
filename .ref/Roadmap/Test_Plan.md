# 테스트 플랜(간단)

## Studio
- 파일 업로드(이미지/문서/zip) → 목록/미리보기/태그 정상
- Draft 생성 → Preview에서 방/벽/스폰 확인
- Apply → Version 1 생성
- Draft 수정 → Apply → Version 2 생성
- Rollback Version 1 → 복원 확인
- Export → ZIP 생성 확인
- Import → 동일 환경 재현 확인

## Run
- 25 에이전트 생성 확인
- 충돌 타일 있는 영역 회피 이동 확인
- demo recipe 실행 → stdout 로그 표시 확인
- Stop → 프로세스 종료 확인
- exitCode 비정상 시 ERROR 상태 전환 확인
