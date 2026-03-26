import Store from 'electron-store';
import type {
    JobDefinition,
    JobRun,
    StepRun,
    JobStoreSchema,
    MasteryProgress,
    JobProgress,
    JobGlobalSettings,
    JobStep,
    StepGate,
} from '../src/types/job-system';
import {
    resolvePromptTemplate,
    evaluateCondition,
    validateInputs,
    getProgress,
    calculateMasteryBonus,
    groupStepsByOrder,
    createJobRun,
    canRunJob,
    getDifficultyPriority,
    validateWorkflow,
} from '../src/types/job-system';

const MAX_HISTORY = 200;

// ── Builtin Job Presets ──

function createBuiltinJobs(): JobDefinition[] {
    const now = Date.now();
    return [
        {
            id: 'job-code-gen',
            name: '코드 생성',
            description:
                '기능 설명을 입력하면 계획→구현→테스트→리뷰→수정을 자동으로 실행합니다.',
            icon: '💻',
            category: 'development',
            inputs: [
                {
                    key: 'description',
                    label: '기능 설명',
                    type: 'textarea',
                    required: true,
                    placeholder: '구현할 기능을 설명해주세요',
                },
                {
                    key: 'targetDir',
                    label: '대상 디렉토리',
                    type: 'directory',
                    required: true,
                },
                {
                    key: 'language',
                    label: '언어',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'typescript', label: 'TypeScript' },
                        { value: 'python', label: 'Python' },
                        { value: 'go', label: 'Go' },
                        { value: 'rust', label: 'Rust' },
                    ],
                },
                {
                    key: 'includeTests',
                    label: '테스트 포함',
                    type: 'boolean',
                    defaultValue: 'true',
                    required: false,
                },
            ],
            workflow: {
                steps: [
                    {
                        id: 'plan',
                        name: '기능 분석 및 계획',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '다음 기능을 구현하기 위한 상세 계획을 수립해줘.\n\n기능 설명: {{input.description}}\n대상 디렉토리: {{input.targetDir}}\n언어: {{input.language}}\n\n다음을 포함해서 계획을 작성해:\n1. 파일 구조\n2. 핵심 함수/클래스 목록\n3. 의존성\n4. 에지 케이스',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 'implement',
                        name: '코드 구현',
                        skillId: 'code-review',
                        agentId: 'rio',
                        promptTemplate:
                            '다음 계획에 따라 코드를 구현해줘.\n\n계획:\n{{step.plan.output.result}}\n\n대상 디렉토리: {{input.targetDir}}\n언어: {{input.language}}\n\n기존 코드 스타일을 따르고, 타입 안전하게 작성해.',
                        inputMapping: [
                            {
                                targetKey: 'plan',
                                source: 'step_output',
                                sourceRef: 'plan.result',
                            },
                        ],
                        executionOrder: 2,
                    },
                    {
                        id: 'test',
                        name: '테스트 작성 및 실행',
                        skillId: 'run-tests',
                        agentId: 'ara',
                        promptTemplate:
                            '구현된 코드에 대한 테스트를 작성하고 실행해줘.\n\n구현 내용:\n{{step.implement.output.result}}\n\n대상 디렉토리: {{input.targetDir}}\n\n단위 테스트와 엣지 케이스를 포함해.',
                        inputMapping: [
                            {
                                targetKey: 'code',
                                source: 'step_output',
                                sourceRef: 'implement.result',
                            },
                        ],
                        condition: {
                            stepId: '__input__',
                            type: 'output_contains',
                            value: 'includeTests:true',
                        },
                        executionOrder: 3,
                    },
                    {
                        id: 'review',
                        name: '코드 리뷰',
                        skillId: 'code-review',
                        agentId: 'podo',
                        promptTemplate:
                            '다음 구현을 리뷰해줘. 버그, 보안, 성능, 코드 품질을 점검해.\n\n{{step.implement.output.result}}',
                        inputMapping: [
                            {
                                targetKey: 'code',
                                source: 'step_output',
                                sourceRef: 'implement.result',
                            },
                        ],
                        gate: {
                            type: 'auto_check',
                            reviewerAgentId: 'podo',
                            onFail: 'retry_step',
                            failMessage: '코드 리뷰에서 문제가 발견되었습니다.',
                        },
                        executionOrder: 4,
                    },
                    {
                        id: 'refine',
                        name: '리뷰 피드백 반영',
                        skillId: '',
                        agentId: 'rio',
                        promptTemplate:
                            '코드 리뷰 피드백을 반영해줘.\n\n리뷰 결과:\n{{step.review.output.result}}\n\n원본 코드 위치: {{input.targetDir}}',
                        inputMapping: [
                            {
                                targetKey: 'feedback',
                                source: 'step_output',
                                sourceRef: 'review.result',
                            },
                        ],
                        executionOrder: 5,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 5,
                    timeoutMs: 600_000,
                    errorStrategy: 'ask_user',
                    maxRetries: 2,
                    permissionMode: 'acceptEdits',
                },
            },
            outputs: [
                {
                    key: 'code',
                    label: '생성된 코드',
                    type: 'directory',
                    fromStepId: 'refine',
                    outputKey: 'result',
                },
            ],
            metadata: {
                difficulty: 'C',
                requiredLevel: 10,
                estimatedTimeSeconds: 300,
                creditCost: 50,
                baseExpReward: 150,
                tags: ['개발', 'code', 'generation'],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 10,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 5,
                    expBonusPerLevel: 3,
                },
            },
            sourcePackId: 'dev',
            createdAt: now,
            updatedAt: now,
            builtin: true,
        },
        {
            id: 'job-report',
            name: '리포트 작성',
            description:
                '프로젝트 데이터를 수집·분석하여 리포트를 자동 생성합니다.',
            icon: '📊',
            category: 'report',
            inputs: [
                {
                    key: 'topic',
                    label: '리포트 주제',
                    type: 'text',
                    required: true,
                    placeholder: '예: Q1 프로젝트 진행 현황',
                },
                {
                    key: 'scope',
                    label: '분석 범위',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'full', label: '전체 프로젝트' },
                        { value: 'directory', label: '특정 디렉토리' },
                        { value: 'git_diff', label: 'Git 변경분' },
                    ],
                },
                {
                    key: 'targetDir',
                    label: '대상 디렉토리',
                    type: 'directory',
                    required: false,
                },
                {
                    key: 'format',
                    label: '출력 형식',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'md', label: 'Markdown' },
                        { value: 'html', label: 'HTML' },
                    ],
                },
            ],
            workflow: {
                steps: [
                    {
                        id: 'gather',
                        name: '데이터 수집',
                        skillId: '',
                        agentId: 'alex',
                        promptTemplate:
                            '프로젝트 분석을 위한 데이터를 수집해줘.\n\n주제: {{input.topic}}\n범위: {{input.scope}}\n디렉토리: {{input.targetDir}}\n\n수집할 항목:\n- 파일 구조 및 코드 통계\n- git log (최근 30일)\n- 주요 의존성 목록\n- TODO/FIXME 항목',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 'analyze',
                        name: '데이터 분석',
                        skillId: '',
                        agentId: 'alex',
                        promptTemplate:
                            '수집된 데이터를 분석해서 핵심 인사이트를 도출해줘.\n\n수집 데이터:\n{{step.gather.output.result}}\n\n분석 관점:\n- 코드 품질 트렌드\n- 핫스팟 (변경 빈도 높은 파일)\n- 기술 부채 추정\n- 팀 생산성 지표',
                        inputMapping: [
                            {
                                targetKey: 'data',
                                source: 'step_output',
                                sourceRef: 'gather.result',
                            },
                        ],
                        executionOrder: 2,
                    },
                    {
                        id: 'write',
                        name: '리포트 작성',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '분석 결과를 기반으로 리포트를 작성해줘.\n\n주제: {{input.topic}}\n형식: {{input.format}}\n\n분석 결과:\n{{step.analyze.output.result}}\n\n포함할 섹션:\n1. 요약\n2. 주요 발견사항\n3. 데이터 시각화 (Mermaid)\n4. 권장 사항\n5. 부록',
                        inputMapping: [
                            {
                                targetKey: 'analysis',
                                source: 'step_output',
                                sourceRef: 'analyze.result',
                            },
                        ],
                        executionOrder: 3,
                    },
                    {
                        id: 'review',
                        name: '최종 검토',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '리포트를 최종 검토해줘.\n\n{{step.write.output.result}}\n\n확인 항목:\n- 내용 정확성\n- 문법/맞춤법\n- 구조 완결성',
                        inputMapping: [
                            {
                                targetKey: 'report',
                                source: 'step_output',
                                sourceRef: 'write.result',
                            },
                        ],
                        gate: {
                            type: 'user_approval',
                            onFail: 'ask_user',
                            failMessage: '리포트를 확인해주세요.',
                        },
                        executionOrder: 4,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 3,
                    timeoutMs: 600_000,
                    errorStrategy: 'ask_user',
                    maxRetries: 1,
                    permissionMode: 'plan',
                },
            },
            outputs: [
                {
                    key: 'report',
                    label: '생성된 리포트',
                    type: 'report',
                    fromStepId: 'write',
                    outputKey: 'result',
                },
            ],
            metadata: {
                difficulty: 'D',
                requiredLevel: 5,
                estimatedTimeSeconds: 180,
                creditCost: 30,
                baseExpReward: 80,
                tags: ['리포트', 'report', '문서', '분석'],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 8,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 4,
                    expBonusPerLevel: 2,
                },
            },
            sourcePackId: 'report',
            createdAt: now,
            updatedAt: now,
            builtin: true,
        },
        {
            id: 'job-novel',
            name: '소설 집필',
            description:
                '장르와 줄거리를 입력하면 세계관→아웃라인→초고→교정→최종 원고를 생성합니다.',
            icon: '📝',
            category: 'creative',
            inputs: [
                {
                    key: 'genre',
                    label: '장르',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'fantasy', label: '판타지' },
                        { value: 'sf', label: 'SF' },
                        { value: 'romance', label: '로맨스' },
                        { value: 'mystery', label: '미스터리' },
                        { value: 'horror', label: '호러' },
                        { value: 'free', label: '자유' },
                    ],
                },
                {
                    key: 'premise',
                    label: '줄거리 개요',
                    type: 'textarea',
                    required: true,
                    placeholder: '작품의 전제와 핵심 줄거리를 설명해주세요',
                },
                {
                    key: 'chapters',
                    label: '챕터 수',
                    type: 'number',
                    defaultValue: '5',
                    required: false,
                },
                {
                    key: 'tone',
                    label: '분위기',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'light', label: '경쾌' },
                        { value: 'serious', label: '진지' },
                        { value: 'humor', label: '유머' },
                        { value: 'dark', label: '어두운' },
                    ],
                },
                {
                    key: 'outputDir',
                    label: '원고 저장 위치',
                    type: 'directory',
                    required: true,
                },
            ],
            workflow: {
                steps: [
                    {
                        id: 'worldbuild',
                        name: '세계관 구축',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '다음 작품의 세계관, 캐릭터 프로필, 설정 문서를 작성해줘.\n\n장르: {{input.genre}}\n줄거리: {{input.premise}}\n분위기: {{input.tone}}',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 'outline',
                        name: '플롯 아웃라인',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '세계관을 기반으로 {{input.chapters}}개 챕터의 플롯 아웃라인을 작성해줘.\n\n세계관:\n{{step.worldbuild.output.result}}\n\n줄거리: {{input.premise}}',
                        inputMapping: [
                            {
                                targetKey: 'world',
                                source: 'step_output',
                                sourceRef: 'worldbuild.result',
                            },
                        ],
                        executionOrder: 2,
                    },
                    {
                        id: 'draft',
                        name: '초고 집필',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '아웃라인에 따라 초고를 집필해줘.\n\n아웃라인:\n{{step.outline.output.result}}\n\n분위기: {{input.tone}}\n저장 위치: {{input.outputDir}}',
                        inputMapping: [
                            {
                                targetKey: 'outline',
                                source: 'step_output',
                                sourceRef: 'outline.result',
                            },
                        ],
                        executionOrder: 3,
                    },
                    {
                        id: 'edit',
                        name: '교정 및 편집',
                        skillId: '',
                        agentId: 'hana',
                        promptTemplate:
                            '초고의 문체를 교정하고 일관성을 검토해줘.\n\n초고:\n{{step.draft.output.result}}\n\n확인 항목:\n- 문체 일관성\n- 페이싱\n- 캐릭터 음성 일관성',
                        inputMapping: [
                            {
                                targetKey: 'draft',
                                source: 'step_output',
                                sourceRef: 'draft.result',
                            },
                        ],
                        executionOrder: 4,
                    },
                    {
                        id: 'finalize',
                        name: '최종 정리',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '교정된 원고를 최종 정리하고 목차를 생성해줘.\n\n교정 원고:\n{{step.edit.output.result}}\n\n저장 위치: {{input.outputDir}}',
                        inputMapping: [
                            {
                                targetKey: 'edited',
                                source: 'step_output',
                                sourceRef: 'edit.result',
                            },
                        ],
                        executionOrder: 5,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 3,
                    timeoutMs: 900_000,
                    errorStrategy: 'ask_user',
                    maxRetries: 1,
                    permissionMode: 'acceptEdits',
                },
            },
            outputs: [
                {
                    key: 'manuscript',
                    label: '최종 원고',
                    type: 'directory',
                    pathTemplate: '{{input.outputDir}}',
                    fromStepId: 'finalize',
                    outputKey: 'result',
                },
            ],
            metadata: {
                difficulty: 'C',
                requiredLevel: 10,
                estimatedTimeSeconds: 600,
                creditCost: 60,
                baseExpReward: 200,
                tags: ['소설', 'novel', '창작', 'writing'],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 10,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 3,
                    expBonusPerLevel: 5,
                },
            },
            sourcePackId: 'novel',
            createdAt: now,
            updatedAt: now,
            builtin: true,
        },
        {
            id: 'job-video',
            name: '영상 기획',
            description:
                '영상 주제를 입력하면 리서치→대본→스토리보드→리뷰→썸네일 컨셉을 생성합니다.',
            icon: '🎬',
            category: 'video',
            inputs: [
                {
                    key: 'videoType',
                    label: '영상 유형',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'youtube', label: '유튜브' },
                        { value: 'shorts', label: '쇼츠' },
                        { value: 'review', label: '리뷰' },
                        { value: 'tutorial', label: '튜토리얼' },
                    ],
                },
                {
                    key: 'topic',
                    label: '영상 주제',
                    type: 'textarea',
                    required: true,
                    placeholder: '영상 주제를 설명해주세요',
                },
                {
                    key: 'duration',
                    label: '영상 길이',
                    type: 'select',
                    required: true,
                    options: [
                        { value: '1min', label: '1분' },
                        { value: '5min', label: '5분' },
                        { value: '10min', label: '10분' },
                        { value: '20min', label: '20분+' },
                    ],
                },
                {
                    key: 'style',
                    label: '스타일',
                    type: 'text',
                    required: false,
                    placeholder: '영상 스타일/톤 설명',
                },
            ],
            workflow: {
                steps: [
                    {
                        id: 'research',
                        name: '주제 리서치',
                        skillId: '',
                        agentId: 'alex',
                        promptTemplate:
                            '다음 영상의 주제를 리서치해줘.\n\n유형: {{input.videoType}}\n주제: {{input.topic}}\n길이: {{input.duration}}\n\n경쟁 콘텐츠 분석과 차별화 포인트를 찾아줘.',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 'script',
                        name: '대본 작성',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '리서치 결과를 기반으로 대본을 작성해줘.\n\n리서치:\n{{step.research.output.result}}\n\n길이: {{input.duration}}\n스타일: {{input.style}}',
                        inputMapping: [
                            {
                                targetKey: 'research',
                                source: 'step_output',
                                sourceRef: 'research.result',
                            },
                        ],
                        executionOrder: 2,
                    },
                    {
                        id: 'storyboard',
                        name: '스토리보드',
                        skillId: '',
                        agentId: 'hana',
                        promptTemplate:
                            '대본을 기반으로 씬별 스토리보드와 비주얼 노트를 작성해줘.\n\n대본:\n{{step.script.output.result}}',
                        inputMapping: [
                            {
                                targetKey: 'script',
                                source: 'step_output',
                                sourceRef: 'script.result',
                            },
                        ],
                        executionOrder: 3,
                    },
                    {
                        id: 'review-script',
                        name: '대본 리뷰',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '대본과 스토리보드를 리뷰해줘.\n\n대본:\n{{step.script.output.result}}\n\n스토리보드:\n{{step.storyboard.output.result}}',
                        inputMapping: [
                            {
                                targetKey: 'script',
                                source: 'step_output',
                                sourceRef: 'script.result',
                            },
                            {
                                targetKey: 'board',
                                source: 'step_output',
                                sourceRef: 'storyboard.result',
                            },
                        ],
                        gate: {
                            type: 'user_approval',
                            onFail: 'ask_user',
                            failMessage: '대본을 확인해주세요.',
                        },
                        executionOrder: 4,
                    },
                    {
                        id: 'thumbnail',
                        name: '썸네일 컨셉',
                        skillId: '',
                        agentId: 'luna',
                        promptTemplate:
                            '영상의 썸네일 컨셉과 제목/태그를 최적화해줘.\n\n주제: {{input.topic}}\n유형: {{input.videoType}}\n대본 요약:\n{{step.script.output.result}}',
                        inputMapping: [
                            {
                                targetKey: 'script',
                                source: 'step_output',
                                sourceRef: 'script.result',
                            },
                        ],
                        executionOrder: 5,
                    },
                    {
                        id: 'checklist',
                        name: '제작 체크리스트',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '영상 제작을 위한 체크리스트와 타임라인을 산출해줘.\n\n대본: {{step.script.output.result}}\n스토리보드: {{step.storyboard.output.result}}\n썸네일: {{step.thumbnail.output.result}}',
                        inputMapping: [
                            {
                                targetKey: 'all',
                                source: 'step_output',
                                sourceRef: 'script.result',
                            },
                        ],
                        executionOrder: 6,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 3,
                    timeoutMs: 600_000,
                    errorStrategy: 'ask_user',
                    maxRetries: 1,
                    permissionMode: 'plan',
                },
            },
            outputs: [
                {
                    key: 'package',
                    label: '영상 기획 패키지',
                    type: 'text',
                    fromStepId: 'checklist',
                    outputKey: 'result',
                },
            ],
            metadata: {
                difficulty: 'C',
                requiredLevel: 10,
                estimatedTimeSeconds: 360,
                creditCost: 40,
                baseExpReward: 120,
                tags: ['영상', 'video', '유튜브', '기획'],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 8,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 4,
                    expBonusPerLevel: 3,
                },
            },
            sourcePackId: 'video',
            createdAt: now,
            updatedAt: now,
            builtin: true,
        },
        {
            id: 'job-web-research',
            name: '웹 리서치',
            description:
                '주제를 입력하면 웹 검색→정보 추출→종합 분석→문서화를 자동 수행합니다.',
            icon: '🔍',
            category: 'research',
            inputs: [
                {
                    key: 'query',
                    label: '조사 주제',
                    type: 'textarea',
                    required: true,
                    placeholder: '조사할 주제나 질문을 입력해주세요',
                },
                {
                    key: 'depth',
                    label: '조사 깊이',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'overview', label: '개요 (5분)' },
                        { value: 'standard', label: '표준 (15분)' },
                        { value: 'deep', label: '심층 (30분)' },
                    ],
                },
                {
                    key: 'sources',
                    label: '목표 소스 수',
                    type: 'number',
                    defaultValue: '10',
                    required: false,
                },
                {
                    key: 'outputFormat',
                    label: '출력 형식',
                    type: 'select',
                    required: true,
                    options: [
                        { value: 'summary', label: '요약 리포트' },
                        { value: 'table', label: '비교 테이블' },
                        { value: 'mindmap', label: '마인드맵' },
                    ],
                },
            ],
            workflow: {
                steps: [
                    {
                        id: 'search',
                        name: '웹 검색',
                        skillId: '',
                        agentId: 'alex',
                        promptTemplate:
                            '다음 주제에 대해 웹 검색을 수행해줘.\n\n주제: {{input.query}}\n깊이: {{input.depth}}\n목표 소스 수: {{input.sources}}\n\n신뢰할 수 있는 소스를 찾아줘.',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 'extract',
                        name: '정보 추출',
                        skillId: '',
                        agentId: 'jelly',
                        promptTemplate:
                            '검색 결과에서 핵심 정보를 추출하고 팩트체크해줘.\n\n검색 결과:\n{{step.search.output.result}}\n\n각 소스별 핵심 내용을 정리해줘.',
                        inputMapping: [
                            {
                                targetKey: 'search',
                                source: 'step_output',
                                sourceRef: 'search.result',
                            },
                        ],
                        executionOrder: 2,
                    },
                    {
                        id: 'synthesize',
                        name: '종합 분석',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '수집 정보를 종합하여 인사이트를 도출해줘.\n\n추출 정보:\n{{step.extract.output.result}}\n\n주제: {{input.query}}',
                        inputMapping: [
                            {
                                targetKey: 'data',
                                source: 'step_output',
                                sourceRef: 'extract.result',
                            },
                        ],
                        executionOrder: 3,
                    },
                    {
                        id: 'format',
                        name: '최종 문서화',
                        skillId: '',
                        agentId: 'alex',
                        promptTemplate:
                            '분석 결과를 {{input.outputFormat}} 형식으로 최종 문서화해줘.\n\n분석 결과:\n{{step.synthesize.output.result}}\n\n출력 형식: {{input.outputFormat}}',
                        inputMapping: [
                            {
                                targetKey: 'analysis',
                                source: 'step_output',
                                sourceRef: 'synthesize.result',
                            },
                        ],
                        executionOrder: 4,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 3,
                    timeoutMs: 600_000,
                    errorStrategy: 'skip',
                    maxRetries: 2,
                    permissionMode: 'plan',
                },
            },
            outputs: [
                {
                    key: 'research',
                    label: '리서치 결과',
                    type: 'report',
                    fromStepId: 'format',
                    outputKey: 'result',
                },
            ],
            metadata: {
                difficulty: 'D',
                requiredLevel: 5,
                estimatedTimeSeconds: 240,
                creditCost: 25,
                baseExpReward: 100,
                tags: ['리서치', 'research', '조사', '웹'],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 8,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 5,
                    expBonusPerLevel: 2,
                },
            },
            sourcePackId: 'web_research',
            createdAt: now,
            updatedAt: now,
            builtin: true,
        },
        {
            id: 'job-roleplay',
            name: '역할극 시뮬레이션',
            description:
                '시나리오와 역할을 설정하면 에이전트들이 토론/시뮬레이션을 수행합니다.',
            icon: '🎭',
            category: 'roleplay',
            inputs: [
                {
                    key: 'scenario',
                    label: '시나리오',
                    type: 'textarea',
                    required: true,
                    placeholder: '시뮬레이션할 시나리오를 설명해주세요',
                },
                {
                    key: 'roles',
                    label: '역할 배분',
                    type: 'textarea',
                    required: true,
                    placeholder: '에이전트명: 역할 (줄바꿈으로 구분)',
                },
                {
                    key: 'rounds',
                    label: '라운드 수',
                    type: 'number',
                    defaultValue: '3',
                    required: false,
                },
                {
                    key: 'objective',
                    label: '토론 목표',
                    type: 'text',
                    required: false,
                    placeholder: '결론 도출 조건',
                },
            ],
            workflow: {
                steps: [
                    {
                        id: 'setup',
                        name: '시나리오 설정',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '다음 시나리오를 해석하고 에이전트별 역할 브리핑을 작성해줘.\n\n시나리오: {{input.scenario}}\n역할 배분: {{input.roles}}\n라운드 수: {{input.rounds}}\n목표: {{input.objective}}',
                        inputMapping: [],
                        executionOrder: 1,
                    },
                    {
                        id: 'simulate',
                        name: '시뮬레이션 실행',
                        skillId: '',
                        agentId: 'sera',
                        promptTemplate:
                            '설정에 따라 {{input.rounds}} 라운드의 토론을 시뮬레이션해줘.\n\n설정:\n{{step.setup.output.result}}\n\n각 라운드별로 참여자의 발언을 기록해줘.',
                        inputMapping: [
                            {
                                targetKey: 'setup',
                                source: 'step_output',
                                sourceRef: 'setup.result',
                            },
                        ],
                        executionOrder: 2,
                    },
                    {
                        id: 'analyze',
                        name: '결과 분석',
                        skillId: '',
                        agentId: 'namu',
                        promptTemplate:
                            '토론 결과를 분석하고 합의점/쟁점을 정리해줘.\n\n토론 기록:\n{{step.simulate.output.result}}\n\n목표: {{input.objective}}',
                        inputMapping: [
                            {
                                targetKey: 'discussion',
                                source: 'step_output',
                                sourceRef: 'simulate.result',
                            },
                        ],
                        executionOrder: 3,
                    },
                    {
                        id: 'report',
                        name: '보고서 작성',
                        skillId: '',
                        agentId: 'bomi',
                        promptTemplate:
                            '분석 결과를 기반으로 최종 보고서를 작성해줘.\n\n분석:\n{{step.analyze.output.result}}\n\n라운드별 요약과 결론을 포함해줘.',
                        inputMapping: [
                            {
                                targetKey: 'analysis',
                                source: 'step_output',
                                sourceRef: 'analyze.result',
                            },
                        ],
                        executionOrder: 4,
                    },
                ],
                settings: {
                    maxConcurrentAgents: 5,
                    timeoutMs: 900_000,
                    errorStrategy: 'ask_user',
                    maxRetries: 1,
                    permissionMode: 'plan',
                },
            },
            outputs: [
                {
                    key: 'report',
                    label: '시뮬레이션 보고서',
                    type: 'report',
                    fromStepId: 'report',
                    outputKey: 'result',
                },
            ],
            metadata: {
                difficulty: 'B',
                requiredLevel: 20,
                estimatedTimeSeconds: 480,
                creditCost: 70,
                baseExpReward: 180,
                tags: ['역할극', 'roleplay', '시뮬레이션', '토론'],
                prerequisiteJobIds: [],
                mastery: {
                    maxLevel: 6,
                    completionsPerLevel: 3,
                    speedBonusPerLevel: 3,
                    expBonusPerLevel: 4,
                },
            },
            sourcePackId: 'roleplay',
            createdAt: now,
            updatedAt: now,
            builtin: true,
        },
    ];
}

