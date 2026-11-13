from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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


settings = Settings()
