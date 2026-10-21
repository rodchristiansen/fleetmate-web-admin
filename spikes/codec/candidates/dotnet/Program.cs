using System.Diagnostics;
using System.Numerics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Claunia.PropertyList;
using CodecSpike;
using YamlDotNet.Core.Events;
using YamlDotNet.RepresentationModel;

var codecDir = args.Length > 0 ? Path.GetFullPath(args[0]) : FindCodecDir(Directory.GetCurrentDirectory());
var fixtures = Path.Combine(codecDir, "fixtures");
var tmp = Directory.CreateTempSubdirectory("codec-dotnet-").FullName;
var results = new List<JsonObject>();

// Fixture table: path, format, edit kind, target, new value, comment markers, unknown-key expectation.
var nestedUnknown = new MapNode([new("nested", new ArrNode([new IntNode(1), new RealNode(2.5), new StrNode("three")]))]);
var cases = new (string File, string Fmt, string Edit, string Value, string[] Comments, Node? Unknown)[]
{
    ("munki/pkginfo-plistlib.plist", "xml", "set", "Example Editor Pro", [], nestedUnknown),
    ("munki/pkginfo-binary.plist", "bin", "set", "Example Editor Pro", [], nestedUnknown),
    ("munki/pkginfo-handformatted.plist", "xml", "set", "Example Viewer Pro", ["<!-- Edited by hand; comment must survive. -->"], null),
    ("munki/manifest-plistlib.plist", "xml", "append", "ExampleExtra", [], null),
    ("munki/pkginfo.yaml", "yaml", "set", "Example CLI Pro", ["# Munki YAML pkginfo, invented values."], new StrNode("keep-me")),
    ("cimian/pkginfo.yaml", "yaml", "set", "Example Editor Pro", ["# Cimian pkginfo, invented values.", "# quoted: must stay a string, not 2.1"], nestedUnknown),
    ("cimian/manifest.yaml", "yaml", "append", "ExampleExtra", ["# all lab machines"], null),
};

