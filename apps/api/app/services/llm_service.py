"""LLM Service - Wraps the Anthropic Python SDK for draft generation and chat.

Falls back to rule-based generation when ANTHROPIC_API_KEY is not configured.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

_logger = logging.getLogger(__name__)

# ── System prompt that instructs Claude on the expected output schema ──
SYSTEM_PROMPT = """\
You are Dokba Studio's AI project generator. Your job is to generate a structured \
JSON draft for a virtual office / game world based on the user's prompt.

You MUST respond with ONLY valid JSON (no markdown fences, no commentary) matching \
this schema:

{
  "theme": {
    "name": "<string: short theme name>",
    "primary_color": "<string: hex color>",
    "secondary_color": "<string: hex color>",
    "background": "<string: hex color>"
  },
  "world": {
    "grid_size": <int: side length of the square grid, e.g. 32>,
    "rooms": [
      {
        "id": "<string>",
        "name": "<string>",
        "type": "<string: e.g. office, meeting, lounge, lab, entrance>",
        "width": <int>,
        "height": <int>,
        "x": <int>,
        "y": <int>
      }
    ],
    "zones": [
      {
        "id": "<string>",
        "name": "<string>",
        "type": "<string: e.g. work, social, quiet, outdoor>"
      }
    ]
  },
  "agents": [
    {
      "id": "<string>",
      "name": "<string>",
      "role": "<string: e.g. Developer, Designer, Manager, Researcher>",
      "personality": "<string: brief personality description>",
      "sprite": "<string: sprite asset path or placeholder>"
    }
  ],
  "recipes": [
    {
      "id": "<string>",
      "name": "<string>",
      "command": "<string>",
      "args": ["<string>"],
      "description": "<string: what this recipe does>"
    }
  ]
}

Rules:
- Generate creative, coherent content that matches the user's prompt.
- Room counts, agent counts, and recipe counts should be reasonable for the described scenario.
- Use Korean names/labels when the prompt is in Korean; otherwise use English.
- Colors should be valid hex codes that form a cohesive palette.
- Agent personalities should be diverse and interesting.
- Recipes should be practical CLI commands relevant to the project theme.
"""

# ── Scope-specific instructions ──
SCOPE_INSTRUCTIONS = {
    "theme": "Generate ONLY the 'theme' section. Omit world, agents, and recipes.",
    "world": "Generate ONLY the 'world' section. Omit theme, agents, and recipes.",
    "agents": "Generate ONLY the 'agents' section. Omit theme, world, and recipes.",
    "recipes": "Generate ONLY the 'recipes' section. Omit theme, world, and agents.",
    "all": "Generate ALL sections: theme, world, agents, and recipes.",
}


class LLMService:
    """Wraps the Anthropic Python SDK for Dokba Studio draft generation."""

    def __init__(self) -> None:
        self.api_key: Optional[str] = os.environ.get("ANTHROPIC_API_KEY")
        self.model: str = os.environ.get(
            "DOGBA_DEFAULT_MODEL", "claude-3-7-sonnet-20250219"
        )
        self.max_tokens: int = int(os.environ.get("DOGBA_MAX_TOKENS", "4096"))
        self._client = None

    @property
    def is_available(self) -> bool:
        """Check whether a valid API key is configured."""
        return bool(self.api_key and self.api_key != "sk-ant-xxx")

    def _get_client(self):
        """Lazy-initialise the Anthropic client."""
        if self._client is None:
            try:
                import anthropic

                self._client = anthropic.Anthropic(api_key=self.api_key)
            except Exception as exc:
                _logger.error("Failed to initialise Anthropic client: %s", exc)
                raise
        return self._client

    def _build_user_message(
        self, prompt: str, scope: str, assets: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """Compose the user-facing message sent to Claude."""
        scope_instruction = SCOPE_INSTRUCTIONS.get(scope, SCOPE_INSTRUCTIONS["all"])

        parts = [
            f"Scope: {scope_instruction}",
            f"User prompt: {prompt}",
        ]

        if assets:
            asset_descriptions = []
            for asset in assets:
                desc = asset.get("filename", asset.get("path", "unknown"))
                if asset.get("tags"):
                    desc += f" (tags: {', '.join(asset['tags'])})"
                if asset.get("type"):
                    desc += f" [type: {asset['type']}]"
                asset_descriptions.append(f"  - {desc}")

            parts.append("Available assets:\n" + "\n".join(asset_descriptions))

        return "\n\n".join(parts)

    def generate_draft(
        self,
        prompt: str,
        scope: str = "all",
        assets: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Generate a project draft via the Claude API.

        Returns:
            dict with either:
              - {"status": "ok", "draft": {...}} on success
              - {"status": "error", "message": "..."} on failure
              - {"status": "unavailable"} when no API key is set
        """
        if not self.is_available:
            _logger.info(
                "ANTHROPIC_API_KEY not configured; LLM generation unavailable."
            )
            return {"status": "unavailable"}

        try:
            client = self._get_client()
            user_message = self._build_user_message(prompt, scope, assets)

            _logger.info(
                "Calling Claude API (model=%s, max_tokens=%d, scope=%s)",
                self.model,
                self.max_tokens,
                scope,
            )

            response = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}],
            )

            # Extract text content from the response
            raw_text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    raw_text += block.text

            if not raw_text.strip():
                return {
                    "status": "error",
                    "message": "Claude returned an empty response.",
                }

            # Strip markdown fences if Claude added them despite instructions
            cleaned = raw_text.strip()
            if cleaned.startswith("```"):
                # Remove opening fence (```json or ```)
                first_newline = cleaned.index("\n")
                cleaned = cleaned[first_newline + 1 :]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            draft = json.loads(cleaned)

            _logger.info("Claude draft generated successfully (scope=%s).", scope)
            return {"status": "ok", "draft": draft}

        except json.JSONDecodeError as exc:
            _logger.warning("Claude returned invalid JSON: %s", exc)
            return {
                "status": "error",
                "message": f"Claude returned invalid JSON: {exc}",
            }
        except Exception as exc:
            _logger.exception("Claude API call failed")
            return {"status": "error", "message": f"LLM generation failed: {exc}"}

    async def chat(
        self,
        agent_name: str,
        agent_role: str,
        user_message: str,
    ) -> Optional[str]:
        """Generate a chat response for an agent using the Claude API.

        Returns the response text on success, or ``None`` if the LLM is
        unavailable or an error occurs (caller should fall back to the
        rule-based response).
        """
        if not self.is_available:
            return None

        try:
            client = self._get_client()

            system = (
                f"You are {agent_name}, a virtual team member with the role of "
                f"{agent_role}. Respond helpfully and in character. "
                "Keep responses concise (2-4 sentences). "
                "If the user writes in Korean, respond in Korean. "
                "If the user writes in English, respond in English."
            )

            import asyncio

            response = await asyncio.to_thread(
                client.messages.create,
                model=self.model,
                max_tokens=512,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )

            raw_text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    raw_text += block.text

            if raw_text.strip():
                _logger.debug(
                    "LLM chat response generated for agent=%s", agent_name
                )
                return raw_text.strip()

            return None

        except Exception as exc:
            _logger.warning("LLM chat failed for agent=%s: %s", agent_name, exc)
            return None
