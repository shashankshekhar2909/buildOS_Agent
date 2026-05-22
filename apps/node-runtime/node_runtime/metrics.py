from typing import Any
import psutil


def snapshot() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    du = psutil.disk_usage("/")
    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "cpu_count": psutil.cpu_count(),
        "load_avg": list(psutil.getloadavg()),
        "mem_total": vm.total,
        "mem_used": vm.used,
        "mem_percent": vm.percent,
        "disk_total": du.total,
        "disk_used": du.used,
        "disk_percent": du.percent,
    }