foreach (var c in cases)
{
    // Work on a copy; fixtures are never written.
    var src = Path.Combine(tmp, c.File.Replace('/', '_'));
    File.Copy(Path.Combine(fixtures, c.File), src);
    var bytes = File.ReadAllBytes(src);
    var text = c.Fmt == "bin" ? "" : Encoding.UTF8.GetString(bytes);
    var ideal = c.Edit == "set" ? 2 : 1;

    Node model = c.Fmt == "yaml" ? YamlCodec.ToNode(YamlCodec.Load(text).Documents[0].RootNode) : PlistCodec.ToNode(PlistCodec.ParseRaw(bytes));
    var expected = NodeOps.Clone(model);
    ApplyEdit(expected, c.Edit, c.Value);

    // 1. Parse
    var problems = TypeChecks(model, c.File, c.Unknown);
    Add(c.File, 1, null, problems.Count == 0, problems.Count == 0 ? "all type checks pass" + (c.Fmt == "yaml" ? " (scalar typing by adapter core-schema resolver; YamlDotNet leaves scalars untyped)" : "") : string.Join("; ", problems));

    if (c.Fmt == "yaml")
    {
        // 2 + 3 via two library paths.
        foreach (var mode in new[] { "RepresentationModel", "EventPassthrough" })
        {
            string rewrite = mode == "RepresentationModel" ? YamlCodec.SaveModel(YamlCodec.Load(text)) : YamlCodec.EventPassthrough(text);
            var d2 = Diff(text, rewrite);
            Add(c.File, 2, mode, rewrite == text, rewrite == text ? "byte-identical" : $"{d2.Removed}-/{d2.Added}+ lines differ", d2);

            string edited;
            if (mode == "RepresentationModel")
            {
                var ys = YamlCodec.Load(text);
                var root = (YamlMappingNode)ys.Documents[0].RootNode;
                if (c.Edit == "set") root.Children[new YamlScalarNode("display_name")] = new YamlScalarNode(c.Value);
                else ((YamlSequenceNode)root.Children[new YamlScalarNode("managed_installs")]).Add(new YamlScalarNode(c.Value));
                edited = YamlCodec.SaveModel(ys);
            }
            else edited = YamlCodec.EventPassthrough(text, ev => EditEvents(ev, c.Edit, c.Value));
            var d3 = Diff(text, edited);
            var ok3 = d3.Removed + d3.Added == ideal && Same(YamlParse(edited), expected);
            Add(c.File, 3, mode, ok3, $"{d3.Removed}-/{d3.Added}+ = {d3.Removed + d3.Added} changed lines (ideal {ideal})", d3);
            var lost = c.Comments.Where(k => !edited.Contains(k)).ToList();
            Add(c.File, 4, mode, lost.Count == 0, lost.Count == 0 ? "all comments kept" : "dropped: " + string.Join(" | ", lost));
        }

        // 5. Surgical patch from parser marks.
        var patched = c.Edit == "set" ? YamlSurgical.SetString(text, "display_name", c.Value) : YamlSurgical.AppendString(text, "managed_installs", c.Value);
        Surgical(c.File, text, patched, YamlParse(patched), expected, ideal, c.Comments);
        if (c.File == "cimian/pkginfo.yaml")
        {
            // Quoted scalar with a trailing comment: quotes and comment must stay.
            var v = YamlSurgical.SetString(text, "version", "2.11");
            var dv = Diff(text, v);
            var ok = dv.Removed + dv.Added == 2 && v.Contains("version: \"2.11\"   # quoted") && NodeOps.At(YamlParse(v), "version") is StrNode { Value: "2.11" };
            Add(c.File, 5, "surgical-quoted", ok, $"version -> \"2.11\": {dv.Removed}-/{dv.Added}+, double quotes and inline comment kept: {ok}", dv);
        }
    }
    else
    {
        var raw = PlistCodec.ParseRaw(bytes);
        var write = (NSObject o) => c.Fmt == "bin" ? PlistCodec.WriteBinary(o) : PlistCodec.WriteXml(o);
        var rewrite = write(raw);
        var same2 = rewrite.AsSpan().SequenceEqual(bytes);
        if (c.Fmt == "bin")
        {
            var semantic = Same(PlistCodec.ToNode(PlistCodec.ParseRaw(rewrite)), model);
            Add(c.File, 2, "plist-cil", same2, $"{(same2 ? "byte-identical" : $"bytes differ ({bytes.Length} -> {rewrite.Length})")}; semantically {(semantic ? "equal" : "DIFFERENT")}");
        }
        else
        {
            var d2 = Diff(text, Encoding.UTF8.GetString(rewrite));
            Add(c.File, 2, "plist-cil", same2, same2 ? "byte-identical" : $"{d2.Removed}-/{d2.Added}+ lines differ", d2);
        }

        var dict = (NSDictionary)PlistCodec.ParseRaw(bytes);
        if (c.Edit == "set") dict["display_name"] = new NSString(c.Value);
        else ((NSArray)dict["managed_installs"]).Add(new NSString(c.Value));
        var edited = write(dict);
        var reparsed = PlistCodec.ToNode(PlistCodec.ParseRaw(edited));
        if (c.Fmt == "bin")
        {
            // A binary plist has no line diff; compare against the no-edit rewrite.
            Add(c.File, 3, "plist-cil", Same(reparsed, expected), $"binary: edited file decodes to exactly the expected tree: {Same(reparsed, expected)}; not line-diffable");
            Add(c.File, 5, null, null, "n/a: binary plist is rewritten whole by design; Git shows it as a binary change either way");
        }
        else
        {
            var et = Encoding.UTF8.GetString(edited);
            var d3 = Diff(text, et);
            Add(c.File, 3, "plist-cil", d3.Removed + d3.Added == ideal && Same(reparsed, expected), $"{d3.Removed}-/{d3.Added}+ = {d3.Removed + d3.Added} changed lines (ideal {ideal})", d3);
            if (c.Comments.Length > 0)
            {
                var lost = c.Comments.Where(k => !et.Contains(k)).ToList();
                Add(c.File, 4, "plist-cil", lost.Count == 0, lost.Count == 0 ? "all comments kept" : "dropped: " + string.Join(" | ", lost));
            }
            var patched = c.Edit == "set" ? PlistSurgical.SetString(text, "display_name", c.Value) : PlistSurgical.AppendString(text, "managed_installs", c.Value);
            Surgical(c.File, text, patched, PlistCodec.ToNode(PlistCodec.ParseRaw(Encoding.UTF8.GetBytes(patched))), expected, ideal, c.Comments);
        }
    }

    // 6. Tagged JSON round trip; for plists also rebuild the file from the decoded tree.
    var json = TaggedJson.ToText(model);
    var back = TaggedJson.FromText(json);
    var ok6 = Same(back, model);
    var detail6 = $"tagged JSON round trip {(ok6 ? "equal" : "DIFFERENT")}";
    if (c.Fmt != "yaml")
    {
        var raw = PlistCodec.ParseRaw(bytes);
        var rebuilt = c.Fmt == "bin" ? PlistCodec.WriteBinary(PlistCodec.FromNode(back)) : PlistCodec.WriteXml(PlistCodec.FromNode(back));
        var libOut = c.Fmt == "bin" ? PlistCodec.WriteBinary(raw) : PlistCodec.WriteXml(raw);
        var same = rebuilt.AsSpan().SequenceEqual(libOut);
        ok6 &= same;
        detail6 += $"; file rebuilt from JSON {(same ? "matches" : "differs from")} plist-cil rewrite";
    }
    var sample = JsonNode.Parse(json)!.AsObject();
    var tags = string.Join(", ", sample.Where(kv => kv.Value is JsonObject o && o.Count == 1 && o.First().Key.StartsWith('$')).Select(kv => $"{kv.Key}={kv.Value!.ToJsonString()}").Take(4));
    Add(c.File, 6, null, ok6, detail6 + (tags.Length > 0 ? $"; tags: {tags}" : ""));
}

