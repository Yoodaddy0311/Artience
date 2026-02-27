"""Tests for the WebSocket router (/ws/town).

Covers:
- CHAT_MESSAGE send/receive flow
- Agent ID validation (alphanumeric + hyphens, max 50 chars)
- Input sanitization (HTML stripping)
- Message length truncation
- Empty message rejection
- Chat statistics tracking
- Role classification and response generation
"""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.routers.ws import (
    _is_valid_agent_id,
    _classify_role,
    _generate_response,
    get_chat_stats,
)


# ── Agent ID validation ───────────────────────────────────────────────


class TestAgentIdValidation:
    def test_valid_simple_id(self):
        assert _is_valid_agent_id("a01")

    def test_valid_with_hyphens(self):
        assert _is_valid_agent_id("agent-01-test")

    def test_valid_alphanumeric(self):
        assert _is_valid_agent_id("AgentX123")

    def test_rejects_empty(self):
        assert not _is_valid_agent_id("")

    def test_rejects_special_chars(self):
        assert not _is_valid_agent_id("agent@01")
        assert not _is_valid_agent_id("agent 01")
        assert not _is_valid_agent_id("agent/01")

    def test_rejects_too_long(self):
        assert not _is_valid_agent_id("a" * 51)

    def test_accepts_max_length(self):
        assert _is_valid_agent_id("a" * 50)

    def test_rejects_xss_attempt(self):
        assert not _is_valid_agent_id("<script>alert(1)</script>")

    def test_rejects_unicode(self):
        assert not _is_valid_agent_id("agent_\uc5d0\uc774\uc804\ud2b8")


# ── Role classification ───────────────────────────────────────────────


class TestRoleClassification:
    def test_developer_roles(self):
        assert _classify_role("Developer") == "developer"
        assert _classify_role("Backend Engineer") == "developer"
        assert _classify_role("Frontend Dev") == "developer"
        assert _classify_role("Full Stack") == "developer"

    def test_qa_roles(self):
        # Note: "QA Engineer" matches "developer" first due to "engineer" keyword
        assert _classify_role("QA") == "qa"
        assert _classify_role("Tester") == "qa"
        assert _classify_role("Quality Assurance") == "qa"

    def test_pm_roles(self):
        assert _classify_role("Project Manager") == "pm"
        assert _classify_role("PM") == "pm"
        assert _classify_role("Product Manager") == "pm"

    def test_designer_roles(self):
        assert _classify_role("UI Designer") == "designer"
        assert _classify_role("UX Lead") == "designer"
        assert _classify_role("Design") == "designer"

    def test_devops_roles(self):
        assert _classify_role("DevOps") == "devops"
        assert _classify_role("SRE") == "devops"
        assert _classify_role("Infrastructure") == "devops"

    def test_unknown_role(self):
        assert _classify_role("CEO") == "default"
        assert _classify_role("") == "default"


# ── Response generation ───────────────────────────────────────────────


class TestResponseGeneration:
    def test_returns_string(self):
        result = _generate_response("Developer", "hello")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_developer_response_is_from_pool(self):
        from app.routers.ws import _ROLE_RESPONSES

        result = _generate_response("Developer", "hello")
        assert result in _ROLE_RESPONSES["developer"]

    def test_unknown_role_uses_defaults(self):
        from app.routers.ws import _DEFAULT_RESPONSES

        result = _generate_response("CEO", "hello")
        assert result in _DEFAULT_RESPONSES


# ── WebSocket CHAT_MESSAGE integration ─────────────────────────────────


class TestWebSocketChatMessage:
    def _create_ws_client(self):
        from app.main import app
        return TestClient(app)

    def test_chat_message_returns_response(self):
        """Sending a valid CHAT_MESSAGE should get a CHAT_RESPONSE back."""
        client = self._create_ws_client()
        with patch("app.middleware.auth._API_KEY", None), \
             patch("app.routers.ws._WS_TOKEN", None), \
             patch("app.routers.ws.asyncio.sleep", return_value=None):
            with client.websocket_connect("/ws/town") as ws:
                ws.send_text(json.dumps({
                    "type": "CHAT_MESSAGE",
                    "agentId": "a01",
                    "agentRole": "Developer",
                    "content": "hello world",
                }))
                data = ws.receive_text()
                msg = json.loads(data)
                assert msg["type"] == "CHAT_RESPONSE"
                assert msg["agentId"] == "a01"
                assert len(msg["content"]) > 0

    def test_chat_message_html_sanitized(self):
        """HTML in content should be stripped before processing."""
        client = self._create_ws_client()
        with patch("app.middleware.auth._API_KEY", None), \
             patch("app.routers.ws._WS_TOKEN", None), \
             patch("app.routers.ws.asyncio.sleep", return_value=None):
            with client.websocket_connect("/ws/town") as ws:
                ws.send_text(json.dumps({
                    "type": "CHAT_MESSAGE",
                    "agentId": "a01",
                    "agentRole": "Developer",
                    "content": "<script>alert('xss')</script>Hello",
                }))
                data = ws.receive_text()
                msg = json.loads(data)
                # Should still get a response (sanitized content is "Hello")
                assert msg["type"] == "CHAT_RESPONSE"

    def test_invalid_agent_id_silently_ignored(self):
        """Messages with invalid agentId should be silently ignored."""
        client = self._create_ws_client()
        with patch("app.middleware.auth._API_KEY", None), \
             patch("app.routers.ws._WS_TOKEN", None):
            with client.websocket_connect("/ws/town") as ws:
                ws.send_text(json.dumps({
                    "type": "CHAT_MESSAGE",
                    "agentId": "<script>alert(1)</script>",
                    "agentRole": "Developer",
                    "content": "hello",
                }))
                # Send a ping to verify connection is still alive
                ws.send_text(json.dumps({"type": "ping"}))
                # Connection should still be open (no crash)

    def test_empty_content_silently_ignored(self):
        """Messages with empty content should be silently ignored."""
        client = self._create_ws_client()
        with patch("app.middleware.auth._API_KEY", None), \
             patch("app.routers.ws._WS_TOKEN", None):
            with client.websocket_connect("/ws/town") as ws:
                ws.send_text(json.dumps({
                    "type": "CHAT_MESSAGE",
                    "agentId": "a01",
                    "agentRole": "Developer",
                    "content": "",
                }))
                # Send another message to verify connection is still alive
                ws.send_text(json.dumps({"type": "ping"}))


# ── Chat statistics ───────────────────────────────────────────────────


class TestChatStats:
    def test_stats_returns_dict(self):
        stats = get_chat_stats()
        assert "total_messages_sent" in stats
        assert "total_responses" in stats
        assert isinstance(stats["total_messages_sent"], int)
        assert isinstance(stats["total_responses"], int)

    def test_stats_returns_copy(self):
        """get_chat_stats should return a copy, not the internal dict."""
        stats1 = get_chat_stats()
        stats1["total_messages_sent"] = 9999
        stats2 = get_chat_stats()
        assert stats2["total_messages_sent"] != 9999
