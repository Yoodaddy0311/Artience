import asyncio
import json
import logging
import os
import random
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.middleware.sanitize import sanitize_html
from app.models.room import Member

# Testable session factory for the room WS endpoint.
# Tests can patch ``_get_session_factory`` to return a test SessionLocal.
_session_factory = SessionLocal
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
    """Unified WebSocket connection manager.

    Tracks all connected clients (browser, CLI, MCP) with the same message
    protocol.  Client type is identified via the CLIENT_IDENTIFY handshake
    message and stored per-connection for logging/routing.
    """

    # Valid client_type values — matches shared-types ClientType
    _VALID_CLIENT_TYPES = {"cli", "mcp", "browser"}

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        # Per-connection metadata: ws -> {client_type, version, room}
        self._client_meta: Dict[int, Dict[str, str]] = {}
        # Room-scoped connections: room_id -> list of (user_id, websocket)
        self._room_connections: Dict[str, List[tuple]] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def identify_client(
        self, websocket: WebSocket, client_type: str, version: str, room: str
    ):
        """Store client identity after CLIENT_IDENTIFY handshake."""
        if client_type not in self._VALID_CLIENT_TYPES:
            client_type = "browser"
        self._client_meta[id(websocket)] = {
            "client_type": client_type,
            "version": version,
            "room": room,
        }

    def get_client_type(self, websocket: WebSocket) -> str:
        """Return the client_type for a connection (default 'browser')."""
        meta = self._client_meta.get(id(websocket))
        return meta["client_type"] if meta else "browser"

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self._client_meta.pop(id(websocket), None)

    async def broadcast(self, message: dict):
        """Broadcast to ALL connected clients (browser, CLI, MCP alike)."""
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

                # ── CLIENT_IDENTIFY: CLI/MCP/browser handshake ──
                # All client types send this on connect. The server
                # stores the client_type for logging/routing and
                # auto-joins the specified room if provided.
                if msg_type == "CLIENT_IDENTIFY":
                    client_type = payload.get("clientType", "browser")
                    version = payload.get("version", "?")
                    room = payload.get("room", "")
                    manager.identify_client(websocket, client_type, version, room)
                    # Auto-join the room so CLI/MCP clients receive
                    # room-scoped broadcasts without a separate WS_ROOM_JOIN.
                    if room:
                        manager.join_room(room, f"{client_type}:{id(websocket)}", websocket)
                    _logger.info(
                        "Client identified: type=%s version=%s room=%s",
                        client_type, version, room,
                    )
                    continue

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
                    safe_prompt = prompt.replace('"', '\\"')
                    full_cmd = f'claude -p "{safe_prompt}" --print'
                    _logger.info("Executing: %s", full_cmd)

                    env = os.environ.copy()
                    env.pop("CLAUDECODE", None)  # allow nested CLI execution
                    env["FORCE_COLOR"] = "0"

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


# ── Room-dedicated WebSocket endpoint (/ws/room/{room_id}) ──


def _utc_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _room_msg(event_type: str, payload: dict) -> dict:
    """Build a RoomWsMessage matching the shared-types RoomWsMessage interface."""
    return {
        "type": event_type,
        "payload": payload,
        "timestamp": _utc_iso(),
    }


@router.websocket("/room/{room_id}")
async def websocket_room_endpoint(
    websocket: WebSocket,
    room_id: str,
    user_id: str = Query(default=""),
    token: Optional[str] = Query(default=None),
):
    """Room-dedicated WebSocket endpoint.

    Frontend ``roomSocket.ts`` connects to ``/ws/room/{room_id}``.
    The server verifies room membership, then relays ``RoomWsMessage``
    events to all members in that room.
    """
    # ── Auth ──
    if not await _authenticate_ws(websocket, token):
        return

    # ── Validate user_id ──
    if not user_id:
        await websocket.close(code=4002, reason="user_id query parameter required")
        return

    # ── Verify room membership via DB ──
    db = _session_factory()
    try:
        member = (
            db.query(Member)
            .filter(Member.room_id == room_id, Member.user_id == user_id)
            .first()
        )
        if member is None:
            await websocket.close(code=4003, reason="Not a member of this room")
            return

        # Mark member online
        member.is_online = True
        db.commit()
        member_name = member.character_name
        member_role = member.character_role or ""
    finally:
        db.close()

    # ── Accept connection and register in room ──
    await manager.connect(websocket)
    manager.join_room(room_id, user_id, websocket)

    _logger.info("Room WS connected: user=%s room=%s", user_id, room_id)

    # Notify room members of new join
    online_users = manager.get_room_user_ids(room_id)
    await manager.broadcast_to_room(room_id, _room_msg(
        "ROOM_MEMBER_JOIN",
        {
            "userId": user_id,
            "characterName": member_name,
            "characterRole": member_role,
            "onlineUsers": online_users,
        },
    ))

    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                msg_type = payload.get("type", "")

                # Re-broadcast room events to all members
                if msg_type in (
                    "ROOM_TASK_CREATED",
                    "ROOM_TASK_ASSIGNED",
                    "ROOM_TASK_COMPLETED",
                    "ROOM_STATUS_UPDATE",
                ):
                    await manager.broadcast_to_room(
                        room_id,
                        _room_msg(msg_type, {
                            **payload.get("payload", {}),
                            "userId": user_id,
                        }),
                    )
                elif msg_type == "ROOM_CHAT":
                    content = sanitize_html(
                        str(payload.get("content", ""))
                    )[:_MAX_CHAT_MESSAGE_LENGTH]
                    if content:
                        await manager.broadcast_to_room(
                            room_id,
                            _room_msg("ROOM_STATUS_UPDATE", {
                                "userId": user_id,
                                "characterName": member_name,
                                "content": content,
                            }),
                        )
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        # ── Cleanup on disconnect ──
        manager.leave_room(room_id, user_id)
        manager.disconnect(websocket)

        # Mark member offline in DB
        db = _session_factory()
        try:
            member = (
                db.query(Member)
                .filter(Member.room_id == room_id, Member.user_id == user_id)
                .first()
            )
            if member:
                member.is_online = False
                db.commit()
        finally:
            db.close()

        # Notify remaining members
        online_users = manager.get_room_user_ids(room_id)
        await manager.broadcast_to_room(room_id, _room_msg(
            "ROOM_MEMBER_LEAVE",
            {
                "userId": user_id,
                "characterName": member_name,
                "onlineUsers": online_users,
            },
        ))

        _logger.info("Room WS disconnected: user=%s room=%s", user_id, room_id)