CimianReuse();

var outDir = Path.Combine(codecDir, "results");
Directory.CreateDirectory(outDir);
var doc = new JsonObject
{
    ["candidate"] = "dotnet",
    ["runtime"] = Environment.Version.ToString(),
    ["libraries"] = new JsonObject { ["YamlDotNet"] = "18.1.0 (MIT)", ["plist-cil"] = "2.3.1 (MIT)" },
    ["results"] = new JsonArray(results.ToArray()),
};
File.WriteAllText(Path.Combine(outDir, "dotnet.json"), doc.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n");
foreach (var r in results)
    Console.WriteLine($"{r["fixture"],-36} t{r["test"]} {r["mode"]?.ToString() ?? "",-20} {(r["pass"] is null ? "n/a " : (bool)r["pass"]! ? "PASS" : "FAIL")}  {r["detail"]}");
Directory.Delete(tmp, true);
return;

// ---------------------------------------------------------------------------

void Surgical(string file, string text, string patched, Node reparsed, Node expected, int ideal, string[] comments)
{
    var d = Diff(text, patched);
    var lost = comments.Where(k => !patched.Contains(k)).ToList();
    var ok = d.Removed + d.Added == ideal && Same(reparsed, expected) && lost.Count == 0;
    Add(file, 5, "surgical", ok, $"{d.Removed}-/{d.Added}+ = {d.Removed + d.Added} changed lines (ideal {ideal}); reparse matches expected tree: {Same(reparsed, expected)}; comments kept: {lost.Count == 0}", d);
}

void CimianReuse()
{
#if CIMIAN_YAML
    foreach (var (file, edit, value) in new[] { ("cimian/pkginfo.yaml", "set", "Example Editor Pro"), ("cimian/manifest.yaml", "append", "ExampleExtra") })
    {
        var text = File.ReadAllText(Path.Combine(fixtures, file));
        string Ser(Dictionary<object, object> d) => file.Contains("pkginfo") ? CimianStudio.Infrastructure.Yaml.CimianYaml.SerializePkgInfo(d) : CimianStudio.Infrastructure.Yaml.CimianYaml.SerializeManifest(d);
        Dictionary<object, object> Load() => CimianStudio.Infrastructure.Yaml.CimianYaml.Deserializer.Deserialize<Dictionary<object, object>>(text);
        var d2 = Diff(text, Ser(Load()));
        Add(file, 2, "CimianYaml", d2.Removed + d2.Added == 0, $"CimianStudio CimianYaml (untyped dictionary, best case for unknown keys): {d2.Removed}-/{d2.Added}+", d2);
        var dict = Load();
        if (edit == "set") dict["display_name"] = value; else ((List<object>)dict["managed_installs"]).Add(value);
        var outText = Ser(dict);
        var d3 = Diff(text, outText);
        var typed = YamlParse(outText);
        Add(file, 3, "CimianYaml", false, $"{d3.Removed}-/{d3.Added}+; comments in output: {outText.Contains('#')}; version still string: {NodeOps.At(typed, "version") is StrNode}; unattended_install still bool: {NodeOps.At(typed, "unattended_install") is BoolNode or null}", d3);
    }
#else
    Console.WriteLine("CimianYaml.cs not found; skipping Cimian reuse check");
#endif
}

static Node YamlParse(string t) => YamlCodec.ToNode(YamlCodec.Load(t).Documents[0].RootNode);

static bool Same(Node a, Node b) => NodeOps.DeepEquals(a, b);

static void ApplyEdit(Node root, string edit, string value)
{
    var m = (MapNode)root;
    if (edit == "set") m.Set("display_name", new StrNode(value));
    else ((ArrNode)m.Get("managed_installs")!).Items.Add(new StrNode(value));
}

// Edit the raw event stream: replace the value of top-level display_name, or
// insert a scalar before the end of top-level managed_installs.
static List<ParsingEvent> EditEvents(List<ParsingEvent> ev, string edit, string value)
{
    int depth = 0;
    for (int i = 0; i < ev.Count; i++)
    {
        var e = ev[i];
        if (e is MappingStart or SequenceStart) { depth++; continue; }
        if (e is MappingEnd or SequenceEnd) { depth--; continue; }
        if (depth != 1 || e is not Scalar k) continue;
        var target = edit == "set" ? "display_name" : "managed_installs";
        if (k.Value != target) { i = SkipNode(ev, NextNonComment(ev, i + 1)); continue; }
        int v = NextNonComment(ev, i + 1);
        if (edit == "set") { ev[v] = new Scalar(value); return ev; }
        int end = SkipNode(ev, v);
        ev.Insert(end, new Scalar(value));
        return ev;
    }
    throw new InvalidOperationException("target not found");
}

static int NextNonComment(List<ParsingEvent> ev, int i) { while (ev[i] is Comment) i++; return i; }

// Returns the index of the last event of the node starting at i.
static int SkipNode(List<ParsingEvent> ev, int i)
{
    if (ev[i] is not (MappingStart or SequenceStart)) return i;
    int d = 0;
    for (int j = i; j < ev.Count; j++)
    {
        if (ev[j] is MappingStart or SequenceStart) d++;
        else if (ev[j] is MappingEnd or SequenceEnd && --d == 0) return j;
    }
    return ev.Count - 1;
}

static List<string> TypeChecks(Node m, string file, Node? unknown)
{
    var p = new List<string>();
    void Str(string what, Node? n) { if (n is not null and not StrNode) p.Add($"{what} is {n.GetType().Name}, not string"); }
    Str("version", NodeOps.At(m, "version"));
    Str("minimum_os_version", NodeOps.At(m, "minimum_os_version"));
    foreach (var list in new[] { "receipts", "installs" })
        if (NodeOps.At(m, list) is ArrNode a)
            for (int i = 0; i < a.Items.Count; i++) Str($"{list}[{i}].version", NodeOps.At(a.Items[i], "version"));
    if (NodeOps.At(m, "installed_size") is { } sz && !(sz is IntNode i2 && i2.Value == BigInteger.Parse("9007199254740993")))
        p.Add($"installed_size is {sz}");
    if (file.StartsWith("munki/pkginfo-") && !file.Contains("hand"))
    {
        if (NodeOps.At(m, "_metadata", "creation_date") is not DateNode d) p.Add("creation_date not a date");
        else if (d.Value != new DateTime(2026, 10, 20, 9, 30, 0, DateTimeKind.Utc)) p.Add($"creation_date {d.Value:O}");
        if (NodeOps.At(m, "icon_data") is not DataNode b || !b.Value.AsSpan().SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0 })) p.Add("icon_data not exact bytes");
    }
    foreach (var key in new[] { "unattended_install", "uninstallable", "unattended_uninstall" })
        if (NodeOps.At(m, key) is { } b && b is not BoolNode) p.Add($"{key} not bool");
    if (NodeOps.At(m, "receipts", "0", "optional") is { } o && o is not BoolNode) p.Add("receipts[0].optional not bool");
    if (unknown != null && (NodeOps.At(m, "x_unknown_site_key") is not { } u || !NodeOps.DeepEquals(u, unknown))) p.Add("x_unknown_site_key lost or changed");
    return p;
}

