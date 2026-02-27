"""NanoBanana image generation engine — powered by Google Gemini Imagen API.

Generates character sprites and object assets via the Gemini 2.5 Flash
image model, then uploads results to GCS (artitown-assets bucket).

Environment variables:
    GOOGLE_API_KEY  — Gemini API key (required for image generation)
"""

import io
import logging
import os
import uuid
from typing import Any, Dict, Optional

from google import genai
from google.genai import types

from app.services.gcs_service import get_gcs_service

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.5-flash-preview-04-17"


def _get_client() -> Optional[genai.Client]:
    """Return a Gemini client if API key is available."""
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        logger.warning("GOOGLE_API_KEY not set — image generation disabled")
        return None
    return genai.Client(api_key=api_key)


def _extract_image_bytes(response) -> Optional[bytes]:
    """Extract the first image from a Gemini generate_content response."""
    if not response or not response.candidates:
        return None
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return part.inline_data.data
    return None


def _upload_to_gcs(image_bytes: bytes, path: str) -> Optional[str]:
    """Upload image bytes to GCS and return the public URL."""
    gcs = get_gcs_service()
    if not gcs.is_available:
        logger.warning("GCS unavailable — returning None for asset URL")
        return None
    return gcs.upload_bytes(image_bytes, path, content_type="image/png")


def _mock_sprite_url(prompt: str) -> str:
    """Return a deterministic mock sprite URL for fallback."""
    slug = prompt.replace(" ", "_")[:40]
    return f"https://storage.googleapis.com/artitown-assets/mock/sprite_{slug}.png"


def _mock_object_url(object_name: str) -> str:
    """Return a deterministic mock object URL for fallback."""
    slug = object_name.replace(" ", "_")[:40]
    return f"https://storage.googleapis.com/artitown-assets/mock/obj_{slug}.png"


class NanoBananaEngine:
    """Image generation engine backed by Google Gemini Imagen API.

    Falls back to mock URLs when the API key is missing or API calls fail.
    """

    def __init__(self):
        self.client = _get_client()

    async def generate_character_sprite(
        self, prompt: str, style: str = "pixel_art"
    ) -> Dict[str, Any]:
        """Generate a character sprite sheet using Gemini image generation.

        Args:
            prompt: Description of the character to generate.
            style: Art style hint (e.g. pixel_art, anime, cartoon).

        Returns:
            Dict with status, asset_url, and metadata.
            Falls back to mock URL if API is unavailable or fails.
        """
        if not self.client:
            logger.info("No Gemini client — returning mock sprite for %r", prompt)
            return {
                "status": "fallback",
                "asset_url": _mock_sprite_url(prompt),
                "metadata": {"prompt": prompt, "style": style, "mock": True},
            }

        full_prompt = (
            f"Generate a 2D RPG character sprite sheet in {style} style. "
            f"The character: {prompt}. "
            f"Include front-facing idle pose and walking animation frames. "
            f"64x64 pixel art on a transparent background."
        )

        try:
            response = self.client.models.generate_content(
                model=_MODEL,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )

            image_bytes = _extract_image_bytes(response)
            if not image_bytes:
                logger.warning("No image in response — falling back to mock sprite")
                return {
                    "status": "fallback",
                    "asset_url": _mock_sprite_url(prompt),
                    "metadata": {"prompt": prompt, "style": style, "mock": True},
                }

            asset_id = uuid.uuid4().hex[:12]
            gcs_path = f"sprites/{asset_id}.png"
            asset_url = _upload_to_gcs(image_bytes, gcs_path)

            return {
                "status": "success",
                "asset_url": asset_url,
                "metadata": {
                    "prompt": prompt,
                    "style": style,
                    "model": _MODEL,
                    "gcs_path": gcs_path,
                    "size_bytes": len(image_bytes),
                },
            }

        except Exception as exc:
            logger.error("Sprite generation failed: %s — falling back to mock", exc)
            return {
                "status": "fallback",
                "asset_url": _mock_sprite_url(prompt),
                "metadata": {"prompt": prompt, "style": style, "mock": True, "error": str(exc)},
            }

    async def generate_object(self, object_name: str) -> Dict[str, Any]:
        """Generate a static game object image using Gemini image generation.

        Args:
            object_name: Name of the object (e.g. "coffee cup", "desk").

        Returns:
            Dict with status and asset_url.
            Falls back to mock URL if API is unavailable or fails.
        """
        if not self.client:
            logger.info("No Gemini client — returning mock object for %r", object_name)
            return {
                "status": "fallback",
                "asset_url": _mock_object_url(object_name),
                "metadata": {"object_name": object_name, "mock": True},
            }

        full_prompt = (
            f"Generate a single 2D game asset of a {object_name}. "
            f"Isometric perspective, clean edges, transparent background. "
            f"Suitable for an office/town simulation game."
        )

        try:
            response = self.client.models.generate_content(
                model=_MODEL,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )

            image_bytes = _extract_image_bytes(response)
            if not image_bytes:
                logger.warning("No image in response — falling back to mock object")
                return {
                    "status": "fallback",
                    "asset_url": _mock_object_url(object_name),
                    "metadata": {"object_name": object_name, "mock": True},
                }

            asset_id = uuid.uuid4().hex[:12]
            gcs_path = f"objects/{asset_id}.png"
            asset_url = _upload_to_gcs(image_bytes, gcs_path)

            return {
                "status": "success",
                "asset_url": asset_url,
                "metadata": {
                    "object_name": object_name,
                    "model": _MODEL,
                    "gcs_path": gcs_path,
                    "size_bytes": len(image_bytes),
                },
            }

        except Exception as exc:
            logger.error("Object generation failed: %s — falling back to mock", exc)
            return {
                "status": "fallback",
                "asset_url": _mock_object_url(object_name),
                "metadata": {"object_name": object_name, "mock": True, "error": str(exc)},
            }
