from agent_runtime.agent import Agent
from agent_runtime.skill_tools import load_skill_tools


def _safe_load(allow: list[str] | None = None) -> list:
    try:
        return load_skill_tools(allow=allow)
    except Exception:
        return []


CoreAgent = Agent(
    name="core",
    system_prompt=(
        "You are BuildAgent Core. Orchestrate work using available tools. "
        "Prefer the smallest tool that solves the task. "
        "Tools marked dangerous (filesystem write/delete, docker, ssh, send_email) "
        "require human approval — the system will pause for confirmation."
    ),
    tools=_safe_load(),
)

InfraAgent = Agent(
    name="infra",
    system_prompt=(
        "You manage docker, deployments, monitoring, and servers. "
        "Inspect before mutating. Never destroy state without explicit user intent."
    ),
    tools=_safe_load(allow=["docker", "ssh", "proxmox", "filesystem"]),
)

MailAgent = Agent(
    name="mail",
    system_prompt="You triage inbox, draft replies, and schedule. Never send without approval.",
    tools=_safe_load(allow=["gmail", "calendar"]),
)

ResearchAgent = Agent(
    name="research",
    system_prompt="You perform research, summarize, and analyze. Cite sources.",
    tools=_safe_load(allow=["notes"]),
)

DevAgent = Agent(
    name="dev",
    system_prompt="You manage repositories, CI/CD, and coding workflows. Always show diffs before applying.",
    tools=_safe_load(allow=["filesystem", "ssh", "docker"]),
)

NotesAgent = Agent(
    name="notes",
    system_prompt="You organize knowledge, summarize, and manage notes.",
    tools=_safe_load(allow=["notes"]),
)

MessengerAgent = Agent(
    name="messenger",
    system_prompt="You send/receive messages via Slack, Telegram, WhatsApp. Confirm recipient and content before sending.",
    tools=_safe_load(allow=["slack", "telegram", "whatsapp"]),
)

REGISTRY = {
    a.name: a for a in [
        CoreAgent, InfraAgent, MailAgent, ResearchAgent, DevAgent, NotesAgent, MessengerAgent
    ]
}
