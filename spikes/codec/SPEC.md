# Codec spike

Decides the FleetMate backend language by testing how well each candidate reads
and writes Munki and Cimian repository files. See `docs/architecture.md`, Stack.

## Candidates

| Candidate         | Directory               | Suggested libraries                                      |
| ----------------- | ----------------------- | -------------------------------------------------------- |
| Python            | `candidates/python`     | `plistlib`, `ruamel.yaml`                                |
| .NET              | `candidates/dotnet`     | YamlDotNet, a plist library such as Claunia.PropertyList |
| TypeScript (Node) | `candidates/typescript` | `yaml` (Document API), a plist and binary plist library  |

Pin every dependency with a lockfile. Prefer maintained, widely used libraries.

## Fixtures

`fixtures/munki/` and `fixtures/cimian/`, all invented. Never edit them; copy to
a temporary directory before writing. `fixtures/make_munki_fixtures.py`
regenerates the Munki plists.

## Tests, per fixture

1. **Parse.** Read the file. Check the types that matter:
   - `version` (and nested receipt/installs versions) stay strings: `"2.10"`, not `2.1`.
   - `installed_size` is exactly `9007199254740993` (above 2^53).
   - Munki plists: `_metadata.creation_date` is a date, `icon_data` is bytes.
   - Booleans stay booleans; `x_unknown_site_key` survives with its nested values.
2. **Rewrite without edits.** Serialize the parsed document. Byte-identical? If
   not, count changed lines in a unified diff.
3. **One edit.** Pkginfo: set `display_name` to `Example Editor Pro` (or the
   matching name in that fixture). Manifest: append `ExampleExtra` to
   `managed_installs`. Write and count changed lines. Ideal: 2 for a value
   change (one removed, one added), 1 for an append.
4. **Comments.** For YAML and the hand-formatted plist, do comments survive step 3?
5. **Surgical edit option.** If library re-serialization fails 2 or 3, can the
   library give source positions so the adapter patches only the changed bytes?
   Try it for the YAML and plist value edit and report the result.
6. **Lossless JSON.** Can the parsed document be sent to a browser as JSON with
   dates, bytes, and large integers tagged, and read back unchanged?

## Output

- `candidates/<name>/`: the harness, a lockfile, and a `README.md` with the exact
  run command.
- `results/<name>.json`: one entry per fixture per test, with `pass`, `detail`,
  and changed-line counts.
- `results/<name>.md`: one short page: what passed, what failed, what extra code
  the adapter would need, and library versions and licenses.

Do not change anything outside `spikes/codec/candidates/<name>/` and
`spikes/codec/results/<name>.*`.
