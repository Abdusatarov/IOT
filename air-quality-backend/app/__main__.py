import uvicorn
from .config import Settings

settings = Settings()
uvicorn.run('app.main:app', host=settings.host, port=settings.port)
