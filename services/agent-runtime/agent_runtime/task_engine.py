"""Task engine skeleton. Polls api-gateway for queued tasks and runs them.

Real implementation: subscribe to redis events (task.created), respect
state machine (queued → running → completed/failed), retries with backoff,
dependencies, approval gates, parallel execution.
"""
import asyncio
import logging

log = logging.getLogger("task-engine")


async def run() -> None:
    log.info("task engine starting (skeleton)")
    while True:
        # TODO: poll/subscribe and dispatch
        await asyncio.sleep(5)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
