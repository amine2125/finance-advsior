"""Validated environment configuration. Every deploy-specific value comes from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> None:
    """Local convenience: read KEY=VALUE lines from the repo's .env without overriding real environment variables."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip().strip('"').strip("'")
        if k.strip() and v:
            os.environ.setdefault(k.strip(), v)


if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):  # never on AWS: Lambda gets its config from the stack
    _load_dotenv(REPO_ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int, lo: int, hi: int) -> int:
    raw = os.getenv(name)
    value = int(raw) if raw not in (None, "") else default
    if not lo <= value <= hi:
        raise ValueError(f"{name}={value} outside allowed range [{lo}, {hi}]")
    return value


@dataclass(frozen=True)
class Settings:
    app_name: str
    env: str
    data_dir: Path
    data_s3_bucket: str | None
    data_s3_prefix: str
    storage_backend: str
    dynamodb_table: str | None
    local_store_dir: Path
    aws_region: str
    bedrock_region: str
    agent_model_id: str
    supervisor_model_id: str
    llm_enabled: bool
    llm_timeout_s: int
    agent_max_tokens: int
    supervisor_max_tokens: int
    max_debate_rounds: int
    job_runner: str
    worker_function_name: str | None
    web_research_enabled: bool
    sec_user_agent: str
    provider_secret_arn: str | None
    alert_sns_topic_arn: str | None
    cors_origins: list[str] = field(default_factory=list)
    live_mode_enabled: bool = False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    storage = os.getenv("AEGIS_STORAGE_BACKEND", "local")
    if storage not in {"local", "dynamodb"}:
        raise ValueError("AEGIS_STORAGE_BACKEND must be 'local' or 'dynamodb'")
    runner = os.getenv("AEGIS_JOB_RUNNER", "thread")
    if runner not in {"thread", "lambda", "inline"}:
        raise ValueError("AEGIS_JOB_RUNNER must be 'thread', 'lambda' or 'inline'")
    table = os.getenv("AEGIS_DYNAMODB_TABLE")
    if storage == "dynamodb" and not table:
        raise ValueError("AEGIS_DYNAMODB_TABLE is required when AEGIS_STORAGE_BACKEND=dynamodb")
    max_rounds = _int("AEGIS_MAX_DEBATE_ROUNDS", 2, 1, 2)
    return Settings(
        app_name=os.getenv("AEGIS_APP_NAME", "AEGIS"),
        env=os.getenv("AEGIS_ENV", "local"),
        data_dir=Path(os.getenv("AEGIS_DATA_DIR", str(REPO_ROOT / "data" / "active"))),
        data_s3_bucket=os.getenv("AEGIS_DATA_BUCKET") or None,
        data_s3_prefix=os.getenv("AEGIS_DATA_PREFIX", "datasets/active/"),
        storage_backend=storage,
        dynamodb_table=table,
        local_store_dir=Path(os.getenv("AEGIS_LOCAL_STORE", str(REPO_ROOT / "backend" / ".localdata"))),
        aws_region=os.getenv("AWS_REGION", "us-east-1"),
        bedrock_region=os.getenv("AEGIS_BEDROCK_REGION", os.getenv("AWS_REGION", "us-east-1")),
        agent_model_id=os.getenv("AEGIS_AGENT_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
        supervisor_model_id=os.getenv("AEGIS_SUPERVISOR_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"),
        llm_enabled=_bool("AEGIS_LLM_ENABLED", True),
        llm_timeout_s=_int("AEGIS_LLM_TIMEOUT_S", 60, 5, 300),
        agent_max_tokens=_int("AEGIS_AGENT_MAX_TOKENS", 2600, 200, 6000),
        supervisor_max_tokens=_int("AEGIS_SUPERVISOR_MAX_TOKENS", 5000, 300, 8000),
        max_debate_rounds=max_rounds,
        job_runner=runner,
        worker_function_name=os.getenv("AEGIS_WORKER_FUNCTION") or None,
        web_research_enabled=_bool("AEGIS_WEB_RESEARCH_ENABLED", True),
        sec_user_agent=os.getenv("AEGIS_SEC_USER_AGENT", "AEGIS datathon prototype aegis-demo@example.org"),
        provider_secret_arn=os.getenv("AEGIS_PROVIDER_SECRET_ARN") or None,
        alert_sns_topic_arn=os.getenv("AEGIS_ALERT_TOPIC_ARN") or None,
        cors_origins=[o.strip() for o in os.getenv("AEGIS_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
        live_mode_enabled=_bool("AEGIS_LIVE_MODE", False),
    )
