# dokba-platform-mvp v2 — Studio 기반 CLI Town 플랫폼 킷
작성일: 2026-02-23

이 ZIP은 “비개발자/비디자이너가 AI + 첨부파일로 플랫폼(오피스/마을 + 에이전트 + 레시피)을 구축”하는 데스크탑 앱(Electron) MVP를 한 번에 만들기 위한 문서/스키마/IDE 프롬프트 모음입니다.

## 이 킷으로 무엇을 만드나
- **Studio 모드(제작)**: 파일(이미지/문서/zip) 첨부 + AI Builder 지시 → 월드/테마/에이전트/레시피를 “Draft → Preview → Apply(버전)”로 생성/적용
- **Run 모드(관제)**: 25 에이전트가 심즈처럼 이동하며 상태(THINKING/RUNNING/SUCCESS/ERROR)를 보여주고, CLI 작업을 실행/중지/로그 스트리밍

## 추천 개발 흐름(비개발자 기준)
1) `PRD/PRD_CLI_Town_Studio_v2.md` 읽고 목표/범위를 확정
2) `Schemas/project.example.json`을 “내가 원하는 오피스”에 맞게 살짝 수정 (선택)
3) `Prompts/01_repo_bootstrap_all_in_one.txt`를 Claude Code / Gemini CLI / Codex 중 하나에 그대로 붙여넣어 레포 생성
4) 생성된 레포에서 `npm install` → `npm run dev`
5) 추가 기능은 `Prompts/`의 단계별 프롬프트를 순서대로 IDE에 던져 확장

## 폴더 안내
- PRD/: 제품 요구사항(Studio 중심으로 재정의된 PRD)
- Prompts/: IDE(Claude Code/Gemini CLI/Codex)에 복붙할 실행 프롬프트(한 방/단계별)
- Schemas/: project.json 스키마/예시
- Specs/: IPC 이벤트 계약/상태머신/데이터 모델
- Examples/: 에셋팩 구조/가이드
- Roadmap/: 구현 순서(작업 쪼개기) / 테스트 플랜

## 빠른 체크(에셋)
- 캐릭터 PNG 1장만 있어도 MVP 가능하도록 “임시 스프라이트(Idle/Walk)”를 먼저 사용하세요.
- 이후 Veo3/이미지 생성으로 “진짜 워킹 사이클”을 교체하는 방향을 권장합니다.
