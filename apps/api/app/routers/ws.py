import asyncio
import json
import logging
import os
import random
import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.middleware.sanitize import sanitize_html
from app.services.llm_service import LLMService

_logger = logging.getLogger(__name__)

# ── Singleton LLM service for agent chat ─────────────
_llm_service = LLMService()

router = APIRouter(prefix="/ws", tags=["websocket"])

# ── WebSocket token authentication ────────────────────
_WS_TOKEN: Optional[str] = os.getenv("DOKBA_WS_TOKEN")


async def _authenticate_ws(
    websocket: WebSocket,
    token: Optional[str],
) -> bool:
    """Validate WebSocket token on handshake.

    When ``DOKBA_WS_TOKEN`` is not set, authentication is skipped (dev mode).
    Returns ``True`` if the connection is allowed, ``False`` if it was
    rejected and closed with code 4001.
    """
    if not _WS_TOKEN:
        return True

    if not token or token != _WS_TOKEN:
        _logger.warning(
            "WebSocket connection rejected -- invalid or missing token"
        )
        await websocket.close(code=4001, reason="Unauthorized")
        return False

    return True


# ── Chat input validation ─────────────────────────────
_MAX_CHAT_MESSAGE_LENGTH = 2000
_AGENT_ID_RE = re.compile(r"^[a-zA-Z0-9\-]{1,50}$")


def _is_valid_agent_id(agent_id: str) -> bool:
    """Return True if *agent_id* is alphanumeric + hyphens, max 50 chars."""
    return bool(_AGENT_ID_RE.match(agent_id))


# ── Session-level statistics tracking ──────────────────
_chat_stats: Dict[str, int] = {
    "total_messages_sent": 0,
    "total_responses": 0,
}


def get_chat_stats() -> Dict[str, int]:
    """Return current chat statistics."""
    return {**_chat_stats}


# ── Agent name → agentId mapping ─────────────────────
_AGENT_ID_MAP: Dict[str, str] = {
    "sera": "a01",
    "luna": "a02",
    "rio": "a03",
    "ara": "a04",
    "max": "a05",
    "ivy": "a06",
    "kai": "a07",
    "nova": "a08",
    "zoe": "a09",
    "leo": "a10",
    "mia": "a11",
    "jin": "a12",
    "sol": "a13",
    "dan": "a14",
    "yuri": "a15",
    "hana": "a16",
    "teo": "a17",
    "lia": "a18",
    "ryu": "a19",
    "sora": "a20",
    "nico": "a21",
    "ella": "a22",
    "finn": "a23",
    "cleo": "a24",
    "ash": "a25",
}


def _get_agent_id(agent_name: str) -> str:
    """Resolve an agent name to its unique agentId."""
    return _AGENT_ID_MAP.get(agent_name.lower(), "a01")


# ── Role-based response templates ──────────────────────
_ROLE_RESPONSES: Dict[str, List[str]] = {
    "developer": [
        "코드 분석을 완료했습니다. 몇 가지 개선 사항을 제안드립니다.",
        "해당 기능은 현재 구현 가능합니다. 모듈 구조를 먼저 설계하겠습니다.",
        "코드 리뷰를 진행했습니다. 전반적으로 깔끔하지만, 리팩토링이 필요한 부분이 있습니다.",
        "빌드 파이프라인을 확인했습니다. 의존성 문제 없이 정상 작동 중입니다.",
        "해당 버그를 확인했습니다. 원인을 분석 중이며 곧 수정 패치를 준비하겠습니다.",
    ],
    "qa": [
        "테스트 시나리오를 작성했습니다. 총 15개의 테스트 케이스를 준비했습니다.",
        "회귀 테스트를 완료했습니다. 모든 기존 기능이 정상 동작합니다.",
        "버그 리포트를 검토했습니다. 재현 가능하며, 우선순위를 높여야 할 것 같습니다.",
        "E2E 테스트 결과가 나왔습니다. 95% 통과율을 기록했습니다.",
        "품질 지표를 분석했습니다. 코드 커버리지가 82%입니다.",
    ],
    "pm": [
        "프로젝트 진행 상황을 업데이트했습니다. 현재 Sprint 목표 달성률은 78%입니다.",
        "일정을 검토했습니다. 예상 마감일까지 충분한 여유가 있습니다.",
        "이해관계자 미팅을 정리했습니다. 주요 피드백을 공유드리겠습니다.",
        "리스크 분석을 완료했습니다. 현재 3가지 잠재적 이슈를 파악했습니다.",
        "요구사항을 분석했습니다. 우선순위를 재조정해야 할 항목이 있습니다.",
    ],
    "designer": [
        "디자인 시안을 준비했습니다. 모바일/데스크톱 모두 반응형으로 설계했습니다.",
        "UI 컴포넌트 라이브러리를 업데이트했습니다. 새로운 컬러 팔레트를 적용했습니다.",
        "사용자 플로우를 검토했습니다. UX 개선 포인트 5가지를 제안합니다.",
        "와이어프레임을 완성했습니다. 피드백 주시면 프로토타입으로 발전시키겠습니다.",
        "접근성 감사를 실시했습니다. WCAG 2.1 기준에 부합하도록 수정이 필요합니다.",
    ],
    "devops": [
        "배포 파이프라인을 확인했습니다. 현재 모든 환경이 정상 작동 중입니다.",
        "서버 모니터링 결과, CPU 사용률이 안정적입니다.",
        "CI/CD 빌드가 성공적으로 완료되었습니다. 모든 테스트를 통과했습니다.",
        "인프라 구성을 최적화했습니다. 응답 시간이 20% 개선되었습니다.",
        "컨테이너 이미지를 업데이트했습니다. 보안 패치가 적용되었습니다.",
    ],
}