void Add(string fixture, int test, string? mode, bool? pass, string detail, DiffResult? d = null)
{
    var o = new JsonObject { ["fixture"] = fixture, ["test"] = test, ["mode"] = mode, ["pass"] = pass, ["detail"] = detail };
    if (d != null)
    {
        o["changed_lines"] = new JsonObject { ["removed"] = d.Removed, ["added"] = d.Added };
        if (d.Removed + d.Added > 0) o["diff"] = d.Text.Length > 4000 ? d.Text[..4000] + "\n…" : d.Text;
    }
    results.Add(o);
}

// Real unified diff via diff(1); counts +/- lines excluding the file headers.
DiffResult Diff(string a, string b)
{
    var fa = Path.Combine(tmp, "a.txt"); var fb = Path.Combine(tmp, "b.txt");
    File.WriteAllText(fa, a); File.WriteAllText(fb, b);
    var psi = new ProcessStartInfo("diff", ["-u", "--label", "original", "--label", "written", fa, fb]) { RedirectStandardOutput = true };
    using var proc = Process.Start(psi)!;
    var output = proc.StandardOutput.ReadToEnd();
    proc.WaitForExit();
    var lines = output.Split('\n');
    return new DiffResult(
        lines.Count(l => l.StartsWith('-') && !l.StartsWith("---")),
        lines.Count(l => l.StartsWith('+') && !l.StartsWith("+++")),
        output);
}

static string FindCodecDir(string start)
{
    for (var d = new DirectoryInfo(start); d != null; d = d.Parent)
        if (File.Exists(Path.Combine(d.FullName, "SPEC.md")) && Directory.Exists(Path.Combine(d.FullName, "fixtures"))) return d.FullName;
    throw new DirectoryNotFoundException("run from inside spikes/codec or pass its path");
}

record DiffResult(int Removed, int Added, string Text);
