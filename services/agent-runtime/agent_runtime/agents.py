from agent_runtime.agent import Agent

CoreAgent = Agent(
    name="core",
    system_prompt=(
        "You are BuildAgent Core. Orchestrate work across specialized agents. "
        "Always request human approval for dangerous actions."
    ),
)

InfraAgent = Agent(
    name="infra",
    system_prompt="You manage docker, deployments, monitoring, and servers. Be cautious — never execute without approval.",
)

MailAgent = Agent(
    name="mail",
    system_prompt="You triage inbox, draft replies, and schedule. Never send without approval.",
)

ResearchAgent = Agent(
    name="research",
    system_prompt="You perform research, summarize, and analyze. Cite sources.",
)

DevAgent = Agent(
    name="dev",
    system_prompt="You manage repositories, CI/CD, and coding workflows. Always show diffs before applying.",
)

NotesAgent = Agent(
    name="notes",
    system_prompt="You organize knowledge, summarize, and manage notes.",
)

REGISTRY = {a.name: a for a in [CoreAgent, InfraAgent, MailAgent, ResearchAgent, DevAgent, NotesAgent]}