// ── JobRunner Class ──

class JobRunner {
    private store: Store<JobStoreSchema> | null = null;
    private activeRuns = new Map<string, JobRun>();

    private ensureInit(): void {
        if (this.store) return;
        this.store = new Store<JobStoreSchema>({
            name: 'dokba-job-system',
            defaults: {
                version: 1,
                definitions: {},
                history: [],
                mastery: {},
                settings: {
                    maxConcurrentJobs: 3,
                    defaultTimeoutMs: 600_000,
                    autoSaveArtifacts: true,
                },
            },
        });

        // Seed builtin jobs if not present
        const defs = this.store.get('definitions');
        const builtins = createBuiltinJobs();
        let changed = false;
        for (const job of builtins) {
            if (!defs[job.id]) {
                defs[job.id] = job;
                changed = true;
            }
        }
        if (changed) {
            this.store.set('definitions', defs);
        }
    }

    private getStore(): Store<JobStoreSchema> {
        this.ensureInit();
        if (!this.store)
            throw new Error('JobRunner store failed to initialize');
        return this.store;
    }

    // ── Job Definition CRUD ──

    getDefinition(jobId: string): JobDefinition | null {
        return this.getStore().get('definitions')[jobId] ?? null;
    }

    getAllDefinitions(): Record<string, JobDefinition> {
        return this.getStore().get('definitions');
    }

