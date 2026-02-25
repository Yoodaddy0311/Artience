from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from app.services.cli_integration import CliIntegrationService
import os
import asyncio
import subprocess
import platform

router = APIRouter(prefix="/api/cli", tags=["CLI Integration"])

@router.get("/auth-status")
async def check_auth_status():
    claude_cfg = os.path.expanduser("~/.claude.json")
    if os.path.exists(claude_cfg):
        return {"authenticated": True}
    return {"authenticated": False}

@router.post("/auth-login")
async def trigger_auth_login():
    if platform.system() == "Windows":
        # Launch a native new console window to run the login
        cmd = 'start cmd /k "echo 브라우저에서 Claude 인증을 진행합니다. 완료 후 이 창을 닫아주세요. && npx @anthropic-ai/claude-code login"'
        subprocess.Popen(cmd, shell=True)
        return {"status": "launched"}
    elif platform.system() == "Darwin":
        cmd = 'osascript -e \'tell application "Terminal" to do script "npx @anthropic-ai/claude-code login"\''
        subprocess.Popen(cmd, shell=True)
        return {"status": "launched"}
    return JSONResponse(status_code=400, content={"status": "unsupported_os", "message": "지원하지 않는 OS입니다."})

@router.websocket("/ws")
async def websocket_cli_endpoint(websocket: WebSocket, provider: str = "claude"):
    """WebSocket endpoint to connect a frontend terminal directly to a native CLI tool."""
    await websocket.accept()
    
    workspace_path = os.getcwd()
    cli_service = CliIntegrationService(workspace_path)
    
    # We will run the reader in a separate asyncio task to stream output to frontend
    async def read_from_cli():
        try:
            async for line in cli_service.start_cli(provider):
                await websocket.send_text(line)
        except Exception as e:
            await websocket.send_text(f"CLI Start Error: {str(e)}\n")

    reader_task = asyncio.create_task(read_from_cli())

    try:
        while True:
            # Receive commands from frontend and send to CLI stdin
            user_input = await websocket.receive_text()
            await cli_service.send_command(user_input)
    except WebSocketDisconnect:
        print("Frontend CLI Terminal disconnected")
    finally:
        reader_task.cancel()
        await cli_service.terminate()