_DEFAULT_RESPONSES = [
    "요청하신 내용을 확인했습니다. 분석 후 결과를 공유드리겠습니다.",
    "작업을 시작했습니다. 진행 상황을 계속 업데이트하겠습니다.",
    "확인했습니다. 해당 건에 대해 검토 후 답변드리겠습니다.",
    "네, 이해했습니다. 바로 처리하겠습니다.",
    "좋은 의견 감사합니다. 반영하여 진행하겠습니다.",
]


def _classify_role(role: str) -> str:
    """Map agent role string to a response category."""
    role_lower = role.lower()

    if any(k in role_lower for k in ["develop", "engineer", "frontend", "backend", "full"]):
        return "developer"
    if any(k in role_lower for k in ["qa", "test", "quality"]):
        return "qa"
    if any(k in role_lower for k in ["pm", "project", "manager", "product"]):
        return "pm"
    if any(k in role_lower for k in ["design", "ui", "ux"]):
        return "designer"
    if any(k in role_lower for k in ["devops", "infra", "ops", "deploy", "sre"]):
        return "devops"
    return "default"


def _generate_response(agent_role: str, user_message: str) -> str:
    """Generate a contextual MVP response based on agent role."""
    category = _classify_role(agent_role)
    pool = _ROLE_RESPONSES.get(category, _DEFAULT_RESPONSES)
    return random.choice(pool)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        # Room-scoped connections: room_id -> list of (user_id, websocket)
        self._room_connections: Dict[str, List[tuple]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                continue

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send a message to a specific connection only."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            pass

    # ── Room-scoped WebSocket management ──────────────

    def join_room(self, room_id: str, user_id: str, websocket: WebSocket):
        """Register a WebSocket connection to a room."""
        if room_id not in self._room_connections:
            self._room_connections[room_id] = []
        # Avoid duplicate entries for same user
        self._room_connections[room_id] = [
            (uid, ws) for uid, ws in self._room_connections[room_id] if uid != user_id
        ]
        self._room_connections[room_id].append((user_id, websocket))
        _logger.info("WS room join: user=%s room=%s", user_id, room_id)

    def leave_room(self, room_id: str, user_id: str):
        """Remove a user's WebSocket from a room."""
        if room_id in self._room_connections:
            self._room_connections[room_id] = [
                (uid, ws) for uid, ws in self._room_connections[room_id] if uid != user_id
            ]
            if not self._room_connections[room_id]:
                del self._room_connections[room_id]
        _logger.info("WS room leave: user=%s room=%s", user_id, room_id)

    def disconnect_from_all_rooms(self, websocket: WebSocket):
        """Remove a websocket from all rooms (on disconnect)."""
        for room_id in list(self._room_connections.keys()):
            self._room_connections[room_id] = [
                (uid, ws) for uid, ws in self._room_connections[room_id] if ws is not websocket
            ]
            if not self._room_connections[room_id]:
                del self._room_connections[room_id]

    async def broadcast_to_room(self, room_id: str, message: dict):
        """Broadcast a message to all connections in a specific room."""
        connections = self._room_connections.get(room_id, [])
        data = json.dumps(message)
        for _uid, ws in connections:
            try:
                await ws.send_text(data)
            except Exception:
                continue

    def get_room_user_ids(self, room_id: str) -> List[str]:
        """Return list of user_ids currently connected to a room."""
        return [uid for uid, _ws in self._room_connections.get(room_id, [])]


manager = ConnectionManager()


@router.websocket("/town")
async def websocket_town_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
):
    # Authenticate before accepting the connection.
    if not await _authenticate_ws(websocket, token):
        return

    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                msg_type = payload.get("type")

                # ── FE-5: Handle CHAT_MESSAGE for agent chat ──
                if msg_type == "CHAT_MESSAGE":
                    agent_id = payload.get("agentId", "")
                    agent_role = payload.get("agentRole", "")
                    content = payload.get("content", "")

                    # ── Input sanitization & validation ──
                    if not _is_valid_agent_id(agent_id):
                        continue  # silently ignore invalid agentId

                    content = sanitize_html(content)
                    content = content[:_MAX_CHAT_MESSAGE_LENGTH]

                    if not content:
                        continue  # silently ignore empty messages

                    _chat_stats["total_messages_sent"] += 1

                    # Try LLM first; fall back to rule-based response
                    agent_name = payload.get("agentName", agent_id)
                    llm_response = await _llm_service.chat(
                        agent_name=agent_name,
                        agent_role=agent_role,
                        user_message=content,
                    )

                    if llm_response:
                        response_text = llm_response
                    else:
                        # Fallback: simulate "thinking" + rule-based response
                        delay = random.uniform(0.8, 2.0)
                        await asyncio.sleep(delay)
                        response_text = _generate_response(agent_role, content)

                    _chat_stats["total_responses"] += 1

                    # Send response back to the sender only
                    await manager.send_personal(websocket, {
                        "type": "CHAT_RESPONSE",
                        "agentId": agent_id,
                        "content": response_text,
                    })

                # ── Room join/leave via WebSocket ──
                elif msg_type == "WS_ROOM_JOIN":
                    room_id = payload.get("roomId", "")
                    user_id = payload.get("userId", "")
                    character_name = payload.get("characterName", "")
                    if room_id and user_id:
                        manager.join_room(room_id, user_id, websocket)
                        await manager.broadcast_to_room(room_id, {
                            "type": "ROOM_MEMBER_JOINED",
                            "roomId": room_id,
                            "userId": user_id,
                            "characterName": character_name,
                            "onlineUsers": manager.get_room_user_ids(room_id),
                        })

                elif msg_type == "WS_ROOM_LEAVE":
                    room_id = payload.get("roomId", "")
                    user_id = payload.get("userId", "")
                    if room_id and user_id:
                        manager.leave_room(room_id, user_id)
                        await manager.broadcast_to_room(room_id, {
                            "type": "ROOM_MEMBER_LEFT",
                            "roomId": room_id,
                            "userId": user_id,
                            "onlineUsers": manager.get_room_user_ids(room_id),
                        })

                # ── Existing: Handle CHAT_COMMAND for claude CLI ──
                elif msg_type == "CHAT_COMMAND":
                    agent = payload.get("target_agent", "Sera")
                    prompt = payload.get("text", "")

                    _chat_stats["total_messages_sent"] += 1

                    # 1. Send initial THINKING state
                    agent_id_resolved = _get_agent_id(agent)
                    await manager.broadcast({
                        "type": "AGENT_STATE_CHANGE",
                        "agentId": agent_id_resolved,
                        "state": "THINKING"
                    })

                    # 2. Spawn actual claude CLI process
                    full_cmd = f'npx @anthropic-ai/claude-code -p "{prompt}" --print'
                    _logger.info("Executing: %s", full_cmd)

                    env = os.environ.copy()
                    env["FORCE_COLOR"] = "1"

                    async def run_claude():
                        try:
                            proc = await asyncio.create_subprocess_shell(
                                full_cmd,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.STDOUT,
                                env=env
                            )

                            stdout, _ = await proc.communicate()

                            if stdout:
                                text = stdout.decode('utf-8', errors='replace').strip()
                                _logger.debug("Claude OUT: %s", text)

                                # Send the full output as a single chunk
                                await manager.broadcast({
                                    "type": "TASK_ASSIGNED",
                                    "agent": agent,
                                    "taskContent": text
                                })

                                _chat_stats["total_responses"] += 1

                            # Return agent to IDLE after process finishes
                            state = "SUCCESS" if proc.returncode == 0 else "ERROR"
                            await manager.broadcast({
                                "type": "AGENT_STATE_CHANGE",
                                "agentId": agent_id_resolved,
                                "state": state
                            })
                            await asyncio.sleep(2)
                            await manager.broadcast({
                                "type": "AGENT_STATE_CHANGE",
                                "agentId": agent_id_resolved,
                                "state": "IDLE"
                            })
                            _logger.info(
                                "Finished run_claude. Exit code: %d",
                                proc.returncode,
                            )
                        except Exception as e:
                            _logger.error("Error executing claude: %s", e)
                            await manager.broadcast({
                                "type": "AGENT_STATE_CHANGE",
                                "agentId": agent_id_resolved,
                                "state": "ERROR"
                            })

                    asyncio.create_task(run_claude())

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        manager.disconnect_from_all_rooms(websocket)
        manager.disconnect(websocket)
