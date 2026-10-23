from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'sqlite:///./air_quality.db'
    host: str = '0.0.0.0'
    port: int = 8000
    api_key: str | None = None
    cors_origins: list[str] = []
