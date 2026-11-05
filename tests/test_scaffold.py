from fastapi.testclient import TestClient
from typer.testing import CliRunner

from fleetmate_web_admin.app import create_app
from fleetmate_web_admin.cli import cli

runner = CliRunner()


def test_fmwsctl_lists_both_studios() -> None:
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "munki" in result.stdout and "cimian" in result.stdout


def test_each_studio_s_commands_run_under_fmwsctl() -> None:
    munki = runner.invoke(cli, ["munki", "--help"])
    cimian = runner.invoke(cli, ["cimian", "--help"])
    assert munki.exit_code == 0 and "serve" in munki.stdout
    assert cimian.exit_code == 0 and "serve" in cimian.stdout


def test_version_reports_both_studios() -> None:
    result = runner.invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert "munki 0.1.0" in result.stdout and "cimian 0.1.0" in result.stdout


def test_health_reports_the_hosted_studios() -> None:
    with TestClient(create_app()) as client:
        body = client.get("/api/health").json()
    assert body["status"] == "ok" and set(body["studios"]) == {"munki", "cimian"}