    getDefinitionsByCategory(category: string): JobDefinition[] {
        return Object.values(this.getAllDefinitions()).filter(
            (d) => d.category === category,
        );
    }

    saveDefinition(job: JobDefinition): void {
        const store = this.getStore();
        const defs = store.get('definitions');
        defs[job.id] = { ...job, updatedAt: Date.now() };
        store.set('definitions', defs);
    }

    deleteDefinition(jobId: string): boolean {
        const store = this.getStore();
        const defs = store.get('definitions');
        const job = defs[jobId];
        if (!job || job.builtin) return false;
        delete defs[jobId];
        store.set('definitions', defs);
        return true;
    }

    // ── Job Execution ──

    /**
     * Start a job run. Validates inputs and creates a JobRun.
     * Actual PTY dispatch is handled by the caller (main.ts IPC layer).
     * This method manages state transitions and returns the run for dispatch.
     */
    startRun(
        jobId: string,
        inputValues: Record<string, unknown>,
    ): { run: JobRun; error?: string } {
        const jobDef = this.getDefinition(jobId);
        if (!jobDef)
            return {
                run: null as unknown as JobRun,
                error: `Job "${jobId}" not found`,
            };

        // Validate inputs
        const validationErrors = validateInputs(jobDef.inputs, inputValues);
        if (validationErrors.length > 0) {
            return {
                run: null as unknown as JobRun,
                error: validationErrors.join('; '),
            };
        }

        // Validate workflow
        const workflowErrors = validateWorkflow(jobDef.workflow);
        if (workflowErrors.length > 0) {
            return {
                run: null as unknown as JobRun,
                error: workflowErrors.join('; '),
            };
        }

        const run = createJobRun(jobDef, inputValues);
        run.status = 'running';
        this.activeRuns.set(run.runId, run);

        return { run };
    }

