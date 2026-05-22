from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.auth.jwt import decode_token
from app.ws.manager import manager

router = APIRouter()


@router.websocket("/ws/client")
async def client_socket(ws: WebSocket, token: str = Query(...)) -> None:
    """Dashboard client websocket. Auth via user access JWT."""
    try:
        payload = decode_token(token)
        if payload.get("kind") != "access":
            raise ValueError("wrong token kind")
    except ValueError:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws.accept()
    await manager.attach_client(ws)
    try:
        while True:
            # Echo channel for now; clients receive broadcasts via the manager.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.detach_client(ws)
