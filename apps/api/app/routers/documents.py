from fastapi import APIRouter, UploadFile, File
import time
import asyncio

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # Simulate a delay for parsing the document
    await asyncio.sleep(2)
    return {
        "filename": file.filename, 
        "status": "Document parsing completed to JSON", 
        "doc_id": f"doc_{int(time.time())}",
        "detected_entities": ["Feature A", "Login Flow", "Database Sync"]
    }
