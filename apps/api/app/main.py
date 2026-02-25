from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import cli, studio, ws, documents, export, jobs

app = FastAPI(
    title="DogBa Platform API",
    description="Backend services for the Artifarm DogBa Client",
    version="1.0.0"
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cli.router)
app.include_router(studio.router)
app.include_router(ws.router)
app.include_router(documents.router)
app.include_router(export.router)
app.include_router(jobs.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
