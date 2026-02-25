import subprocess
import os
import sys

env = os.environ.copy()
env['FORCE_COLOR'] = '1'

print('Starting unbuffered test...')
cmd = 'npx @anthropic-ai/claude-code -p "hello" --print'
proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, bufsize=0)

while True:
    chunk = proc.stdout.read(1)
    if not chunk:
        break
    sys.stdout.buffer.write(chunk)
    sys.stdout.flush()

proc.wait()
