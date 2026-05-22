import os
from openai import AsyncOpenAI


def llm_client() -> AsyncOpenAI:
    """LiteLLM-compatible OpenAI client. Routes through the gateway.
    Never import vendor SDKs directly — keep model-independence."""
    return AsyncOpenAI(
        base_url=os.environ.get("LITELLM_URL", "http://litellm:4000"),
        api_key=os.environ.get("LITELLM_MASTER_KEY", "sk-buildagent-master"),
    )
