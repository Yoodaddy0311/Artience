# Artibot - AI Agent Teams Orchestration
# Version: 1.6.0
# Platform: Google Antigravity

## Orchestration Mode

Use the Agent Manager to spawn and orchestrate parallel agents.
Each agent works independently across workspaces with async execution.

### Available Agents

- **code-reviewer**: code review
- **security-reviewer**: security review
- **architect**: architecture
- **frontend-developer**: frontend
- **backend-developer**: backend
- **database-reviewer**: database
- **build-error-resolver**: build error
- **e2e-runner**: e2e test
- **tdd-guide**: tdd
- **planner**: plan
- **refactor-cleaner**: refactor
- **doc-updater**: documentation
- **content-marketer**: content
- **devops-engineer**: devops
- **llm-architect**: llm
- **mcp-developer**: mcp
- **performance-engineer**: performance
- **typescript-pro**: typescript
- **content-marketer**: email
- **content-marketer**: social media
- **data-analyst**: excel
- **data-analyst**: analytics
- **repo-benchmarker**: benchmark
- **marketing-strategist**: marketing strategy
- **data-analyst**: data analysis
- **presentation-designer**: presentation
- **seo-specialist**: seo
- **cro-specialist**: cro
- **ad-specialist**: advertising
- **ad-specialist**: ad
- **marketing-strategist**: crm
- **marketing-strategist**: mkt
- **presentation-designer**: ppt
- **content-marketer**: social
- **orchestrator**: swarm
- **orchestrator**: team

## Core Principles
- Evidence > assumptions | Code > documentation | Efficiency > verbosity
- Immutability: Always create new objects, never mutate
- Many small files > few large files (200-400 lines typical)
- Test-driven development with 80%+ coverage

## Delegation Strategy

For complex tasks requiring 3+ steps or multiple domains:
1. Spawn specialized agents via Agent Manager
2. Each agent works in its own workspace (parallel execution)
3. Agents produce Artifacts (diffs, test results, screenshots)
4. Review and merge Artifacts when agents complete
5. Use feedback on Artifacts to steer agent behavior
