# Codec spike: TypeScript on Node

Node v26.8.1, run with `node src/run.ts` (built-in type stripping). The full
per-test results and diffs are in `typescript.json`.

## Results

Changed-line counts come from a real `diff -U0`. The ideal is 0 for test 2,
2 for a value edit and 1 for an append. "Surgical" means patching source
spans, not re-serializing.

| Fixture                           | 1 Parse                            | 2 Rewrite                 | 3 Edit                 | 4 Comments              | 5 Surgical | 6 JSON |
| --------------------------------- | ---------------------------------- | ------------------------- | ---------------------- | ----------------------- | ---------- | ------ |
| munki/pkginfo-plistlib.plist      | adapter pass; `plist` fail         | adapter 0; libs 72–128    | adapter 2; libs 72–128 | n/a                     | pass, 2    | pass   |
| munki/pkginfo-handformatted.plist | pass                               | fail: 25–59               | fail: 27–59            | fail when re-serialized | pass, 2    | pass   |
| munki/manifest-plistlib.plist     | pass                               | adapter 0; libs 31–58     | adapter 1; libs 31–59  | n/a                     | pass, 1    | pass   |
| munki/pkginfo-binary.plist        | `bplist-parser` pass; `plist` fail | `bplist-*` byte-identical | `bplist-*` 2           | n/a                     | n/a        | pass*  |
| munki/pkginfo.yaml                | pass                               | pass, 0                   | pass, 2                | pass                    | pass, 2    | pass   |
| cimian/pkginfo.yaml               | **fail**: hash read as `0n`        | fail, 2 (best)            | fail, 4 (best)         | text kept, spacing lost | pass, 2    | pass†  |
| cimian/manifest.yaml              | pass                               | fail, 2                   | fail, 3                | text kept, spacing lost | pass, 1    | pass   |

\* An integral binary `<real>` cannot be told apart from an integer, so the adapter has to guess.
† The JSON round-trips exactly, but it carries the wrong `hash` value from test 1.

## What failed, precisely

**XML plist libraries.** No npm library writes plistlib's layout, and every
one drops XML comments.

- `plist@5.0.0` reads `<integer>` with `parseInt`, so `9007199254740993`
  becomes `…992` in both XML and binary. Precision is lost silently.
- `@plist/xml.parse@1.1.0` keeps the large integer as a bigint, but its
  fast-xml-parser setup trims string values: `postinstall_script` loses its
  trailing newline. `xml.serialize` writes the whole document on one line.
  The package depends on fast-xml-parser 4.5.7, which `npm audit` flags as
  moderate (GHSA-gh4j-gqv2-49f6, no fix in 4.x).
- Every JS plist library maps both `<integer>` and `<real>` to `number`.
  A `<real>1.0</real>` is written back as `<integer>1</integer>`.

**YAML (`yaml@2.9.1`).** The comments survive, the `"2.10"` quote style is
kept through a node-level edit, and the block scalars are untouched. The
problems:

- `hash: 0000…0000` resolves to the int `0` under YAML 1.2 core and is written
  back as `hash: 0`. This corrupts data. A source-preserving int/float tag in
  the adapter (about 25 lines) fixes the write, but `toJS()` still reports `0n`,
  so the Cimian codec needs a schema rule that reads `hash` as a string.
- The spaces before an inline comment collapse to one
  (`"2.10"   # …` becomes `"2.10" # …`), and the library cannot keep them.
- Defaults add flow padding (`[x64, arm64]` becomes `[ x64, arm64 ]`) and wrap
  lines at 80. Set `flowCollectionPadding: false` and `lineWidth: 0`.

**Binary plist.** `bplist-parser@0.5.0` with `bplist-creator@0.3.0` reproduced
the plistlib bytes exactly and kept the bigint, the date and the bytes. An edit
naturally rewrites the whole file; read through `plutil`, it shows 2 changed
lines. `@plist/binary.*` keeps the values, but its bytes differ from plistlib's.

## Surgical edit (test 5)

- XML plist: a ~130-line span-tracking scanner records each value's source
  offsets. The edit replaces only the text inside `<string>…</string>`, and an
  append copies the previous item's indentation. Result: 2 / 2 / 1 changed
  lines, the comment is kept verbatim, and `plutil -lint` reports OK.
- YAML: `Scalar.range` gives `[start, valueEnd, nodeEnd]`. The edit replaces
  `[start, valueEnd]` with the new value rendered in the node's quote style.
  An append adds `- item` after the last item's line, at the same indent.
  Result: 2 / 2 / 1 changed lines, and inline-comment spacing is kept.
  Block scalars are not handled in the spike.

The same scanner gives a typed model: integer stays separate from real,
integers are bigint, and dates and data are typed. Paired with a
plistlib-layout writer of about 50 lines, it rewrites the plistlib fixtures
byte-identically.

## Tagged JSON (test 6)

Integers are bigint in the model. A safe integer goes out as a JSON number,
and an unsafe one as `{"$int":"…"}`. The other tags are `{"$real":n}` for an
integral real, `{"$date":iso}` for a date and `{"$data":base64}` for bytes. A
dict that has a `$`-prefixed or integer-like key goes out as
`{"$dict":[[k,v]…]}`, because a JS object would reorder integer-like keys.
Every fixture round-trips with strict type, order and byte equality.

## Adapter code the backend would need

1. The XML plist scanner/model, the surgical patcher and the plistlib-layout
   writer. This means owning the XML plist codec instead of using a library.
2. The YAML source-preserving number tags, a Cimian schema rule for
   string-only fields (`hash`), node-level edits, and a surgical patch for
   edits where a re-serialize would touch comment spacing.
3. The tagged JSON encoder/decoder, about 60 lines, shareable with the React UI.

## Libraries

| Package                         | Version | License            | Status                                                                    |
| ------------------------------- | ------- | ------------------ | ------------------------------------------------------------------------- |
| yaml (eemeli)                   | 2.9.1   | ISC                | Active, released 2026-09; ~133M downloads/week                            |
| plist (TooTallNate)             | 5.0.0   | MIT                | Active, released 2026-05; loses integer precision                         |
| bplist-parser                   | 0.5.0   | MIT                | Revived, released 2026-09; ~18M downloads/week                            |
| bplist-creator                  | 0.3.0   | MIT                | Revived, released 2026-09                                                 |
| @plist/xml.\*, @plist/binary.\* | 1.1.x   | BSD-3-Clause-Clear | Little activity since 2024; ~10k downloads/week; fast-xml-parser advisory |

Recommended stack: `yaml`, `bplist-parser` + `bplist-creator`, and the adapter's own XML plist codec.
