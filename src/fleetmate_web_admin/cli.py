"""fmwsctl: both studios' commands, as `fmwsctl munki …` and `fmwsctl cimian …`,
plus commands for the combined deployment."""

from typing import Annotated

import typer
from cimian_web_studio.cli import cli as cimian_cli
from munki_web_studio.cli import cli as munki_cli

from fleetmate_web_admin import __version__
from fleetmate_web_admin.studios import installed

cli = typer.Typer(
    help="FleetMate Web Admin: Munki Web Studio and Cimian Web Studio together.",
    no_args_is_help=True,
)
cli.add_typer(munki_cli, name="munki", help="Munki Web Studio's commands (mwsctl).")
cli.add_typer(cimian_cli, name="cimian", help="Cimian Web Studio's commands (cwsctl).")


def _version(value: bool) -> None:
    if value:
        typer.echo(f"fmwsctl {__version__}")
        for key, studio_version in installed().items():
            typer.echo(f"  {key} {studio_version}")
        raise typer.Exit


@cli.callback()
def main_callback(
    version: Annotated[
        bool,
        typer.Option("--version", callback=_version, is_eager=True, help="Print versions."),
    ] = False,
) -> None:
    """Run the combined admin, or either studio's commands."""


@cli.command()
def serve(
    host: Annotated[str, typer.Option(help="Address to bind.")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="Port to listen on.")] = 3190,
) -> None:
    """Run the FleetMate host app."""
    import uvicorn

    from fleetmate_web_admin.app import create_app

    uvicorn.run(create_app(), host=host, port=port)


def main() -> None:
    cli()
