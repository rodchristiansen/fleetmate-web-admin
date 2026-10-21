# Codec spike results: Python

Python 3.14.7, `plistlib` (standard library, PSF licence) and `ruamel.yaml`
0.19.1 (MIT) in round-trip mode, locked with uv. Raw results are in
`python.json`; the harness is in `candidates/python/`.

| Fixture                     | 1 Parse | 2 Rewrite       | 3 Edit          | 4 Comments | 5 Surgical | 6 JSON |
| --------------------------- | ------- | --------------- | --------------- | ---------- | ---------- | ------ |
| munki/pkginfo-plistlib      | pass    | pass, 0 lines   | pass, 2 lines   | n/a        | pass, 2    | pass   |
| munki/pkginfo-binary        | pass    | pass, identical | pass (semantic) | n/a        | n/a        | pass   |
| munki/pkginfo-handformatted | pass    | **fail, 55**    | **fail, 55**    | **fail**   | pass, 2    | pass   |
| munki/manifest-plistlib     | pass    | pass, 0 lines   | pass, 1 line    | n/a        | pass, 1    | pass   |
| munki/pkginfo.yaml          | pass    | pass, 0 lines   | pass, 2 lines   | pass       | pass, 2    | pass   |
| cimian/pkginfo.yaml         | pass    | pass, 0 lines   | pass, 2 lines   | pass       | pass, 2    | pass   |
| cimian/manifest.yaml        | pass    | pass, 0 lines   | pass, 1 line    | pass       | pass, 1    | pass   |

## What passed

- **Types.** `"2.10"` and the nested versions stay strings. `installed_size`
  stays exactly 9007199254740993, because Python integers have no size limit.
  Dates load as dates, `icon_data` as bytes, and booleans as booleans.
  `x_unknown_site_key` keeps its int, real and string.
- **plistlib-written XML and binary plists** rewrite byte for byte, and a
  library edit changes only the ideal number of lines. An XML plist from
  Apple's `plutil -convert xml1` also rewrites with 0 changed lines.
- **YAML.** All three files rewrite byte for byte. Edits change 2 lines, or 1
  for an append. Every comment survives, including the inline
  `# quoted: must stay a string` and `# all lab machines`, along with the blank
  lines, the flow list `[x64, arm64]` and the single-quoted Windows path.

## What failed

- **The hand-formatted plist.** plistlib discards XML comments and always writes
  tab indentation. Rewriting this 34-line file produces 55 changed lines (removed plus added), and the
  `<!-- Edited by hand -->` comment is lost.
- **The YAML results depend on configuration.** They need
  `preserve_quotes=True`, `indent(mapping=2, sequence=4, offset=2)` and
  `width=4096`. With the library defaults, the same files change 6, 24 and 24
  lines. ruamel applies one indent setting to the whole document, so a file in
  a different style is reflowed even when tuned. A probe found these changes:
  - `key:\n- item` (sequence offset 0) changed 4 lines.
  - A file mixing sequence styles changed 2 lines.
  - A 4-space mapping changed 6 lines.
  - `~` and `null` were rewritten as empty values.
  - A missing final newline was added.
- **plistlib sorts keys unless told not to.** With its default
  `sort_keys=True`, the plistlib fixtures change 54 and 20 lines. The adapter
  must always pass `sort_keys=False`.
- **Unquoted `version: 2.10` in YAML loads as the float 2.1.** ruamel writes it
  back as `2.10`, so the text survives, but the value is wrong. The model layer
  has to reject or flag this. It is not a bug in the library.
- **Binary plists cannot be diffed by line.** An edit rewrites the offset
  tables, here 456 bytes, but the result parses back exactly as expected.

## Extra adapter code needed

All of it is in `candidates/python/codec.py`.

1. **Surgical YAML edits, about 60 lines.** ruamel's `lc.value(key)` and
   `lc.item(i)` give the line and column of each value. The adapter scans the
   scalar token (plain, single- or double-quoted), keeps its quote style, and
   writes a new value only where it reparses to the same string. A sequence
   append copies the last item's dash indentation. The edits change 2 and 1
   lines. Block scalars, flow collections and nested-node appends are not
   handled yet.
2. **Surgical XML plist edits, about 65 lines.** This is a span-tracking tag
   scanner. It skips comments, the doctype and the XML declaration, and records
   start, inner and end offsets for each element. The adapter replaces the
   inner text of `<string>`, or inserts a sibling with the last child's
   indentation. The hand-formatted plist goes from 55 changed lines to 2, and
   its comment survives. Every patch is checked by reparsing with plistlib and
   comparing against the edited model.
3. **Tagged JSON, about 50 lines.** The adapter sends these values as tagged
   objects:
   - dates, as `{"$type":"date"}`
   - bytes, as `"data"` (base64)
   - integers above 2^53−1, as `"int"` (a decimal string)
   - every real, as `"real"`, so that `2.0` is not read back as an integer
   - dicts, as ordered `"dict"` pairs, because JavaScript reorders keys that
     look like integers

   All seven documents pass through Node's `JSON.parse` and `JSON.stringify`
   and come back with the same values, types and key order. As a control, an
   untagged `installed_size` comes back as 9007199254740992.

The design to adopt is to edit the model, compute the field-level change, and
apply it surgically with a reparse check. Fall back to full re-serialization
only for binary plists, or when a surgical patch cannot be placed.
