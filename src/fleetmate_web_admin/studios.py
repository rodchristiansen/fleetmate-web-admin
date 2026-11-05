"""The two studios FleetMate hosts, and what each installed package reports."""

from dataclasses import dataclass
from importlib.metadata import version


@dataclass(frozen=True)
class HostedStudio:
    key: str
    package: str
    distribution: str


STUDIOS = (
    HostedStudio("munki", "munki_web_studio", "munki-web-studio"),
    HostedStudio("cimian", "cimian_web_studio", "cimian-web-studio"),
)


def installed() -> dict[str, str]:
    """Each studio's installed version."""
    return {s.key: version(s.distribution) for s in STUDIOS}
