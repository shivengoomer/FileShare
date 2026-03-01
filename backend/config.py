from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent / ".env",
        env_file_encoding="utf-8",
        env_file_required=False,   # .env is optional; system env vars always work
        case_sensitive=False,
    )

    DATABASE_URL: str = "postgresql+asyncpg://fileshare:fileshare@localhost:5432/fileshare"
    SECRET_KEY: str = "change-me"
    ROOM_EXPIRY_MINUTES: int = 30
    MAX_FILE_SIZE_MB: int = 100
    UPLOAD_DIR: str = "./uploads"
    CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return json.loads(self.CORS_ORIGINS)


@lru_cache
def get_settings() -> Settings:
    return Settings()
