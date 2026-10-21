using System.Text;
using YamlDotNet.Core;
using YamlDotNet.Core.Events;

namespace CodecSpike;

// Patches YAML source text in place using YamlDotNet parser Start/End marks.
// Only the bytes of the changed scalar (or one new sequence line) change.
public static class YamlSurgical
{
    sealed record Span(ParsingEvent Start, ParsingEvent End, List<Span> Items, ScalarStyle Style, bool Flow);

    // Index: path ("a/b/0") -> span of that node.
    static Dictionary<string, Span> Index(string text)
    {
        var parser = new Parser(new StringReader(text));
        var map = new Dictionary<string, Span>();
        parser.Consume<StreamStart>();
        parser.Consume<DocumentStart>();
        ReadNode(parser, "", map);
        return map;
    }

    static Span ReadNode(IParser p, string path, Dictionary<string, Span> map)
    {
        Span span;
        if (p.TryConsume<Scalar>(out var sc))
            span = new Span(sc, sc, [], sc.Style, false);
        else if (p.TryConsume<SequenceStart>(out var ss))
        {
            var items = new List<Span>();
            while (!p.Accept<SequenceEnd>(out _)) items.Add(ReadNode(p, $"{path}/{items.Count}", map));
            var se = p.Consume<SequenceEnd>();
            span = new Span(ss, se, items, ScalarStyle.Any, ss.Style == SequenceStyle.Flow);
        }
        else if (p.TryConsume<MappingStart>(out var ms))
        {
            var items = new List<Span>();
            while (!p.Accept<MappingEnd>(out _))
            {
                var key = p.Consume<Scalar>().Value;
                items.Add(ReadNode(p, path == "" ? key : $"{path}/{key}", map));
            }
            var me = p.Consume<MappingEnd>();
            span = new Span(ms, me, items, ScalarStyle.Any, ms.Style == MappingStyle.Flow);
        }
        else throw new NotSupportedException($"unexpected {p.Current} at {path}");
        map[path] = span;
        return span;
    }

    static readonly System.Text.Json.JsonSerializerOptions Relaxed = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    // Render a string scalar keeping the original quote style where it is safe.
    static string Render(string value, ScalarStyle style)
    {
        bool plainSafe = value.Length > 0 && !value.Contains('\n') && !value.Contains(": ") && !value.Contains(" #")
            && "-?:,[]{}#&*!|>'\"%@`".IndexOf(value[0]) < 0 && value.Trim() == value
            && YamlCodec.Resolve(new YamlDotNet.RepresentationModel.YamlScalarNode(value)) is StrNode;
        return style switch
        {
            ScalarStyle.Plain when plainSafe => value,
            ScalarStyle.SingleQuoted when !value.Contains('\n') => "'" + value.Replace("'", "''") + "'",
            _ => System.Text.Json.JsonSerializer.Serialize(value, Relaxed), // JSON string is valid YAML double-quoted
        };
    }

    public static string SetString(string text, string path, string value)
    {
        var s = Index(text)[path];
        if (s.Start is not Scalar || s.Style is ScalarStyle.Literal or ScalarStyle.Folded)
            throw new NotSupportedException("block scalars need a re-indenting writer");
        int a = (int)s.Start.Start.Index, b = (int)s.Start.End.Index;
        return text[..a] + Render(value, s.Style) + text[b..];
    }

    public static string AppendString(string text, string path, string value)
    {
        var seq = Index(text)[path];
        if (seq.Items.Count == 0) throw new NotSupportedException("empty sequence: needs block insertion");
        var last = seq.Items[^1];
        int lastEnd = (int)last.End.End.Index;
        if (seq.Flow) return text[..lastEnd] + ", " + Render(value, ScalarStyle.Plain) + text[lastEnd..];

        // Block sequence: copy the last item's "  - " prefix onto a new line after it.
        int itemStart = (int)last.Start.Start.Index;
        int lineStart = text.LastIndexOf('\n', Math.Max(itemStart - 1, 0)) + 1;
        int dash = text.LastIndexOf('-', itemStart - 1, itemStart - lineStart);
        var prefix = text[lineStart..dash] + "- ";
        int eol = text.IndexOf('\n', lastEnd);
        int at = eol < 0 ? text.Length : eol + 1;
        var line = new StringBuilder(prefix).Append(Render(value, ScalarStyle.Plain)).Append('\n');
        if (eol < 0) line.Insert(0, '\n');
        return text[..at] + line + text[at..];
    }
}
