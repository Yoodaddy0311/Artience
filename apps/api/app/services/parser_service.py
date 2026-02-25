"""File parsing service supporting TXT, MD, JSON, and PDF formats.

Provides structured content extraction with metadata and section detection.
"""

from typing import Dict, Any
import json
import logging
import re
from pathlib import Path

_logger = logging.getLogger(__name__)

# Supported file extensions mapped to parser method names
_EXTENSION_MAP: Dict[str, str] = {
    ".txt": "text",
    ".md": "text",
    ".json": "json",
    ".pdf": "pdf",
}

SUPPORTED_EXTENSIONS = set(_EXTENSION_MAP.keys())


class ParserService:
    """Unified file parser that delegates to format-specific handlers."""

    def parse_file(self, file_path: str, file_type: str) -> Dict[str, Any]:
        """Parse a file and return structured content.

        Args:
            file_path: Absolute path to the file.
            file_type: One of 'text', 'json', 'pdf' (or a raw extension like '.md').

        Returns:
            dict with keys: content (str), metadata (dict), sections (list).
        """
        # Normalise file_type -- accept both ".md" and "text"
        normalised = _EXTENSION_MAP.get(file_type, file_type)

        handler = {
            "text": self.parse_text,
            "json": self.parse_json,
            "pdf": self.parse_pdf,
        }.get(normalised)

        if handler is None:
            _logger.warning("Unsupported file type '%s' for %s", file_type, file_path)
            return {
                "content": "",
                "metadata": {"error": f"Unsupported file type: {file_type}", "file_path": file_path},
                "sections": [],
            }

        try:
            return handler(file_path)
        except Exception as exc:
            _logger.error("Parsing failed for %s: %s", file_path, exc)
            return {
                "content": "",
                "metadata": {"error": str(exc), "file_path": file_path},
                "sections": [],
            }

    # ------------------------------------------------------------------
    # Text / Markdown
    # ------------------------------------------------------------------

    def parse_text(self, file_path: str) -> Dict[str, Any]:
        """Parse plain text or Markdown files.

        Detects Markdown headings to split the document into sections.

        Args:
            file_path: Absolute path to the file.

        Returns:
            Structured dict with content, metadata, and sections.
        """
        path = Path(file_path)
        raw = path.read_text(encoding="utf-8", errors="replace")

        sections = self._extract_sections(raw, path.suffix)
        word_count = len(raw.split())
        line_count = raw.count("\n") + (1 if raw else 0)

        return {
            "content": raw,
            "metadata": {
                "file_path": file_path,
                "file_type": path.suffix.lstrip("."),
                "word_count": word_count,
                "line_count": line_count,
                "char_count": len(raw),
            },
            "sections": sections,
        }

    # ------------------------------------------------------------------
    # JSON
    # ------------------------------------------------------------------

    def parse_json(self, file_path: str) -> Dict[str, Any]:
        """Parse and validate a JSON file.

        Args:
            file_path: Absolute path to the file.

        Returns:
            Structured dict with pretty-printed content, top-level keys,
            and basic structural metadata.
        """
        path = Path(file_path)
        raw = path.read_text(encoding="utf-8", errors="replace")

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            return {
                "content": raw,
                "metadata": {
                    "file_path": file_path,
                    "file_type": "json",
                    "valid": False,
                    "error": str(exc),
                },
                "sections": [],
            }

        pretty = json.dumps(parsed, indent=2, ensure_ascii=False)

        # Derive structural info
        top_keys: list[str] = []
        item_count: int = 0
        if isinstance(parsed, dict):
            top_keys = list(parsed.keys())
            item_count = len(top_keys)
        elif isinstance(parsed, list):
            item_count = len(parsed)

        sections = [
            {"title": key, "content": json.dumps(parsed[key], indent=2, ensure_ascii=False)}
            for key in top_keys
        ] if top_keys else []

        return {
            "content": pretty,
            "metadata": {
                "file_path": file_path,
                "file_type": "json",
                "valid": True,
                "top_level_keys": top_keys,
                "item_count": item_count,
                "char_count": len(raw),
            },
            "sections": sections,
        }

    # ------------------------------------------------------------------
    # PDF
    # ------------------------------------------------------------------

    def parse_pdf(self, file_path: str) -> Dict[str, Any]:
        """Extract text from a PDF file.

        Delegates to the dedicated pdf_parser module which handles
        PyPDF2 availability and graceful fallback.

        Args:
            file_path: Absolute path to the file.

        Returns:
            Structured dict with content, metadata, and per-page sections.
        """
        import asyncio
        from app.parsers.pdf_parser import parse_pdf as _parse_pdf

        # The pdf_parser is async for historical reasons; run it synchronously
        # when called from the sync ParserService interface.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # We are inside an async context -- create a future
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = pool.submit(asyncio.run, _parse_pdf(file_path)).result()
            return result

        return asyncio.run(_parse_pdf(file_path))

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_sections(text: str, suffix: str) -> list[dict]:
        """Split text into sections by Markdown headings or blank-line paragraphs."""
        if suffix in (".md", ".markdown"):
            return ParserService._extract_md_sections(text)
        return ParserService._extract_paragraph_sections(text)

    @staticmethod
    def _extract_md_sections(text: str) -> list[dict]:
        """Extract sections from Markdown using heading lines."""
        heading_re = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
        matches = list(heading_re.finditer(text))

        if not matches:
            return [{"title": "Document", "content": text.strip()}] if text.strip() else []

        sections: list[dict] = []
        for idx, match in enumerate(matches):
            level = len(match.group(1))
            title = match.group(2).strip()
            start = match.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            content = text[start:end].strip()
            sections.append({"title": title, "content": content, "level": level})

        return sections

    @staticmethod
    def _extract_paragraph_sections(text: str) -> list[dict]:
        """Split plain text into sections by double newlines."""
        paragraphs = re.split(r"\n{2,}", text.strip())
        return [
            {"title": f"Section {idx + 1}", "content": para.strip()}
            for idx, para in enumerate(paragraphs)
            if para.strip()
        ]
