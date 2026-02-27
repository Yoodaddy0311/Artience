"""Keyword-based job matching engine.

Uses the 25 job definitions from job_definition.py (seeded into DB).
This module provides a fast, in-memory keyword index for prompt analysis
without requiring DB queries.
"""

# Job IDs match JobDefinition.id from app.models.job_definition
# Keyword mapping: lowercase keyword -> list of job definition IDs

_KEYWORD_MAP: dict[str, list[str]] = {
    # ── Management ──
    "프로젝트": ["PM"], "project": ["PM"], "일정": ["PM"], "schedule": ["PM"],
    "관리": ["PM"], "manage": ["PM"], "티켓": ["PM"], "ticket": ["PM"],
    "칸반": ["PM"], "kanban": ["PM"],

    "프로덕트": ["PO"], "product": ["PO"], "기획": ["PO"], "planning": ["PO"],
    "요구사항": ["PO"], "requirement": ["PO"], "스펙": ["PO"], "spec": ["PO"],
    "기능정의": ["PO"], "백로그": ["PO"], "backlog": ["PO"],

    "스크럼": ["SCRUM"], "scrum": ["SCRUM"], "애자일": ["SCRUM"], "agile": ["SCRUM"],
    "회고": ["SCRUM"], "retro": ["SCRUM"], "스탠드업": ["SCRUM"], "standup": ["SCRUM"],
    "데일리": ["SCRUM"], "daily": ["SCRUM"], "스프린트": ["SCRUM", "PM"], "sprint": ["SCRUM", "PM"],

    "아키텍처": ["CTO"], "architecture": ["CTO"], "기술전략": ["CTO"],
    "의사결정": ["CTO"], "cto": ["CTO"],

    # ── Frontend Engineering ──
    "프론트": ["FE_DEV"], "프론트엔드": ["FE_DEV"], "frontend": ["FE_DEV"],
    "ui": ["FE_DEV", "UI"], "컴포넌트": ["FE_DEV"], "component": ["FE_DEV"],
    "react": ["FE_DEV"], "vue": ["FE_DEV"], "css": ["FE_DEV", "UI_ENG"],
    "html": ["FE_DEV"], "스타일": ["FE_DEV", "UI_ENG"], "레이아웃": ["FE_DEV"],
    "layout": ["FE_DEV"], "페이지": ["FE_DEV"], "page": ["FE_DEV"],
    "화면": ["FE_DEV"], "뷰": ["FE_DEV"], "view": ["FE_DEV"],

    "프론트리드": ["FE_LEAD"], "프론트아키텍처": ["FE_LEAD"],

    "모바일": ["MOBILE"], "mobile": ["MOBILE"], "앱": ["MOBILE"], "app": ["MOBILE"],
    "ios": ["MOBILE"], "android": ["MOBILE"], "react native": ["MOBILE"],
    "flutter": ["MOBILE"], "swift": ["MOBILE"], "kotlin": ["MOBILE"],

    "디자인시스템": ["UI_ENG"], "design system": ["UI_ENG"],
    "토큰": ["UI_ENG"], "token": ["UI_ENG"],

    # ── Backend Engineering ──
    "백엔드": ["BE_DEV"], "backend": ["BE_DEV"], "서버": ["BE_DEV"], "server": ["BE_DEV"],
    "db": ["BE_DEV", "DATA_ENG"], "데이터베이스": ["BE_DEV"], "database": ["BE_DEV"],
    "sql": ["BE_DEV", "DATA_ENG"], "쿼리": ["BE_DEV"], "query": ["BE_DEV"],
    "crud": ["BE_DEV", "API_DEV"],

    "백엔드리드": ["BE_LEAD"], "백엔드아키텍처": ["BE_LEAD"],

    "api": ["API_DEV", "BE_DEV"], "rest": ["API_DEV"], "graphql": ["API_DEV"],
    "endpoint": ["API_DEV"], "라우터": ["API_DEV"], "router": ["API_DEV"],

    "데이터": ["DATA_ENG"], "data": ["DATA_ENG"], "etl": ["DATA_ENG"],
    "파이프라인": ["DATA_ENG"], "pipeline": ["DATA_ENG", "DEVOPS"],
    "웨어하우스": ["DATA_ENG"], "warehouse": ["DATA_ENG"],
    "스트리밍": ["DATA_ENG"], "streaming": ["DATA_ENG"], "kafka": ["DATA_ENG"],

    # ── Design ──
    "ux": ["UX"], "사용자경험": ["UX"], "유저리서치": ["UX"], "리서치": ["UX"],
    "research": ["UX"], "사용성": ["UX"], "usability": ["UX"],
    "인터뷰": ["UX"], "interview": ["UX"], "설문": ["UX"],

    "디자인": ["UI"], "design": ["UI"], "figma": ["UI"], "인터페이스": ["UI"],
    "interface": ["UI"], "목업": ["UI"], "mockup": ["UI"],
    "와이어프레임": ["UI"], "wireframe": ["UI"], "프로토타입": ["UI"],

    "브랜드": ["BRAND"], "brand": ["BRAND"], "로고": ["BRAND"], "logo": ["BRAND"],
    "아이덴티티": ["BRAND"], "identity": ["BRAND"],

    "애니메이션": ["MOTION"], "animation": ["MOTION"], "모션": ["MOTION"],
    "motion": ["MOTION"], "인터랙션": ["MOTION"], "interaction": ["MOTION"],
    "sprite": ["MOTION"],

    # ── QA & Testing ──
    "테스트": ["QA"], "test": ["QA"], "qa": ["QA"], "품질": ["QA"],
    "quality": ["QA"], "버그": ["QA"], "bug": ["QA"], "검증": ["QA"], "검수": ["QA"],

    "자동화": ["QA_AUTO"], "automation": ["QA_AUTO"], "playwright": ["QA_AUTO"],
    "jest": ["QA_AUTO"], "pytest": ["QA_AUTO"], "e2e": ["QA_AUTO"],
    "테스트자동화": ["QA_AUTO"],

    "성능": ["PERF"], "performance": ["PERF"], "최적화": ["PERF"],
    "optimize": ["PERF"], "벤치마크": ["PERF"], "benchmark": ["PERF"],
    "프로파일": ["PERF"], "profiling": ["PERF"],

    # ── DevOps & Infra ──
    "devops": ["DEVOPS"], "ci": ["DEVOPS"], "cd": ["DEVOPS"],
    "배포": ["DEVOPS"], "deploy": ["DEVOPS"], "docker": ["DEVOPS"],
    "컨테이너": ["DEVOPS"], "container": ["DEVOPS"],

    "sre": ["SRE"], "모니터링": ["SRE"], "monitoring": ["SRE"],
    "알림": ["SRE"], "alert": ["SRE"], "로그": ["SRE"], "log": ["SRE"],
    "가용성": ["SRE"], "availability": ["SRE"], "장애": ["SRE"], "incident": ["SRE"],

    "클라우드": ["INFRA"], "cloud": ["INFRA"], "aws": ["INFRA"],
    "gcp": ["INFRA"], "azure": ["INFRA"], "인프라": ["INFRA"], "infra": ["INFRA"],
    "kubernetes": ["INFRA", "DEVOPS"], "k8s": ["INFRA", "DEVOPS"],

    # ── Specialized ──
    "ai": ["AI_ENG"], "인공지능": ["AI_ENG"], "llm": ["AI_ENG"], "gpt": ["AI_ENG"],
    "프롬프트": ["AI_ENG"], "prompt": ["AI_ENG"], "머신러닝": ["AI_ENG"],
    "ml": ["AI_ENG"], "machine learning": ["AI_ENG"],
    "파인튜닝": ["AI_ENG"], "fine-tuning": ["AI_ENG"],
    "임베딩": ["AI_ENG"], "embedding": ["AI_ENG"], "rag": ["AI_ENG"],

    "보안": ["SEC"], "security": ["SEC"], "인증": ["SEC"], "auth": ["SEC"],
    "암호화": ["SEC"], "encryption": ["SEC"], "취약점": ["SEC"],
    "vulnerability": ["SEC"], "방화벽": ["SEC"], "firewall": ["SEC"],

    "문서": ["TECH_WRITER"], "document": ["TECH_WRITER"], "doc": ["TECH_WRITER"],
    "readme": ["TECH_WRITER"], "가이드": ["TECH_WRITER"], "guide": ["TECH_WRITER"],
    "매뉴얼": ["TECH_WRITER"], "manual": ["TECH_WRITER"],
    "api문서": ["TECH_WRITER"], "주석": ["TECH_WRITER"], "comment": ["TECH_WRITER"],
}

