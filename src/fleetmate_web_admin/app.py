"""The host app. For now it reports what it hosts; mounting the studios under
/munki and /cimian follows once both expose the hosting surface (F02)."""

from fastapi import FastAPI
from pydantic import BaseModel

from fleetmate_web_admin import __version__
from fleetmate_web_admin.studios import installed


class Health(BaseModel):
    status: str
    name: str
    version: str
    studios: dict[str, str]


def create_app() -> FastAPI:
    app = FastAPI(title="FleetMate Web Admin", version=__version__)

    @app.get("/api/health")
    def health() -> Health:  # pyright: ignore[reportUnusedFunction]
        return Health(
            status="ok", name="FleetMate Web Admin", version=__version__, studios=installed()
        )

    return app
