"""Legacy export endpoint.

Delegates to the enhanced ExportService for full project ZIP packaging.
Kept for backward compatibility -- prefer /api/studio/export/project instead.
"""

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from app.services.export_service import ExportService

router = APIRouter(prefix="/api/export", tags=["export"])

PUBLIC_DIR = Path(__file__).parent.parent.parent.parent / "desktop" / "public"


@router.get("/zip")
def export_project_zip():
    """Export full project as ZIP (legacy endpoint, delegates to ExportService)."""
    try:
        service = ExportService(PUBLIC_DIR)
        zip_buffer = service.export_project_zip()

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"DogBa_Project_Export_{timestamp}.zip"

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        return JSONResponse(
            {"error": f"Export failed: {str(e)}"},
            status_code=500,
        )