# Static name lookup (matches SEED_JOB_DEFINITIONS)
_JOB_NAMES: dict[str, dict[str, str]] = {
    "PM": {"name_ko": "프로젝트 매니저", "name_en": "Project Manager"},
    "PO": {"name_ko": "프로덕트 오너", "name_en": "Product Owner"},
    "SCRUM": {"name_ko": "스크럼 마스터", "name_en": "Scrum Master"},
    "CTO": {"name_ko": "CTO", "name_en": "CTO"},
    "FE_DEV": {"name_ko": "프론트엔드 개발자", "name_en": "Frontend Developer"},
    "FE_LEAD": {"name_ko": "프론트엔드 리드", "name_en": "Frontend Lead"},
    "MOBILE": {"name_ko": "모바일 개발자", "name_en": "Mobile Developer"},
    "UI_ENG": {"name_ko": "UI 엔지니어", "name_en": "UI Engineer"},
    "BE_DEV": {"name_ko": "백엔드 개발자", "name_en": "Backend Developer"},
    "BE_LEAD": {"name_ko": "백엔드 리드", "name_en": "Backend Lead"},
    "API_DEV": {"name_ko": "API 개발자", "name_en": "API Developer"},
    "DATA_ENG": {"name_ko": "데이터 엔지니어", "name_en": "Data Engineer"},
    "UX": {"name_ko": "UX 디자이너", "name_en": "UX Designer"},
    "UI": {"name_ko": "UI 디자이너", "name_en": "UI Designer"},
    "BRAND": {"name_ko": "브랜드 디자이너", "name_en": "Brand Designer"},
    "MOTION": {"name_ko": "모션 디자이너", "name_en": "Motion Designer"},
    "QA": {"name_ko": "QA 엔지니어", "name_en": "QA Engineer"},
    "QA_AUTO": {"name_ko": "QA 자동화", "name_en": "QA Automation"},
    "PERF": {"name_ko": "성능 엔지니어", "name_en": "Performance Engineer"},
    "DEVOPS": {"name_ko": "DevOps 엔지니어", "name_en": "DevOps Engineer"},
    "SRE": {"name_ko": "SRE", "name_en": "SRE"},
    "INFRA": {"name_ko": "인프라 엔지니어", "name_en": "Infra Engineer"},
    "AI_ENG": {"name_ko": "AI 엔지니어", "name_en": "AI Engineer"},
    "SEC": {"name_ko": "보안 엔지니어", "name_en": "Security Engineer"},
    "TECH_WRITER": {"name_ko": "테크니컬 라이터", "name_en": "Technical Writer"},
}

# All valid job IDs
ALL_JOB_IDS: list[str] = list(_JOB_NAMES.keys())


def get_job_name(job_id: str, lang: str = "ko") -> str:
    """Get display name for a job ID."""
    names = _JOB_NAMES.get(job_id, {})
    key = f"name_{lang}"
    return names.get(key, job_id)


def match_jobs_from_prompt(prompt: str) -> list[dict]:
    """Analyze a prompt string and return matching job definitions.

    Scoring: each keyword hit adds 1 point to that job.
    Returns jobs sorted by score (descending), with score attached.
    """
    lower_prompt = prompt.lower()
    scores: dict[str, int] = {}

    for keyword, job_ids in _KEYWORD_MAP.items():
        if keyword in lower_prompt:
            for jid in job_ids:
                scores[jid] = scores.get(jid, 0) + 1

    if not scores:
        return []

    results = []
    for jid, score in sorted(scores.items(), key=lambda x: -x[1]):
        names = _JOB_NAMES.get(jid, {})
        results.append({
            "id": jid,
            "name_ko": names.get("name_ko", jid),
            "name_en": names.get("name_en", jid),
            "score": score,
        })

    return results
