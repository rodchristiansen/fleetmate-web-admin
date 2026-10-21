"""Run the codec spike tests (SPEC.md) for the Python candidate."""

from __future__ import annotations

import datetime as dt
import difflib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import codec  # noqa: E402

SPIKE = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = SPIKE / "fixtures"
RESULTS = SPIKE / "results" / "python.json"

# path, kind, role, new display_name
CASES = [
    ("munki/pkginfo-plistlib.plist", "xml", "pkginfo", "Example Editor Pro"),
    ("munki/pkginfo-binary.plist", "bplist", "pkginfo", "Example Editor Pro"),
    ("munki/pkginfo-handformatted.plist", "xml", "pkginfo", "Example Viewer Pro"),
    ("munki/manifest-plistlib.plist", "xml", "manifest", None),
    ("munki/pkginfo.yaml", "yaml", "pkginfo", "Example CLI Pro"),
    ("cimian/pkginfo.yaml", "yaml", "pkginfo", "Example Editor Pro"),
    ("cimian/manifest.yaml", "yaml", "manifest", None),
]
BIG = 9007199254740993
BOOL_KEYS = {"unattended_install", "unattended_uninstall", "uninstallable", "optional"}


def changed_lines(a: bytes, b: bytes) -> int:
    diff = difflib.unified_diff(
        a.decode().splitlines(), b.decode().splitlines(), lineterm="", n=0
    )
    return sum(1 for l in diff if l[:1] in "+-" and not l.startswith(("+++", "---")))


def walk(x, path="$"):
    yield path, x
    if isinstance(x, dict):
        for k, v in x.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from walk(v, f"{path}[{i}]")


def check_types(doc, rel, kind, role) -> list[str]:
    bad = []
    for path, v in walk(doc):
        key = path.rsplit(".", 1)[-1]
        if key in ("version", "minimum_os_version") and codec.kind_of(v) != "str":
            bad.append(f"{path} is {codec.kind_of(v)}")
        if key in BOOL_KEYS and codec.kind_of(v) != "bool":
            bad.append(f"{path} is {codec.kind_of(v)}")
    if role == "manifest":
        mi = doc.get("managed_installs")
        if not (isinstance(mi, list) and all(isinstance(s, str) for s in mi)):
            bad.append("managed_installs not a list of strings")
        if "conditional_items" not in doc:
            bad.append("conditional_items missing")
        return bad
    if "installed_size" in doc:
        v = doc["installed_size"]
        if codec.kind_of(v) != "int" or v != BIG:
            bad.append(f"installed_size {v!r}")
    if kind != "yaml" and "handformatted" not in rel:
        if codec.kind_of(doc["_metadata"]["creation_date"]) != "date":
            bad.append("creation_date not a date")
        if codec.kind_of(doc["icon_data"]) != "bytes":
            bad.append("icon_data not bytes")
    if "handformatted" not in rel:
        x = doc.get("x_unknown_site_key")
        want = (
            "keep-me" if rel == "munki/pkginfo.yaml" else {"nested": [1, 2.5, "three"]}
        )
        if r := codec.strict_equal(want, x):
            bad.append(f"x_unknown_site_key: {r}")
    return bad


def edit_model(doc, role, new_name):
    if role == "manifest":
        doc["managed_installs"].append("ExampleExtra")
    else:
        doc["display_name"] = new_name


def surgical(kind, text, doc, role, new_name) -> str:
    if kind == "yaml":
        if role == "manifest":
            return codec.yaml_append_scalar(
                text, doc, "managed_installs", "ExampleExtra"
            )
        return codec.yaml_set_scalar(text, doc, "display_name", new_name)
    if role == "manifest":
        return codec.plist_append_string(text, "managed_installs", "ExampleExtra")
    return codec.plist_set_string(text, "display_name", new_name)


def node_roundtrip(s: str) -> str:
    js = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s))))"
    return subprocess.run(
        ["node", "-e", js], input=s, capture_output=True, text=True, check=True
    ).stdout


def comment_lines(text: str, kind: str) -> list[str]:
    mark = "#" if kind == "yaml" else "<!--"
    return [l.strip() for l in text.splitlines() if mark in l]


