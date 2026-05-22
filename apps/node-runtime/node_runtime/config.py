from pydantic_settings import BaseSettings, SettingsConfigDict


class NodeSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ws_url: str = "ws://localhost:8800/ws/node"
    node_id: str = ""
    node_token: str = ""
    heartbeat_interval_s: float = 5.0
    allow_exec: bool = False  # never True without explicit op acknowledgment


def settings() -> NodeSettings:
    return NodeSettings()
