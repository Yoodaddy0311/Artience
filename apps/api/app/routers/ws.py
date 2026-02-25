from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import json
import asyncio

router = APIRouter(prefix="/ws", tags=["websocket"])

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                continue

manager = ConnectionManager()

@router.websocket("/town")
async def websocket_town_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # For demonstration, we simply parse and broadcast tasks to the town
            try:
                payload = json.loads(data)
                if payload.get("type") == "CHAT_COMMAND":
                    agent = payload.get("target_agent", "Sera")
                    prompt = payload.get("text", "")
                    
                    # 1. Send initial THINKING state
                    await manager.broadcast({
                        "type": "AGENT_STATE_CHANGE",
                        "agentId": "a01" if agent.lower() == "sera" else "a01", # TODO: map by name
                        "state": "THINKING"
                    })
                    
                    # 2. Spawn actual claude CLI process
                    # 2. Spawn actual claude CLI process
                    import asyncio
                    import os
                    
                    full_cmd = f'npx @anthropic-ai/claude-code -p "{prompt}" --print'
                    print(f"Executing: {full_cmd}")
                    
                    env = os.environ.copy()
                    env["FORCE_COLOR"] = "1"
                    
                    async def run_claude():
                        try:
                            proc = await asyncio.create_subprocess_shell(
                                full_cmd,
                                stdout=asyncio.subprocess.PIPE,
                                stderr=asyncio.subprocess.STDOUT,
                                env=env
                            )
                            
                            stdout, _ = await proc.communicate()
                            
                            if stdout:
                                text = stdout.decode('utf-8', errors='replace').strip()
                                print(f"Claude OUT: {text}")
                                
                                # Send the full output as a single chunk
                                await manager.broadcast({
                                    "type": "TASK_ASSIGNED",
                                    "agent": agent,
                                    "taskContent": text
                                })
                            
                            # Return agent to IDLE after process finishes
                            state = "SUCCESS" if proc.returncode == 0 else "ERROR"
                            await manager.broadcast({
                                "type": "AGENT_STATE_CHANGE",
                                "agentId": "a01" if agent.lower() == "sera" else "a01",
                                "state": state
                            })
                            await asyncio.sleep(2)
                            await manager.broadcast({
                                "type": "AGENT_STATE_CHANGE",
                                "agentId": "a01" if agent.lower() == "sera" else "a01",
                                "state": "IDLE"
                            })
                            print(f"Finished run_claude. Exit code: {proc.returncode}")
                        except Exception as e:
                            print(f"Error executing claude: {e}")
                            await manager.broadcast({
                                "type": "AGENT_STATE_CHANGE",
                                "agentId": "a01" if agent.lower() == "sera" else "a01",
                                "state": "ERROR"
                            })
                    
                    asyncio.create_task(run_claude())

            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
