"""Input sanitization and validation utilities for the Dokba Studio API.

Provides functions for sanitizing user-supplied strings, filenames, HTML
content, and validating file uploads including ZIP archive inspection.

All functions rely exclusively on the Python standard library (``re``,
``zipfile``, ``io``, ``os``).  No external dependencies are required.
"""

import io
import os
import re
import zipfile
from typing import List, Tuple


# ── String sanitization ──────────────────────────────────────────────

def sanitize_string(value: str, max_length: int = 1000) -> str:
    """Strip dangerous characters and limit length.

    Removes null bytes and ASCII control characters (except common
    whitespace: tab, newline, carriage return) then truncates to
    *max_length*.

    Args:
        value: The raw string to sanitize.
        max_length: Maximum allowed length after sanitization.

    Returns:
        The sanitized, length-limited string.
    """
    # Remove null bytes
    value = value.replace("\x00", "")
    # Remove ASCII control chars except \t \n \r
    value = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return value[:max_length]


# ── Filename sanitization ────────────────────────────────────────────

# Only allow alphanumeric, hyphens, underscores, and dots.
_SAFE_FILENAME_RE = re.compile(r"[^a-zA-Z0-9\-_.]")

_MAX_FILENAME_LENGTH = 255


def sanitize_filename(name: str) -> str:
    """Sanitize a filename for safe storage.

    - Removes path traversal sequences (``../``, ``..\\\\``).
    - Strips null bytes and control characters.
    - Removes any character that is not alphanumeric, hyphen,
      underscore, or dot.
    - Truncates to 255 characters.
    - Falls back to ``"unnamed"`` if the result is empty.

    Args:
        name: The raw filename from the client.

    Returns:
        A safe filename suitable for writing to the filesystem.
    """
    # Strip null bytes
    name = name.replace("\x00", "")
    # Remove control characters
    name = re.sub(r"[\x01-\x1f\x7f]", "", name)
    # Remove path traversal patterns (both Unix and Windows)
    name = name.replace("../", "").replace("..\\", "")
    # Take only the basename to prevent directory components
    name = os.path.basename(name)
    # Remove any remaining unsafe characters
    name = _SAFE_FILENAME_RE.sub("", name)
    # Truncate
    name = name[:_MAX_FILENAME_LENGTH]
    # Fallback if nothing remains
    if not name or name.startswith("."):
        name = "unnamed"
    return name


# ── File upload validation ───────────────────────────────────────────

# Map allowed extensions to their expected MIME type prefixes.
_EXTENSION_MIME_MAP = {
    ".txt": ["text/plain"],
    ".md": ["text/plain", "text/markdown", "application/octet-stream"],
    ".json": ["application/json", "text/plain"],
    ".pdf": ["application/pdf"],
    ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
}


def validate_file_upload(
    filename: str,
    content_type: str,
    size: int,
    allowed_types: List[str],
    max_size: int,
) -> Tuple[bool, str]:
    """Validate a file upload against allowed types and size constraints.

    Checks the file extension against *allowed_types*, verifies the
    MIME ``content_type`` is plausible for that extension, and ensures
    *size* does not exceed *max_size*.

    Args:
        filename: The sanitized filename (use :func:`sanitize_filename` first).
        content_type: The MIME content-type header from the upload.
        size: The file size in bytes.
        allowed_types: List of allowed extensions, e.g. ``[".txt", ".pdf"]``.
        max_size: Maximum allowed size in bytes.

    Returns:
        A ``(is_valid, error_message)`` tuple.  When valid, the error
        message is an empty string.
    """
    if not filename:
        return False, "Filename is required"

    # Extract and check extension
    dot_idx = filename.rfind(".")
    if dot_idx == -1:
        return False, f"File must have an extension. Allowed: {', '.join(sorted(allowed_types))}"

    ext = filename[dot_idx:].lower()
    if ext not in allowed_types:
        return False, f"File type '{ext}' is not allowed. Allowed: {', '.join(sorted(allowed_types))}"

    # Check MIME type plausibility (lenient -- browsers vary)
    expected_mimes = _EXTENSION_MIME_MAP.get(ext)
    if expected_mimes and content_type:
        content_type_lower = content_type.lower().split(";")[0].strip()
        if content_type_lower not in expected_mimes:
            return False, (
                f"Content type '{content_type}' does not match expected types "
                f"for '{ext}': {', '.join(expected_mimes)}"
            )

    # Check size
    if size <= 0:
        return False, "File is empty"
    if size > max_size:
        max_mb = max_size / (1024 * 1024)
        actual_mb = size / (1024 * 1024)
        return False, (
            f"File size ({actual_mb:.1f} MB) exceeds maximum allowed size ({max_mb:.1f} MB)"
        )

    return True, ""


