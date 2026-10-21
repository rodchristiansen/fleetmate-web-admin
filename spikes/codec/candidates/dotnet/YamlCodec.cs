using System.Globalization;
using System.Numerics;
using System.Text.RegularExpressions;
using YamlDotNet.Core;
using YamlDotNet.Core.Events;
using YamlDotNet.RepresentationModel;

namespace CodecSpike;

// YamlDotNet RepresentationModel <-> neutral model. YamlDotNet leaves every
// scalar as an untyped string, so the YAML 1.2 core-schema resolver is ours.
public static partial class YamlCodec
{
    // Best library settings found: indented block sequences ("  - item").
    static readonly EmitterSettings Settings = new EmitterSettings().WithIndentedSequences();

    public static YamlStream Load(string text)
    {
        var s = new YamlStream();
        s.Load(new StringReader(text));
        return s;
    }

    // Library rewrite path 1: RepresentationModel save.
    public static string SaveModel(YamlStream s)
    {
        var w = new StringWriter { NewLine = "\n" };
        s.Save(new Emitter(w, Settings), assignAnchors: false);
        var t = w.ToString();
        return t.EndsWith("...\n") ? t[..^4] : t;
    }

    // Library rewrite path 2: re-emit the raw parser event stream, comments
    // included (Scanner with skipComments: false). Optional mutate hook edits events.
    public static string EventPassthrough(string text, Func<List<ParsingEvent>, List<ParsingEvent>>? mutate = null)
    {
        var parser = new Parser(new Scanner(new StringReader(text), skipComments: false));
        var events = new List<ParsingEvent>();
        while (parser.MoveNext()) events.Add(parser.Current!);
        if (mutate != null) events = mutate(events);
        var w = new StringWriter { NewLine = "\n" };
        var emitter = new Emitter(w, Settings);
        foreach (var e in events) emitter.Emit(e);
        var t = w.ToString();
        return t.EndsWith("...\n") ? t[..^4] : t;
    }

    public static Node ToNode(YamlNode n) => n switch
    {
        YamlMappingNode m => new MapNode(m.Children.Select(kv => new KeyValuePair<string, Node>(((YamlScalarNode)kv.Key).Value!, ToNode(kv.Value))).ToList()),
        YamlSequenceNode s => new ArrNode(s.Children.Select(ToNode).ToList()),
        YamlScalarNode s => Resolve(s),
        _ => throw new NotSupportedException(n.GetType().Name),
    };

    public static Node Resolve(YamlScalarNode s)
    {
        var v = s.Value ?? "";
        if (s.Style != ScalarStyle.Plain || !s.Tag.IsEmpty && s.Tag.Value == "tag:yaml.org,2002:str") return new StrNode(v);
        if (v is "" or "~" or "null" or "Null" or "NULL") return new NullNode();
        if (v is "true" or "True" or "TRUE") return new BoolNode(true);
        if (v is "false" or "False" or "FALSE") return new BoolNode(false);
        if (IntRe().IsMatch(v)) return new IntNode(BigInteger.Parse(v, CultureInfo.InvariantCulture));
        if (FloatRe().IsMatch(v)) return new RealNode(double.Parse(v, CultureInfo.InvariantCulture));
        return new StrNode(v);
    }

    [GeneratedRegex(@"^[-+]?[0-9]+$")] private static partial Regex IntRe();
    [GeneratedRegex(@"^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$")] private static partial Regex FloatRe();
}
