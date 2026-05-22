"""Approval decide flow — approve/deny on a task."""
from tests.conftest import auth_h


async def _create_command_task(client, admin):
    res = await client.post(
        "/v1/tasks",
        headers=auth_h(admin["access_token"]),
        json={"title": "approval test", "kind": "command", "payload": {"cmd": ["echo", "x"]}},
    )
    assert res.status_code == 201
    return res.json()


async def _find_approval_for(client, admin, task_id: str):
    res = await client.get("/v1/approvals", headers=auth_h(admin["access_token"]))
    for a in res.json():
        if a.get("task_id") == task_id:
            return a
    return None


async def test_approve_moves_task_to_queued(client, admin):
    task = await _create_command_task(client, admin)
    appr = await _find_approval_for(client, admin, task["id"])
    assert appr is not None

    decide = await client.post(
        f"/v1/approvals/{appr['id']}/decide",
        headers=auth_h(admin["access_token"]),
        json={"approve": True},
    )
    assert decide.status_code == 200, decide.text
    assert decide.json()["state"] == "approved"

    # Task should leave waiting_approval. No node connected so it'll fail w/ "node offline" — that proves dispatch ran.
    t = await client.get(f"/v1/tasks/{task['id']}", headers=auth_h(admin["access_token"]))
    assert t.json()["state"] in {"queued", "running", "failed"}


async def test_deny_cancels_task(client, admin):
    task = await _create_command_task(client, admin)
    appr = await _find_approval_for(client, admin, task["id"])
    decide = await client.post(
        f"/v1/approvals/{appr['id']}/decide",
        headers=auth_h(admin["access_token"]),
        json={"approve": False, "note": "no"},
    )
    assert decide.status_code == 200
    assert decide.json()["state"] == "denied"

    t = await client.get(f"/v1/tasks/{task['id']}", headers=auth_h(admin["access_token"]))
    assert t.json()["state"] == "cancelled"


async def test_decide_twice_conflicts(client, admin):
    task = await _create_command_task(client, admin)
    appr = await _find_approval_for(client, admin, task["id"])
    first = await client.post(
        f"/v1/approvals/{appr['id']}/decide",
        headers=auth_h(admin["access_token"]),
        json={"approve": True},
    )
    assert first.status_code == 200
    again = await client.post(
        f"/v1/approvals/{appr['id']}/decide",
        headers=auth_h(admin["access_token"]),
        json={"approve": True},
    )
    assert again.status_code == 409
