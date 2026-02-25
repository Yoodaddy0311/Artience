"""PDF text extraction with graceful fallback.

Attempts PyPDF2 first, falls back to basic binary extraction
if the library is unavailable.
"""

from typing import Dict, Any
import logging

_logger = logging.getLogger(__name__)


async def parse_pdf(file_path: str) -> Dict[str, Any]:
    """Extract text content from a PDF file.

    Args:
        file_path: Absolute path to the PDF file.

    Returns:
        dict with keys: content (str), metadata (dict), sections (list).
    """
    try:
        return _extract_with_pypdf2(file_path)
    except ImportError:
        _logger.warning("PyPDF2 not installed -- falling back to basic extraction")
        return _extract_basic(file_path)
    except Exception as exc:
        _logger.error("PDF parsing failed for %s: %s", file_path, exc)
        return {
            "content": "",
            "metadata": {"error": str(exc), "file_path": file_path},
            "sections": [],
        }


def _extract_with_pypdf2(file_path: str) -> Dict[str, Any]:
    """Extract text using PyPDF2."""
    from PyPDF2 import PdfReader  # noqa: WPS433 -- conditional import

    reader = PdfReader(file_path)

    # Guard against encrypted PDFs
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception:
            return {
                "content": "",
                "metadata": {
                    "error": "PDF is encrypted and could not be decrypted",
                    "file_path": file_path,
                    "page_count": 0,
                },
                "sections": [],
            }

    pages_text: list[str] = []
    sections: list[dict] = []

    for idx, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages_text.append(text)
        if text.strip():
            sections.append({
                "title": f"Page {idx + 1}",
                "content": text.strip(),
                "page": idx + 1,
            })

    full_text = "\n\n".join(pages_text)

    metadata: Dict[str, Any] = {
        "file_path": file_path,
        "page_count": len(reader.pages),
        "word_count": len(full_text.split()),
        "char_count": len(full_text),
    }

    # Pull standard PDF metadata when available
    if reader.metadata:
        for key in ("title", "author", "subject", "creator"):
            value = getattr(reader.metadata, key, None)
            if value:
                metadata[key] = str(value)

    return {
        "content": full_text,
        "metadata": metadata,
        "sections": sections,
    }


def _extract_basic(file_path: str) -> Dict[str, Any]:
    """Rudimentary text extraction from PDF binary (no external deps).

    This is intentionally simple -- it looks for text streams between
    BT/ET operators but will miss most structured content.  It exists
    solely as a last-resort fallback.
    """
    import re

    try:
        with open(file_path, "rb") as fh:
            raw = fh.read()

        # Attempt to pull printable ASCII runs longer than 4 chars
        text_runs = re.findall(rb"[\x20-\x7E]{4,}", raw)
        content = " ".join(run.decode("ascii", errors="ignore") for run in text_runs)

        return {
            "content": content[:10_000],  # cap at 10k chars for safety
            "metadata": {
                "file_path": file_path,
                "extraction_method": "basic_binary",
                "warning": "PyPDF2 not available -- text quality may be low",
            },
            "sections": [{"title": "Raw Extraction", "content": content[:10_000]}] if content else [],
        }
    except Exception as exc:
        return {
            "content": "",
            "metadata": {"error": str(exc), "file_path": file_path},
            "sections": [],
        }
