import asyncio
import os

async def test_async_subprocess():
    env = os.environ.copy()
    env["FORCE_COLOR"] = "1"
    
    cmd = 'npx @anthropic-ai/claude-code -p "hello" --print'
    print(f"Running: {cmd}")
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env
        )
        stdout, _ = await proc.communicate()
        print(f"Exit code: {proc.returncode}")
        if stdout:
            print("STDOUT:")
            print(stdout.decode('utf-8', errors='replace'))
    except Exception as e:
        print(f"Exception: {e}")

asyncio.run(test_async_subprocess())
