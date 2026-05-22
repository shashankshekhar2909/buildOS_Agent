from tests.conftest import auth_h


async def test_skills_list(client, user):
    res = await client.get("/v1/skills", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    skills = res.json()
    names = {s["name"] for s in skills}
    expected = {"docker", "filesystem", "ssh", "proxmox", "gmail", "calendar", "notes",
                "slack", "telegram", "whatsapp", "memory"}
    assert expected.issubset(names), f"missing skills: {expected - names}"


async def test_skill_lookup_by_name(client, user):
    res = await client.get("/v1/skills/whatsapp", headers=auth_h(user["access_token"]))
    assert res.status_code == 200
    assert res.json()["name"] == "whatsapp"


async def test_skill_lookup_unknown_404(client, user):
    res = await client.get("/v1/skills/no-such-skill", headers=auth_h(user["access_token"]))
    assert res.status_code == 404
