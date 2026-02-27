from sqlalchemy import Column, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class JobDefinition(Base):
    __tablename__ = "job_definitions"

    id = Column(String, primary_key=True, index=True)  # e.g. PM, FE_DEV, BE_DEV
    name = Column(String, nullable=False)
    description = Column(String, default="")
    icon = Column(String, default="")  # emoji or icon key
    category = Column(String, default="general")  # management, engineering, design, qa, ops
    required_level = Column(Integer, default=1)


# ── 25 Job Definitions seed data ─────────────────────
# Maps to the 25 agent slots (a01-a25) in ws.py _AGENT_ID_MAP
SEED_JOB_DEFINITIONS = [
    # Management (4)
    {"id": "PM", "name": "Project Manager", "description": "프로젝트 관리 및 일정 조율", "icon": "clipboard", "category": "management", "required_level": 1},
    {"id": "PO", "name": "Product Owner", "description": "제품 비전 및 백로그 관리", "icon": "target", "category": "management", "required_level": 3},
    {"id": "SCRUM", "name": "Scrum Master", "description": "애자일 프로세스 운영", "icon": "refresh", "category": "management", "required_level": 2},
    {"id": "CTO", "name": "CTO", "description": "기술 전략 및 아키텍처 의사결정", "icon": "crown", "category": "management", "required_level": 5},
    # Frontend Engineering (4)
    {"id": "FE_DEV", "name": "Frontend Developer", "description": "UI 컴포넌트 개발", "icon": "layout", "category": "engineering", "required_level": 1},
    {"id": "FE_LEAD", "name": "Frontend Lead", "description": "프론트엔드 아키텍처 설계", "icon": "monitor", "category": "engineering", "required_level": 3},
    {"id": "MOBILE", "name": "Mobile Developer", "description": "모바일 앱 개발", "icon": "smartphone", "category": "engineering", "required_level": 2},
    {"id": "UI_ENG", "name": "UI Engineer", "description": "디자인 시스템 구현", "icon": "palette", "category": "engineering", "required_level": 2},
    # Backend Engineering (4)
    {"id": "BE_DEV", "name": "Backend Developer", "description": "서버 로직 및 API 개발", "icon": "server", "category": "engineering", "required_level": 1},
    {"id": "BE_LEAD", "name": "Backend Lead", "description": "백엔드 아키텍처 설계", "icon": "database", "category": "engineering", "required_level": 3},
    {"id": "API_DEV", "name": "API Developer", "description": "REST/GraphQL API 설계", "icon": "link", "category": "engineering", "required_level": 2},
    {"id": "DATA_ENG", "name": "Data Engineer", "description": "데이터 파이프라인 구축", "icon": "bar-chart", "category": "engineering", "required_level": 2},
    # Design (4)
    {"id": "UX", "name": "UX Designer", "description": "사용자 경험 설계 및 리서치", "icon": "users", "category": "design", "required_level": 1},
    {"id": "UI", "name": "UI Designer", "description": "시각 디자인 및 프로토타이핑", "icon": "figma", "category": "design", "required_level": 1},
    {"id": "BRAND", "name": "Brand Designer", "description": "브랜드 아이덴티티 디자인", "icon": "star", "category": "design", "required_level": 2},
    {"id": "MOTION", "name": "Motion Designer", "description": "애니메이션 및 인터랙션 디자인", "icon": "play", "category": "design", "required_level": 3},
    # QA & Testing (3)
    {"id": "QA", "name": "QA Engineer", "description": "품질 보증 및 테스트 전략", "icon": "check-circle", "category": "qa", "required_level": 1},
    {"id": "QA_AUTO", "name": "QA Automation", "description": "테스트 자동화 구축", "icon": "zap", "category": "qa", "required_level": 2},
    {"id": "PERF", "name": "Performance Engineer", "description": "성능 테스트 및 최적화", "icon": "activity", "category": "qa", "required_level": 3},
    # DevOps & Infra (3)
    {"id": "DEVOPS", "name": "DevOps Engineer", "description": "CI/CD 및 배포 자동화", "icon": "git-branch", "category": "ops", "required_level": 1},
    {"id": "SRE", "name": "SRE", "description": "시스템 신뢰성 및 모니터링", "icon": "shield", "category": "ops", "required_level": 3},
    {"id": "INFRA", "name": "Infra Engineer", "description": "클라우드 인프라 관리", "icon": "cloud", "category": "ops", "required_level": 2},
    # Specialized (3)
    {"id": "AI_ENG", "name": "AI Engineer", "description": "머신러닝 모델 개발 및 배포", "icon": "cpu", "category": "engineering", "required_level": 3},
    {"id": "SEC", "name": "Security Engineer", "description": "보안 감사 및 취약점 분석", "icon": "lock", "category": "ops", "required_level": 3},
    {"id": "TECH_WRITER", "name": "Technical Writer", "description": "기술 문서 작성 및 관리", "icon": "file-text", "category": "general", "required_level": 1},
]
