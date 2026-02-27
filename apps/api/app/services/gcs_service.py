"""Google Cloud Storage service for asset management.

Provides upload, download, signed-URL generation and listing for
the artitown-assets bucket. Falls back gracefully when GCS credentials
are not configured (local-only mode).

Environment variables:
    GOOGLE_APPLICATION_CREDENTIALS  — path to GCP service account JSON
    GCS_BUCKET                      — bucket name (default: artitown-assets)
    GCS_PUBLIC_URL_PREFIX           — optional public URL prefix for public objects
"""

import io
import logging
import os
from datetime import timedelta
from pathlib import Path
from typing import Optional

_logger = logging.getLogger(__name__)

_BUCKET_NAME = os.getenv("GCS_BUCKET", "artitown-assets")
_SIGNED_URL_EXPIRY = timedelta(hours=1)
_PUBLIC_URL_PREFIX = os.getenv("GCS_PUBLIC_URL_PREFIX", "")


def _get_client():
    """Lazily import and return a GCS client, or None if unavailable."""
    try:
        from google.cloud import storage
        return storage.Client()
    except Exception as exc:
        _logger.debug("GCS client unavailable: %s", exc)
        return None


class GCSService:
    """Thin wrapper around Google Cloud Storage operations."""

    def __init__(self, bucket_name: str = _BUCKET_NAME):
        self._bucket_name = bucket_name
        self._client = _get_client()
        self._bucket = None
        if self._client:
            try:
                self._bucket = self._client.bucket(self._bucket_name)
                _logger.info("GCS connected: bucket=%s", self._bucket_name)
            except Exception as exc:
                _logger.warning("GCS bucket init failed: %s", exc)
                self._client = None

    @property
    def is_available(self) -> bool:
        """True when GCS credentials are configured and bucket is accessible."""
        return self._client is not None and self._bucket is not None

    # ── Upload ────────────────────────────────────────

    def upload_bytes(
        self,
        data: bytes,
        destination_path: str,
        content_type: str = "application/octet-stream",
    ) -> Optional[str]:
        """Upload raw bytes to GCS.

        Args:
            data: File content.
            destination_path: Object path inside the bucket
                              (e.g. ``uploads/myfile.png``).
            content_type: MIME type of the file.

        Returns:
            Public or signed URL on success, ``None`` on failure.
        """
        if not self.is_available:
            return None

        try:
            blob = self._bucket.blob(destination_path)
            blob.upload_from_string(data, content_type=content_type)
            _logger.info("GCS upload: %s (%d bytes)", destination_path, len(data))
            return self._get_url(blob, destination_path)
        except Exception as exc:
            _logger.error("GCS upload failed for %s: %s", destination_path, exc)
            return None

    def upload_file(
        self,
        local_path: str | Path,
        destination_path: str,
        content_type: str = "application/octet-stream",
    ) -> Optional[str]:
        """Upload a local file to GCS.

        Returns:
            Public or signed URL on success, ``None`` on failure.
        """
        if not self.is_available:
            return None

        try:
            blob = self._bucket.blob(destination_path)
            blob.upload_from_filename(str(local_path), content_type=content_type)
            _logger.info("GCS upload file: %s -> %s", local_path, destination_path)
            return self._get_url(blob, destination_path)
        except Exception as exc:
            _logger.error("GCS upload_file failed for %s: %s", destination_path, exc)
            return None

    # ── Download ──────────────────────────────────────

    def download_bytes(self, source_path: str) -> Optional[bytes]:
        """Download an object from GCS as bytes."""
        if not self.is_available:
            return None

        try:
            blob = self._bucket.blob(source_path)
            return blob.download_as_bytes()
        except Exception as exc:
            _logger.error("GCS download failed for %s: %s", source_path, exc)
            return None

    # ── URL generation ────────────────────────────────

    def get_signed_url(
        self,
        object_path: str,
        expiration: timedelta = _SIGNED_URL_EXPIRY,
    ) -> Optional[str]:
        """Generate a time-limited signed URL for a private object."""
        if not self.is_available:
            return None

        try:
            blob = self._bucket.blob(object_path)
            return blob.generate_signed_url(expiration=expiration, method="GET")
        except Exception as exc:
            _logger.error("GCS signed URL failed for %s: %s", object_path, exc)
            return None

    def get_public_url(self, object_path: str) -> str:
        """Return the public URL for an object (bucket must allow public reads)."""
        if _PUBLIC_URL_PREFIX:
            return f"{_PUBLIC_URL_PREFIX.rstrip('/')}/{object_path}"
        return f"https://storage.googleapis.com/{self._bucket_name}/{object_path}"

    # ── List ──────────────────────────────────────────

    def list_objects(self, prefix: str = "", max_results: int = 1000) -> list[dict]:
        """List objects under a prefix."""
        if not self.is_available:
            return []

        try:
            blobs = self._client.list_blobs(
                self._bucket_name, prefix=prefix, max_results=max_results,
            )
            return [
                {
                    "name": b.name,
                    "size": b.size,
                    "content_type": b.content_type,
                    "updated": b.updated.isoformat() if b.updated else None,
                    "url": self._get_url(b, b.name),
                }
                for b in blobs
            ]
        except Exception as exc:
            _logger.error("GCS list_objects failed: %s", exc)
            return []

    # ── Delete ────────────────────────────────────────

    def delete_object(self, object_path: str) -> bool:
        """Delete a single object from GCS."""
        if not self.is_available:
            return False

        try:
            blob = self._bucket.blob(object_path)
            blob.delete()
            _logger.info("GCS deleted: %s", object_path)
            return True
        except Exception as exc:
            _logger.error("GCS delete failed for %s: %s", object_path, exc)
            return False

    # ── Internal ──────────────────────────────────────

    def _get_url(self, blob, object_path: str) -> str:
        """Return public URL if prefix is set, otherwise signed URL."""
        if _PUBLIC_URL_PREFIX:
            return self.get_public_url(object_path)
        try:
            return blob.generate_signed_url(
                expiration=_SIGNED_URL_EXPIRY, method="GET",
            )
        except Exception:
            # Fallback to public URL pattern if signing fails
            return self.get_public_url(object_path)


# ── Module-level singleton ────────────────────────────
_gcs: Optional[GCSService] = None


def get_gcs_service() -> GCSService:
    """Return the module-level GCSService singleton (lazy init)."""
    global _gcs
    if _gcs is None:
        _gcs = GCSService()
    return _gcs