    /**
     * Resolve prompt for a specific step using current run state.
     */
    resolveStepPrompt(
        run: JobRun,
        step: JobStep,
        context: { jobName: string; agentName: string; cwd: string },
    ): string {
        const stepOutputs: Record<string, Record<string, string>> = {};
        for (const sr of run.stepRuns) {
            stepOutputs[sr.stepId] = sr.output;
        }

        return resolvePromptTemplate(
            step.promptTemplate,
            run.inputValues,
            stepOutputs,
            context,
        );
    }

    /**
     * Check if a step should execute based on its condition.
     */
    shouldExecuteStep(run: JobRun, step: JobStep): boolean {
        if (!step.condition) return true;
        return evaluateCondition(step.condition, run.stepRuns, run.inputValues);
    }

    /**
     * Get ordered step groups for execution.
     */
    getStepGroups(jobId: string): JobStep[][] {
        const jobDef = this.getDefinition(jobId);
        if (!jobDef) return [];
        return groupStepsByOrder(jobDef.workflow.steps);
    }

    /**
     * Mark a step as started.
     */
    markStepStarted(
        runId: string,
        stepId: string,
        agentId: string,
        resolvedPrompt: string,
    ): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        const stepRun = run.stepRuns.find((s) => s.stepId === stepId);
        if (!stepRun) return;

