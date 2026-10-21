# Codec spike: Python

`plistlib` (standard library) and `ruamel.yaml` 0.19.1 in round-trip mode,
pinned in `uv.lock`. `codec.py` is the adapter; `run.py` runs the SPEC.md tests
against copies of the fixtures in a temporary directory and writes
`../../results/python.json`. Test 6 pipes the JSON through `node`, so Node must
be on `PATH`.

Run from this directory:

```
uv run --locked --python 3.14 python -I run.py
```

Add `--keep` to copy the edited and surgically patched files into `out/` for
inspection.
