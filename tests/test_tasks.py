"""Task lifecycle: create, approval flow, cancel."""
from tests.conftest import auth_h


async def test_viewer_cannot_create_task(client, user):
    # Fresh users default to viewer role.
    res = await client.post(
        "/v1/tasks",
        headers=auth_h(user["access_token"]),
        json={"title": "viewer attempt", "kind": "command", "payload": {"cmd": ["echo", "hi"]}},
    )
    assert res.status_code in (401, 403)


async def test_admin_skill_task_skipped_approval(client, admin):
    """Admin invoking a non-approval-required skill -> immediate queued, no Approval row."""
    res = await client.post(
        "/v1/tasks",
        headers=auth_h(admin["access_token"]),
        json={"title": "list notes", "kind": "skill", "payload": {"name": "notes", "payload": {"op": "list"}}},
    )
    assert res.status_code == 201, res.text
    task = res.json()
    assert task["kind"] == "skill"
    assert task["state"] in {"queued", "running", "completed", "failed"}


async def test_admin_command_task_requires_approval(client, admin):
    """Command kind is in APPROVAL_REQUIRED_KINDS; should create Approval row."""
    res = await client.post(
        "/v1/tasks",
        headers=auth_h(admin["access_token"]),
        json={"title": "rm test", "kind": "command", "payload": {"cmd": ["echo", "hi"]}},
    )
    assert res.status_code == 201, res.text
    task = res.json()
    assert task["state"] == "waiting_approval"

    appr = await client.get("/v1/approvals", headers=auth_h(admin["access_token"]))
    assert appr.status_code == 200
    pending = [a for a in appr.json() if a.get("task_id") == task["id"]]
    assert len(pending) == 1
    assert pending[0]["state"] == "pending"


async def test_cancel_task(client, admin):
    res = await client.post(
        "/v1/tasks",
        headers=auth_h(admin["access_token"]),
        json={"title": "cancel me", "kind": "command", "payload": {"cmd": ["echo", "x"]}},
    )
    task = res.json()
    cancel = await client.post(f"/v1/tasks/{task['id']}/cancel", headers=auth_h(admin["access_token"]))
    assert cancel.status_code == 200
    assert cancel.json()["state"] == "cancelled"
