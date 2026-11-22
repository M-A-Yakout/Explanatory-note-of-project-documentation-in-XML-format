from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"
    rate_limit_enabled: bool = True
    database_url: str = "postgresql+psycopg://pz:pz@localhost:5432/pz"
    secret_key: str = "change-me-in-production"
    cors_origins: list[str] = ["http://localhost:5173"]
    frontend_url: str = "http://localhost:5173"
    max_xml_mb: int = 20

    access_token_minutes: int = 60 * 8
    reset_token_minutes: int = 60
    confirm_token_minutes: int = 60 * 24
    # When False (dev default) new accounts are active immediately.
    # When True, login is blocked until the e-mail link is opened.
    require_email_confirmation: bool = False

    seed_admin_email: str = "admin@inpad.ru"
    seed_admin_password: str = "ChangeMe2026"

    @model_validator(mode="after")
    def _production_must_be_hardened(self):
        """Refuses to start in production with the development defaults (a guessable JWT key = forged sessions)."""
        if self.environment != "production":
            return self
        problems = []
        if self.secret_key == "change-me-in-production" or len(self.secret_key) < 32:
            problems.append("SECRET_KEY: задайте случайную строку не короче 32 символов")
        weak = len(self.seed_admin_password) < 10 or self.seed_admin_password == "ChangeMe2026"
        if weak:
            problems.append("SEED_ADMIN_PASSWORD: задайте свой пароль (не короче 10 символов, не значение по умолчанию)")
        if not self.rate_limit_enabled:
            problems.append("RATE_LIMIT_ENABLED нельзя отключать в production")
        if problems:
            raise ValueError("Небезопасная конфигурация production: " + "; ".join(problems))
        return self


settings = Settings()