# ── ZIP archive validation ───────────────────────────────────────────

_ZIP_BOMB_RATIO = 100  # compression ratio above this is suspicious


def validate_zip_contents(
    file_bytes: bytes,
    max_files: int = 100,
    max_total_size: int = 100_000_000,
) -> Tuple[bool, str]:
    """Validate a ZIP archive for safety before extraction.

    Performs the following checks:

    - The archive is a valid ZIP file.
    - No entry uses path traversal (``..`` in name).
    - The number of entries does not exceed *max_files*.
    - The total uncompressed size does not exceed *max_total_size*.
    - The compression ratio does not exceed 100:1 (zip bomb detection).

    Args:
        file_bytes: Raw bytes of the ZIP file.
        max_files: Maximum number of files allowed inside the archive.
        max_total_size: Maximum total uncompressed size in bytes.

    Returns:
        A ``(is_valid, error_message)`` tuple.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes))
    except (zipfile.BadZipFile, Exception) as exc:
        return False, f"Invalid ZIP file: {exc}"

    with zf:
        info_list = zf.infolist()

        # Check entry count
        if len(info_list) > max_files:
            return False, (
                f"ZIP contains {len(info_list)} files, exceeding the limit of {max_files}"
            )

        compressed_size = len(file_bytes)
        total_uncompressed: int = 0

        for entry in info_list:
            # Path traversal check
            # Normalise separators and check for ".." components
            entry_name = entry.filename.replace("\\", "/")
            parts = entry_name.split("/")
            if ".." in parts:
                return False, (
                    f"ZIP entry contains path traversal: '{entry.filename}'"
                )
            # Absolute path check
            if entry_name.startswith("/"):
                return False, (
                    f"ZIP entry uses absolute path: '{entry.filename}'"
                )

            total_uncompressed += entry.file_size

        # Total size check
        if total_uncompressed > max_total_size:
            total_mb = total_uncompressed / (1024 * 1024)
            max_mb = max_total_size / (1024 * 1024)
            return False, (
                f"ZIP total uncompressed size ({total_mb:.1f} MB) exceeds "
                f"limit ({max_mb:.1f} MB)"
            )

        # Zip bomb ratio check
        if compressed_size > 0 and total_uncompressed > 0:
            ratio = total_uncompressed / compressed_size
            if ratio > _ZIP_BOMB_RATIO:
                return False, (
                    f"ZIP compression ratio ({ratio:.0f}:1) exceeds safe "
                    f"threshold ({_ZIP_BOMB_RATIO}:1). Possible zip bomb."
                )

    return True, ""


# ── HTML sanitization ────────────────────────────────────────────────

# Match any HTML tag including self-closing and attributes.
_HTML_TAG_RE = re.compile(r"<[^>]*>", re.DOTALL)


def sanitize_html(text: str) -> str:
    """Strip all HTML tags from *text*.

    Uses a simple regex-based approach suitable for sanitizing chat
    messages.  Does not require external dependencies.

    Also removes null bytes and ASCII control characters (except
    common whitespace).

    Args:
        text: Raw text potentially containing HTML markup.

    Returns:
        The text with all HTML tags removed.
    """
    # Strip HTML tags
    text = _HTML_TAG_RE.sub("", text)
    # Remove null bytes and control chars
    text = text.replace("\x00", "")
    text = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text
