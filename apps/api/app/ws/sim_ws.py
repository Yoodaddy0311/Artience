import asyncio
from typing import List
from fastapi import WebSocket

class SimulationBroadcaster:
    """Manages WebSocket connections to sync backend task states to PixiJS Agent Town."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        """Send state update mapped to character animation requirements
        e.g., {'agent_id': 'char_pm', 'state': 'thinking', 'bubbleText': 'Planning...'}
        """
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                pass

sim_broadcaster = SimulationBroadcaster()