def run_case(work: pathlib.Path, rel, kind, role, new_name) -> list[dict]:
    out = []

    def rec(test, ok, detail, **extra):
        out.append(
            {"fixture": rel, "test": test, "pass": ok, "detail": detail, **extra}
        )

    src = work / rel
    orig = src.read_bytes()
    text_kind = kind != "bplist"
    ideal = 1 if role == "manifest" else 2

    # 1. Parse
    doc = codec.load(kind, orig)
    bad = check_types(doc, rel, kind, role)
    rec(1, not bad, "; ".join(bad) or "types preserved")

    # 2. Rewrite without edits
    rewritten = codec.dump(kind, doc)
    same = rewritten == orig
    if text_kind:
        n = changed_lines(orig, rewritten)
        n_default = changed_lines(
            orig, codec.dump(kind, codec.load(kind, orig), tuned=False)
        )
        cfg = (
            "preserve_quotes, indent(2,4,2), width 4096"
            if kind == "yaml"
            else "sort_keys=False"
        )
        rec(
            2,
            same,
            f"byte-identical={same}; {n} changed lines with {cfg}; "
            f"{n_default} with library defaults",
            changed_lines=n,
            changed_lines_library_defaults=n_default,
        )
    else:
        rec(2, same, f"byte-identical={same} (sort_keys=False)", changed_lines=None)

    # 3. One edit through the library
    expected = codec.load(kind, orig)
    edit_model(expected, role, new_name)
    edited = codec.load(kind, orig)
    edit_model(edited, role, new_name)
    out_path = work / (rel + ".edited")
    out_path.write_bytes(codec.dump(kind, edited))
    written = out_path.read_bytes()
    sem = codec.strict_equal(expected, codec.load(kind, written))
    if text_kind:
        n = changed_lines(orig, written)
        rec(
            3,
            sem is None and n == ideal,
            f"{n} changed lines (ideal {ideal}); reparse {'matches' if sem is None else sem}",
            changed_lines=n,
        )
    else:
        nbytes = sum(a != b for a, b in zip(orig, written)) + abs(
            len(orig) - len(written)
        )
        rec(
            3,
            sem is None,
            f"reparse {'matches' if sem is None else sem}; binary offsets shift, "
            f"{nbytes} bytes differ (binary plists are not line-diffable)",
            changed_lines=None,
            changed_bytes=nbytes,
        )

    # 4. Comments survive step 3
    if kind == "yaml" or "handformatted" in rel:
        want = comment_lines(orig.decode(), kind)
        have = {l.strip() for l in written.decode().splitlines()}
        lost = [c for c in want if c not in have]
        rec(
            4,
            not lost,
            f"{len(want) - len(lost)}/{len(want)} comment-bearing lines kept"
            + (f"; lost: {lost}" if lost else ""),
        )
    else:
        rec(4, None, "n/a: no comments in fixture")

    # 5. Surgical edit from source positions
    if text_kind:
        text = orig.decode()
        try:
            patched = surgical(
                kind, text, codec.load(kind, orig), role, new_name
            ).encode()
            (work / (rel + ".surgical")).write_bytes(patched)
            n = changed_lines(orig, patched)
            sem = codec.strict_equal(expected, codec.load(kind, patched))
            how = (
                "ruamel lc line/col + token scan"
                if kind == "yaml"
                else "span-tracking XML tag scan"
            )
            rec(
                5,
                sem is None and n == ideal,
                f"{how}: {n} changed lines (ideal {ideal}); reparse "
                f"{'matches' if sem is None else sem}",
                changed_lines=n,
            )
        except Exception as e:  # report, don't hide
            rec(5, False, f"surgical edit failed: {e!r}")
    else:
        rec(
            5,
            None,
            "n/a: binary rewrite is byte-identical; edits rewrite offsets by design",
        )

    # 6. Lossless tagged JSON through a real JS JSON.parse/stringify
    wire = json.dumps(codec.to_tagged(doc))
    back = codec.from_tagged(json.loads(node_roundtrip(wire)))
    r = codec.strict_equal(doc, back)
    naive = ""
    if "installed_size" in doc:
        plain = json.loads(
            node_roundtrip(json.dumps({"n": int(doc["installed_size"])}))
        )["n"]
        naive = f"; untagged control: installed_size comes back {plain}"
    rec(
        6,
        r is None,
        ("tagged JSON round-trips through node unchanged" if r is None else r) + naive,
    )
    return out


def main():
    results = []
    with tempfile.TemporaryDirectory(prefix="codec-py-") as tmp:
        work = pathlib.Path(tmp)
        shutil.copytree(FIXTURES / "munki", work / "munki")
        shutil.copytree(FIXTURES / "cimian", work / "cimian")
        for case in CASES:
            results.extend(run_case(work, *case))
        if "--keep" in sys.argv:
            keep = pathlib.Path(__file__).parent / "out"
            shutil.rmtree(keep, ignore_errors=True)
            shutil.copytree(work, keep)
    meta = {
        "candidate": "python",
        "python": sys.version.split()[0],
        "ruamel.yaml": __import__("ruamel.yaml").yaml.__version__,
        "generated": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
    }
    RESULTS.write_text(json.dumps({"meta": meta, "results": results}, indent=2) + "\n")
    for r in results:
        mark = {True: "PASS", False: "FAIL", None: "n/a "}[r["pass"]]
        print(f"{mark}  {r['fixture']:36} t{r['test']}  {r['detail']}")


if __name__ == "__main__":
    main()
