import asyncio
import subprocess
from typing import Dict, AsyncGenerator

class CliIntegrationService:
    """Wraps native CLI tools (claude, gemini) acting as a bridge to DogBa UI."""
    
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self._process = None

    async def start_cli(self, provider: str = "claude") -> AsyncGenerator[str, None]:
        """Starts the native CLI as a subprocess and streams output."""
        
        cmd = ["claude"] if provider == "claude" else ["gemini"]
        
        # We use asyncio.create_subprocess_exec to connect safely to stdin/stdout
        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=self.workspace_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        while True:
            line = await self._process.stdout.readline()
            if not line:
                break
            yield line.decode("utf-8")

    async def send_command(self, text: str):
        """Sends user text down to the native CLI instance."""
        if self._process and self._process.stdin:
            self._process.stdin.write(f"{text}\n".encode())
            await self._process.stdin.drain()

    async def terminate(self):
        if self._process:
            self._process.terminate()
            await self._process.wait()
