"""Tests for NanoBanana engine — Google Gemini Imagen API integration."""

import os
from unittest.mock import MagicMock, patch

import pytest

from app.services.nano_banana import (
    NanoBananaEngine,
    _extract_image_bytes,
    _get_client,
    _mock_object_url,
    _mock_sprite_url,
    _upload_to_gcs,
)


# ── Helpers ─────────────────────────────────────────────────


FAKE_KEY = "fake" + "-" + "key" + "-" + "for" + "-" + "testing"


def _make_image_response(image_bytes: bytes = b"\x89PNG_FAKE", mime_type: str = "image/png"):
    """Build a mock Gemini response containing an image part."""
    part = MagicMock()
    part.inline_data = MagicMock()
    part.inline_data.mime_type = mime_type
    part.inline_data.data = image_bytes

    candidate = MagicMock()
    candidate.content.parts = [part]

    response = MagicMock()
    response.candidates = [candidate]
    return response


def _make_text_response(text: str = "I cannot generate that image."):
    """Build a mock Gemini response with text only (no image)."""
    part = MagicMock()
    part.inline_data = None
    part.text = text

    candidate = MagicMock()
    candidate.content.parts = [part]

    response = MagicMock()
    response.candidates = [candidate]
    return response


def _make_empty_response():
    """Build a mock Gemini response with no candidates."""
    response = MagicMock()
    response.candidates = []
    return response


# ── _get_client ─────────────────────────────────────────────


class TestGetClient:
    def test_returns_none_when_no_api_key(self):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": ""}, clear=False):
            client = _get_client()
            assert client is None

    @patch("app.services.nano_banana.genai.Client")
    def test_returns_client_when_api_key_set(self, mock_client_cls):
        with patch.dict(os.environ, {"GOOGLE_API_KEY": FAKE_KEY}, clear=False):
            client = _get_client()
            mock_client_cls.assert_called_once_with(api_key=FAKE_KEY)
            assert client is not None


# ── _extract_image_bytes ────────────────────────────────────


class TestExtractImageBytes:
    def test_extracts_image_from_valid_response(self):
        resp = _make_image_response(b"\x89PNG_DATA")
        result = _extract_image_bytes(resp)
        assert result == b"\x89PNG_DATA"

    def test_returns_none_for_text_only_response(self):
        resp = _make_text_response()
        result = _extract_image_bytes(resp)
        assert result is None

    def test_returns_none_for_empty_candidates(self):
        resp = _make_empty_response()
        result = _extract_image_bytes(resp)
        assert result is None

    def test_returns_none_for_none_response(self):
        assert _extract_image_bytes(None) is None

    def test_skips_non_image_mime_types(self):
        part = MagicMock()
        part.inline_data = MagicMock()
        part.inline_data.mime_type = "application/json"
        part.inline_data.data = b"{}"

        candidate = MagicMock()
        candidate.content.parts = [part]
        response = MagicMock()
        response.candidates = [candidate]

        assert _extract_image_bytes(response) is None


# ── Mock URL helpers ────────────────────────────────────────


class TestMockUrls:
    def test_mock_sprite_url_contains_prompt(self):
        url = _mock_sprite_url("a cute otter")
        assert "sprite_" in url
        assert "a_cute_otter" in url
        assert url.startswith("https://")

    def test_mock_object_url_contains_name(self):
        url = _mock_object_url("coffee cup")
        assert "obj_" in url
        assert "coffee_cup" in url
        assert url.startswith("https://")

    def test_mock_sprite_url_truncates_long_prompt(self):
        long_prompt = "a" * 100
        url = _mock_sprite_url(long_prompt)
        # slug should be capped at 40 chars
        assert len(url) < 200


# ── _upload_to_gcs ──────────────────────────────────────────


class TestUploadToGcs:
    @patch("app.services.nano_banana.get_gcs_service")
    def test_uploads_when_gcs_available(self, mock_get_gcs):
        mock_svc = MagicMock()
        mock_svc.is_available = True
        mock_svc.upload_bytes.return_value = "https://storage.googleapis.com/artitown-assets/sprites/abc.png"
        mock_get_gcs.return_value = mock_svc

        url = _upload_to_gcs(b"IMAGEDATA", "sprites/abc.png")
        assert url == "https://storage.googleapis.com/artitown-assets/sprites/abc.png"
        mock_svc.upload_bytes.assert_called_once_with(b"IMAGEDATA", "sprites/abc.png", content_type="image/png")

    @patch("app.services.nano_banana.get_gcs_service")
    def test_returns_none_when_gcs_unavailable(self, mock_get_gcs):
        mock_svc = MagicMock()
        mock_svc.is_available = False
        mock_get_gcs.return_value = mock_svc

        url = _upload_to_gcs(b"IMAGEDATA", "sprites/abc.png")
        assert url is None