        stepRun.status = 'running';
        stepRun.agentId = agentId;
        stepRun.resolvedPrompt = resolvedPrompt;
        stepRun.startedAt = Date.now();

        if (!run.executedByAgents.includes(agentId)) {
            run.executedByAgents.push(agentId);
        }
    }

    /**
     * Mark a step as completed with output.
     */
    markStepCompleted(
        runId: string,
        stepId: string,
        output: Record<string, string>,
    ): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        const stepRun = run.stepRuns.find((s) => s.stepId === stepId);
        if (!stepRun) return;

        stepRun.status = 'completed';
        stepRun.output = output;
        stepRun.completedAt = Date.now();
        stepRun.gatePassed = true;
    }

    /**
     * Mark a step as failed.
     */
    markStepFailed(runId: string, stepId: string, error: string): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        const stepRun = run.stepRuns.find((s) => s.stepId === stepId);
        if (!stepRun) return;

        stepRun.status = 'failed';
        stepRun.error = error;
        stepRun.completedAt = Date.now();
    }

    /**
     * Mark a step as skipped (condition not met).
     */
    markStepSkipped(runId: string, stepId: string): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        const stepRun = run.stepRuns.find((s) => s.stepId === stepId);
        if (!stepRun) return;

        stepRun.status = 'skipped';
        stepRun.completedAt = Date.now();
    }

    /**
     * Increment retry count for a step.
     */
    incrementRetry(runId: string, stepId: string): number {
        const run = this.activeRuns.get(runId);
        if (!run) return 0;

        const stepRun = run.stepRuns.find((s) => s.stepId === stepId);
        if (!stepRun) return 0;

        stepRun.retryCount++;
        stepRun.status = 'pending';
        return stepRun.retryCount;
    }

    /**
     * Set step to gate_waiting status.
     */
    markStepGateWaiting(runId: string, stepId: string): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        const stepRun = run.stepRuns.find((s) => s.stepId === stepId);
        if (!stepRun) return;

        stepRun.status = 'gate_waiting';
        run.status = 'gate_waiting';
    }

    /**
     * Evaluate a gate for a step. Returns true if passed.
     * For regex_match and exit_code gates, evaluation is done here.
     * For auto_check and user_approval, the caller handles dispatch.
     */
    evaluateGate(
        gate: StepGate,
        stepOutput: Record<string, string>,
    ): boolean | 'needs_dispatch' {
        switch (gate.type) {
            case 'regex_match': {
                if (!gate.pattern) return true;
                try {
                    const regex = new RegExp(gate.pattern);
                    const text = Object.values(stepOutput).join(' ');
                    return regex.test(text);
                } catch {
                    return true;
                }
            }
            case 'file_exists':
                // File existence check must be done by caller in main process
                return 'needs_dispatch';
            case 'exit_code':
                // Check for common success indicators in output
                return Object.values(stepOutput).some((v) =>
                    /passed|success|exit code 0/i.test(v),
                );
            case 'auto_check':
            case 'user_approval':
                return 'needs_dispatch';
            default:
                return true;
        }
    }

    // ── Run Lifecycle ──

    /**
     * Complete a job run with success.
     */
    completeRun(runId: string): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        run.status = 'completed';
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - run.startedAt;

        // Calculate EXP with mastery bonus
        const jobDef = this.getDefinition(run.jobId);
        if (jobDef) {
            const masteryLevel = this.getMasteryLevel(
                run.jobId,
                run.executedByAgents[0] ?? '',
            );
            const bonus = calculateMasteryBonus(
                jobDef.metadata.mastery,
                masteryLevel,
            );
            run.expEarned = Math.round(
                jobDef.metadata.baseExpReward * bonus.expMultiplier,
            );

            // Update mastery progress
            for (const agentId of run.executedByAgents) {
                this.incrementMastery(run.jobId, agentId);
            }
        }

        this.persistRunToHistory(run);
        this.activeRuns.delete(runId);
    }

    /**
     * Fail a job run.
     */
    failRun(runId: string, error: string): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        run.status = 'failed';
        run.error = error;
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - run.startedAt;

        this.persistRunToHistory(run);
        this.activeRuns.delete(runId);
    }

    /**
     * Cancel a job run.
     */
    cancelRun(runId: string): void {
        const run = this.activeRuns.get(runId);
        if (!run) return;

        run.status = 'cancelled';
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - run.startedAt;

        this.persistRunToHistory(run);
        this.activeRuns.delete(runId);
    }

    /**
     * Pause a running job.
     */
    pauseRun(runId: string): void {
        const run = this.activeRuns.get(runId);
        if (!run || run.status !== 'running') return;
        run.status = 'paused';
    }

    /**
     * Resume a paused job.
     */
    resumeRun(runId: string): void {
        const run = this.activeRuns.get(runId);
        if (!run || run.status !== 'paused') return;
        run.status = 'running';
    }

    // ── Queries ──

    getActiveRun(runId: string): JobRun | null {
        return this.activeRuns.get(runId) ?? null;
    }

    getAllActiveRuns(): JobRun[] {
        return [...this.activeRuns.values()];
    }

    getRunProgress(runId: string): JobProgress | null {
        const run = this.activeRuns.get(runId);
        if (!run) return null;
        const jobDef = this.getDefinition(run.jobId);
        if (!jobDef) return null;
        return getProgress(run, jobDef);
    }

    getHistory(limit = 50): JobRun[] {
        const history = this.getStore().get('history');
        return history.slice(-limit);
    }

    // ── Mastery ──

    getMasteryLevel(jobId: string, agentId: string): number {
        const mastery = this.getStore().get('mastery');
        return mastery[jobId]?.[agentId]?.level ?? 0;
    }

    getMasteryProgress(jobId: string, agentId: string): MasteryProgress {
        const mastery = this.getStore().get('mastery');
        return (
            mastery[jobId]?.[agentId] ?? {
                jobId,
                agentId,
                level: 0,
                completions: 0,
            }
        );
    }

    private incrementMastery(jobId: string, agentId: string): void {
        const store = this.getStore();
        const mastery = store.get('mastery');
        const jobDef = this.getDefinition(jobId);
        if (!jobDef) return;

        if (!mastery[jobId]) mastery[jobId] = {};
        const progress = mastery[jobId][agentId] ?? {
            jobId,
            agentId,
            level: 0,
            completions: 0,
        };

        progress.completions++;
        const config = jobDef.metadata.mastery;
        if (
            progress.level < config.maxLevel &&
            progress.completions >=
                config.completionsPerLevel * (progress.level + 1)
        ) {
            progress.level++;
        }

        mastery[jobId][agentId] = progress;
        store.set('mastery', mastery);
    }

    // ── Settings ──

    getSettings(): JobGlobalSettings {
        return this.getStore().get('settings');
    }

    updateSettings(settings: Partial<JobGlobalSettings>): void {
        const store = this.getStore();
        const current = store.get('settings');
        store.set('settings', { ...current, ...settings });
    }

    // ── Check prerequisites ──

    checkCanRun(
        jobId: string,
        characterLevel: number,
    ): { canRun: boolean; reason?: string } {
        const jobDef = this.getDefinition(jobId);
        if (!jobDef)
            return { canRun: false, reason: `Job "${jobId}" not found` };

        const completedJobIds = this.getHistory(1000)
            .filter((r) => r.status === 'completed')
            .map((r) => r.jobId);

        return canRunJob(jobDef, characterLevel, [...new Set(completedJobIds)]);
    }

    // ── Internal ──

    private persistRunToHistory(run: JobRun): void {
        const store = this.getStore();
        const history = store.get('history');
        history.push(run);
        if (history.length > MAX_HISTORY) {
            store.set('history', history.slice(-MAX_HISTORY));
        } else {
            store.set('history', history);
        }
    }
}

export const jobRunner = new JobRunner();
