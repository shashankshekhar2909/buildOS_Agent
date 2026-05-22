from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    database_url: str = "postgresql+asyncpg://buildagent:buildagent@localhost:5432/buildagent"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me-in-prod"
    jwt_alg: str = "HS256"
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 30

    node_token: str = "change-me-node-shared-secret"
    internal_service_token: str = "change-me-internal-service-token"
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""

    litellm_url: str = "http://localhost:4000"
    litellm_master_key: str = "sk-buildagent-master"

    cors_origins_raw: str = Field(default="http://127.0.0.1:3300", alias="CORS_ORIGINS")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
