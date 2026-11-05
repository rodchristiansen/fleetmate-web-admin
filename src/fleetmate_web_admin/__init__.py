"""FleetMate Web Admin: hosts Munki Web Studio and Cimian Web Studio together."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("fleetmate-web-admin")
except PackageNotFoundError:  # pragma: no cover - running from a source tree
    __version__ = "0.0.0"

__all__ = ["__version__"]
