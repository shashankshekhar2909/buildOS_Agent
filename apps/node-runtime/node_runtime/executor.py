import asyncio
from typing import Any


async def run_command(cmd: list[str], timeout: float = 60.0) -> dict[str, Any]:
    """Run a shell command. Caller must verify approval before invoking."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return {"ok": False, "error": "timeout", "stdout": "", "stderr": ""}
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout": stdout.decode(errors="replace"),
        "stderr": stderr.decode(errors="replace"),
    }