# ── NanoBananaEngine.generate_character_sprite ──────────────


class TestGenerateCharacterSprite:
    @pytest.mark.asyncio
    async def test_fallback_when_no_client(self):
        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = None

        result = await engine.generate_character_sprite("a cute otter")
        assert result["status"] == "fallback"
        assert result["asset_url"] is not None
        assert "otter" in result["asset_url"]
        assert result["metadata"]["mock"] is True

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_success_generates_and_uploads(self, mock_upload):
        mock_upload.return_value = "https://storage.googleapis.com/artitown-assets/sprites/test.png"

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_image_response(b"PNGBYTES")

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_character_sprite("a cute otter", style="anime")
        assert result["status"] == "success"
        assert result["asset_url"] is not None
        assert result["metadata"]["prompt"] == "a cute otter"
        assert result["metadata"]["style"] == "anime"
        assert result["metadata"]["size_bytes"] == len(b"PNGBYTES")
        assert "mock" not in result["metadata"]

        # Verify the generate_content call
        call_args = mock_client.models.generate_content.call_args
        assert "otter" in call_args.kwargs["contents"]
        assert "anime" in call_args.kwargs["contents"]

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_fallback_when_no_image_in_response(self, mock_upload):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_text_response()

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_character_sprite("a villain")
        assert result["status"] == "fallback"
        assert result["asset_url"] is not None
        assert result["metadata"]["mock"] is True
        mock_upload.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_on_api_exception(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API quota exceeded")

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_character_sprite("test")
        assert result["status"] == "fallback"
        assert result["asset_url"] is not None
        assert result["metadata"]["mock"] is True
        assert "API quota exceeded" in result["metadata"]["error"]

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_default_style_is_pixel_art(self, mock_upload):
        mock_upload.return_value = "https://example.com/img.png"
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_image_response()

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_character_sprite("warrior")
        assert result["metadata"]["style"] == "pixel_art"

        call_args = mock_client.models.generate_content.call_args
        assert "pixel_art" in call_args.kwargs["contents"]

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_gcs_path_starts_with_sprites(self, mock_upload):
        mock_upload.return_value = "https://example.com/sprite.png"
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_image_response()

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_character_sprite("knight")
        assert result["metadata"]["gcs_path"].startswith("sprites/")


# ── NanoBananaEngine.generate_object ────────────────────────


class TestGenerateObject:
    @pytest.mark.asyncio
    async def test_fallback_when_no_client(self):
        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = None

        result = await engine.generate_object("coffee cup")
        assert result["status"] == "fallback"
        assert result["asset_url"] is not None
        assert "coffee_cup" in result["asset_url"]
        assert result["metadata"]["mock"] is True

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_success_generates_and_uploads(self, mock_upload):
        mock_upload.return_value = "https://storage.googleapis.com/artitown-assets/objects/test.png"

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_image_response(b"OBJPNG")

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_object("wooden desk")
        assert result["status"] == "success"
        assert result["asset_url"] is not None
        assert result["metadata"]["object_name"] == "wooden desk"
        assert result["metadata"]["size_bytes"] == len(b"OBJPNG")
        assert "mock" not in result["metadata"]

        call_args = mock_client.models.generate_content.call_args
        assert "wooden desk" in call_args.kwargs["contents"]

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_fallback_when_no_image_in_response(self, mock_upload):
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_text_response()

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_object("lamp")
        assert result["status"] == "fallback"
        assert result["asset_url"] is not None
        assert result["metadata"]["mock"] is True
        mock_upload.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_on_api_exception(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = RuntimeError("Network error")

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_object("chair")
        assert result["status"] == "fallback"
        assert result["asset_url"] is not None
        assert result["metadata"]["mock"] is True
        assert "Network error" in result["metadata"]["error"]

    @pytest.mark.asyncio
    @patch("app.services.nano_banana._upload_to_gcs")
    async def test_gcs_path_starts_with_objects(self, mock_upload):
        mock_upload.return_value = "https://example.com/obj.png"
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = _make_image_response()

        engine = NanoBananaEngine.__new__(NanoBananaEngine)
        engine.client = mock_client

        result = await engine.generate_object("potted plant")
        assert result["metadata"]["gcs_path"].startswith("objects/")


# ── Engine initialization ───────────────────────────────────


class TestEngineInit:
    @patch("app.services.nano_banana._get_client")
    def test_init_calls_get_client(self, mock_gc):
        mock_gc.return_value = MagicMock()
        engine = NanoBananaEngine()
        mock_gc.assert_called_once()
        assert engine.client is not None

    @patch("app.services.nano_banana._get_client")
    def test_init_with_no_key(self, mock_gc):
        mock_gc.return_value = None
        engine = NanoBananaEngine()
        assert engine.client is None
