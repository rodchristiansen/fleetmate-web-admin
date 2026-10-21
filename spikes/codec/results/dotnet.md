# .NET codec results

The harness runs on `net10.0` on macOS, using YamlDotNet 18.1.0 (MIT) and
plist-cil 2.3.1 (MIT). The full detail and every unified diff are in
`dotnet.json`, and the harness is in `candidates/dotnet/`.

## Results

| Fixture                     | 1 Parse | 2 Rewrite             | 3 Edit (lines, ideal)    | 4 Comments               | 5 Surgical | 6 JSON |
| --------------------------- | ------- | --------------------- | ------------------------ | ------------------------ | ---------- | ------ |
| munki pkginfo-plistlib      | pass    | fail, 2 lines         | fail, 4 (2)              | n/a                      | pass, 2    | pass   |
| munki pkginfo-binary        | pass    | pass, byte-identical  | pass, decodes exactly    | n/a                      | n/a        | pass   |
| munki pkginfo-handformatted | pass    | fail, 55 lines        | fail, 55 (2)             | fail, dropped            | pass, 2    | pass   |
| munki manifest-plistlib     | pass    | fail, 2 lines         | fail, 3 (1)              | n/a                      | pass, 1    | pass   |
| munki pkginfo.yaml          | pass*   | event: pass; model: 1 | event: pass, 2; model: 3 | event: pass; model: fail | pass, 2    | pass   |
| cimian pkginfo.yaml         | pass*   | event: 9; model: 10   | event: 11; model: 12 (2) | event: pass; model: fail | pass, 2    | pass   |
| cimian manifest.yaml        | pass*   | event: 7; model: 7    | event: 8; model: 8 (1)   | event: pass; model: fail | pass, 1    | pass   |

\* YamlDotNet returns every scalar as an untyped string. The types come from the
adapter's YAML 1.2 core-schema resolver (about 20 lines). With it, `"2.10"` and
`10.0.19045` stay strings, `9007199254740993` is exact, and booleans stay booleans.

"event" is the raw parser event stream, read with `skipComments: false` and
emitted again. "model" is the `RepresentationModel` `YamlStream.Save` path. Both
use `WithIndentedSequences()`, which is needed: without it every block sequence
gets reindented.

## What failed and why

1. plist-cil writes `"` as `&quot;` inside strings. That is the only change on
   plistlib-written XML: dates, base64 `<data>` layout, key order and the 64-bit
   integer all survive.
2. plist-cil rewrites the hand-formatted plist with tabs and drops the
   `<!-- -->` comment.
3. YamlDotNet `RepresentationModel` drops every comment and every blank line.
4. The event passthrough keeps the comments, but it collapses the space before an
   inline comment (`"2.10"   # quoted` becomes `"2.10" # quoted`) and drops blank
   lines.
5. Quote styles, flow sequences and literal blocks survive both YAML paths.

## Surgical patching (test 5) works

1. YAML: the patcher uses YamlDotNet's `Scalar.Start` and `End` marks, keeps the
   original quote style and inserts a new item with the previous item's
   indentation. `version` → `"2.11"` keeps its double quotes and the
   three-space inline comment.
2. XML plist: a span-tracking scanner of about 100 lines records each value
   element's character range by key path. It replaces or inserts only that range,
   so tabs or spaces, comments, DOCTYPE and entity style elsewhere are untouched.
3. Every patched file re-parses to exactly the expected tree.
4. Not covered yet:
   - Replacing a literal or folded block scalar.
   - Adding an item to an empty sequence or array.
   - Adding a new key.
   - Mapping items inside a sequence.

   These need indentation inference.

## Tagged JSON (test 6) works

Safe integers, strings and booleans stay native JSON. The other values are
wrapped in tags:

- integers above 2^53 as `{"$int":"…"}`
- reals as `{"$real":"…"}`
- dates as `{"$date":"…Z"}`
- bytes as `{"$data":"base64"}`
- maps with `$`-prefixed keys as `{"$map":[[k,v],…]}`

Every fixture round-trips to an identical tree. Plists rebuilt from the decoded
JSON are byte-identical to the plist-cil rewrite. YAML scalar style is not carried
in the JSON, so saves must go back through the surgical patcher, not a full
re-emit.

## Extra adapter code needed

| Piece                                 | Lines (spike) |
| ------------------------------------- | ------------- |
| Neutral tree and tagged JSON          | ~120          |
| YAML core-schema resolver and mapping | ~70           |
| YAML surgical patcher                 | ~95           |
| XML plist span scanner and patcher    | ~105          |

Binary plists can be rewritten with plist-cil directly: the output was
byte-identical to plistlib's.

## Reusing Cimian code

1. It is portable. `CimianYaml.cs` compiles unchanged on `net10.0` on macOS
   against YamlDotNet 18.1.0. The csproj files target `net10.0-windows`, but the
   YAML code uses no Windows APIs. In `Cimian.Core`, only `DataExporter.cs` and
   `SelfUpdateService.cs` use Windows APIs.
2. It does not round-trip. It is a canonical writer by design: it sorts keys
   alphabetically after name, display_name and version, and drops comments and
   blank lines.
   - cimian pkginfo: 57 changed lines with no edit, 59 with one edit.
   - cimian manifest: 13 lines with no edit, 14 with one append.
3. It has a bug. `version: "2.10"` is written as `version: 2.10`, unquoted, and
   `2.10.0.0` loses its quotes too. Cimian's typed model reads that back as a
   string, but any YAML 1.2 reader (Python, JS `yaml`) gets the number 2.1.
4. Its typed `Package` model uses `IgnoreUnmatchedProperties` and has no
   catch-all. Unknown keys like `x_unknown_site_key` are lost on save, and
   `_metadata` needs a manual workaround.
5. Verdict: reuse its models as a validation reference, not its writer.
