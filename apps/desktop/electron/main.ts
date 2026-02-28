import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as pty from 'node-pty';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow;

// ── Terminal process store ──
const terminals = new Map<string, pty.IPty>();
let terminalIdCounter = 0;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 720,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// ── Terminal IPC handlers ──

ipcMain.handle('terminal:create', (_event, cols: number, rows: number) => {
    const id = `term-${++terminalIdCounter}`;
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    const proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.HOME || process.env.USERPROFILE || '.',
        env: process.env as Record<string, string>,
    });

    terminals.set(id, proc);

    proc.onData((data: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', id, data);
        }
    });

    proc.onExit(({ exitCode }: { exitCode: number }) => {
        terminals.delete(id);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:exit', id, exitCode);
        }
    });

    return id;
});

ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    terminals.get(id)?.write(data);
});

ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    terminals.get(id)?.resize(cols, rows);
});

ipcMain.on('terminal:destroy', (_event, id: string) => {
    const proc = terminals.get(id);
    if (proc) {
        proc.kill();
        terminals.delete(id);
    }
});

// ── Character Chat IPC ──

const AGENT_PERSONAS: Record<string, { role: string; personality: string }> = {
    'sera': { role: 'PM / 총괄', personality: '리더십 있고 전체 프로젝트를 조율하는 PM. 팀원들을 챙기고 일정을 관리해' },
    'rio': { role: '백엔드 개발', personality: '서버와 API에 진심인 백엔드 개발자. 성능과 안정성을 중시해' },
    'luna': { role: '프론트엔드 개발', personality: 'UI/UX에 민감하고 컴포넌트 설계를 좋아하는 프론트 개발자' },
    'alex': { role: '데이터 분석', personality: '데이터에서 인사이트를 찾아내는 분석가. 숫자와 패턴에 강해' },
    'ara': { role: 'QA 테스트', personality: '꼼꼼하게 버그를 잡아내는 테스터. 품질에 타협 없어' },
    'miso': { role: 'DevOps', personality: '배포와 인프라를 책임지는 DevOps. 자동화를 사랑해' },
    'hana': { role: 'UX 디자인', personality: '사용자 경험에 집착하는 디자이너. 직관적인 인터페이스를 만들어' },
    'duri': { role: '보안 감사', personality: '보안 취약점을 찾아내는 감사관. 안전이 최우선이야' },
    'bomi': { role: '기술 문서화', personality: '깔끔한 문서를 쓰는 테크니컬 라이터. 복잡한 걸 쉽게 설명해' },
    'toto': { role: 'DB 관리', personality: '데이터베이스 최적화에 열정적인 DBA. 쿼리 성능에 진심이야' },
    'nari': { role: 'API 설계', personality: 'RESTful API 설계의 달인. 깔끔한 인터페이스를 만들어' },
    'ruru': { role: '인프라 관리', personality: '서버와 네트워크를 관리하는 인프라 엔지니어' },
    'somi': { role: '성능 최적화', personality: '밀리초 단위로 성능을 개선하는 최적화 전문가' },
    'choco': { role: 'CI/CD', personality: '파이프라인 구축의 달인. 빌드와 배포를 자동화해' },
    'maru': { role: '모니터링', personality: '시스템 상태를 실시간으로 감시하는 모니터링 전문가' },
    'podo': { role: '코드 리뷰', personality: '코드 품질에 엄격한 리뷰어. 클린 코드를 추구해' },
    'jelly': { role: '로그 분석', personality: '로그에서 문제의 원인을 찾아내는 분석가' },
    'namu': { role: '아키텍처', personality: '시스템 아키텍처를 설계하는 설계자. 확장성과 유지보수성을 중시해' },
    'gomi': { role: '빌드 관리', personality: '빌드 시스템을 관리하고 최적화하는 전문가' },
    'ppuri': { role: '배포 자동화', personality: '무중단 배포를 구현하는 자동화 전문가' },
    'dari': { role: '이슈 트래킹', personality: '이슈를 체계적으로 관리하고 추적하는 전문가' },
    'kongbi': { role: '의존성 관리', personality: '패키지와 의존성을 깔끔하게 관리하는 전문가' },
    'baduk': { role: '마이그레이션', personality: '데이터와 시스템 마이그레이션을 안전하게 수행해' },
    'tangi': { role: '캐싱 전략', personality: '캐싱으로 성능을 극대화하는 전략가' },
    'moong': { role: '에러 핸들링', personality: '에러를 우아하게 처리하는 전문가. 장애 대응에 강해' },
};

function buildSystemPrompt(agentName: string): string {
    const key = agentName.toLowerCase();
    const persona = AGENT_PERSONAS[key];
    if (!persona) {
        return `너는 ${agentName}이야. 한국어로 대화하고, 친근한 반말체를 사용해.`;
    }
    return `너는 ${agentName}이야. ${persona.role} 담당이고, ${persona.personality}. 한국어로 대화하고, 친근한 반말체를 사용해. 질문에 너의 전문 분야 관점에서 답변해줘. 답변은 간결하게 해줘.`;
}

ipcMain.handle('chat:send', async (_event, agentName: string, userMessage: string) => {
    const systemPrompt = buildSystemPrompt(agentName);

    try {
        const env = { ...process.env };
        delete env.CLAUDECODE;
        env.FORCE_COLOR = '0';

        const { stdout } = await execFileAsync('claude', [
            '-p', userMessage,
            '--system-prompt', systemPrompt,
            '--output-format', 'text',
        ], {
            env,
            timeout: 60000,
            maxBuffer: 1024 * 1024,
        });

        return { success: true, text: stdout.trim() };
    } catch (error: any) {
        return { success: false, text: error.message || 'Claude CLI 실행 실패' };
    }
});

// ── App lifecycle ──

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    for (const [, proc] of terminals) {
        proc.kill();
    }
    terminals.clear();
});
