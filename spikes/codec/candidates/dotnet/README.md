# .NET codec candidate

Console app on `net10.0` (cross-platform). Dependencies are pinned centrally in
`Directory.Packages.props` and locked in `packages.lock.json`:

- YamlDotNet 18.1.0 (MIT)
- plist-cil 2.3.1 (Claunia.PropertyList, MIT)

The harness compiles CimianStudio's `CimianYaml.cs` read-only from
`~/Developer/GitHub/windowsadmins/cimianstudio` when it exists, to test reusing it.
Point it elsewhere with `-p:CimianYamlSource=<path>`; without it the check is skipped.

Run from `spikes/codec`. It writes `results/dotnet.json` and prints a summary:

```
dotnet run --project candidates/dotnet -p:RestoreLockedMode=true
```

Files:

- `Model.cs` holds the format-neutral tree and the tagged JSON encoding.
- `PlistCodec.cs` maps between plist-cil and that tree.
- `YamlCodec.cs` maps between YamlDotNet and that tree, with a YAML 1.2 core-schema resolver.
- `PlistSurgical.cs` and `YamlSurgical.cs` are the span-tracking patchers for test 5.
- `Program.cs` runs the tests and diffs the output with `diff -u`.
