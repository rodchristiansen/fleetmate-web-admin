using System.Net;

namespace CodecSpike;

// Span-tracking scanner for XML plists: records the character span of every
// value element by path, then patches only those characters. Comments, DOCTYPE,
// indentation and entity style elsewhere are untouched.
public static class PlistSurgical
{
    sealed record Span(int Start, int End, List<Span> Children);

    sealed class Scanner(string t)
    {
        int pos;
        public readonly Dictionary<string, Span> Map = [];

        // Next element tag, skipping text, comments, PIs and DOCTYPE.
        (string name, int start, int end, bool close, bool selfClose) NextTag()
        {
            while (true)
            {
                int lt = t.IndexOf('<', pos);
                if (lt < 0) throw new FormatException("unexpected end of plist");
                if (t.AsSpan(lt).StartsWith("<!--")) { pos = t.IndexOf("-->", lt, StringComparison.Ordinal) + 3; continue; }
                if (t[lt + 1] is '?' or '!') { pos = t.IndexOf('>', lt) + 1; continue; }
                int gt = t.IndexOf('>', lt);
                pos = gt + 1;
                bool close = t[lt + 1] == '/', self = t[gt - 1] == '/';
                var inner = t[(lt + (close ? 2 : 1))..(self ? gt - 1 : gt)].Trim();
                var name = inner.Split(' ', 2)[0];
                return (name, lt, gt + 1, close, self);
            }
        }

        public Span Value(string path, (string name, int start, int end, bool close, bool selfClose)? first = null)
        {
            var tag = first ?? NextTag();
            Span span;
            switch (tag.name)
            {
                case "plist":
                    var inner = Value(path);
                    NextTag();
                    return inner;
                case "dict" or "array" when tag.selfClose:
                    span = new Span(tag.start, tag.end, []);
                    break;
                case "dict":
                    var kids = new List<Span>();
                    while (true)
                    {
                        var k = NextTag();
                        if (k.close) { span = new Span(tag.start, k.end, kids); break; }
                        int textEnd = t.IndexOf("</key>", k.end, StringComparison.Ordinal);
                        var key = WebUtility.HtmlDecode(t[k.end..textEnd]);
                        pos = textEnd + "</key>".Length;
                        kids.Add(Value(path == "" ? key : $"{path}/{key}"));
                    }
                    break;
                case "array":
                    var items = new List<Span>();
                    while (true)
                    {
                        var n = NextTag();
                        if (n.close) { span = new Span(tag.start, n.end, items); break; }
                        items.Add(Value($"{path}/{items.Count}", n));
                    }
                    break;
                default:
                    if (tag.selfClose) { span = new Span(tag.start, tag.end, []); break; }
                    var closeAt = t.IndexOf($"</{tag.name}>", tag.end, StringComparison.Ordinal);
                    pos = closeAt + tag.name.Length + 3;
                    span = new Span(tag.start, pos, []);
                    break;
            }
            Map[path] = span;
            return span;
        }
    }

    static Dictionary<string, Span> Index(string text)
    {
        var s = new Scanner(text);
        s.Value("");
        return s.Map;
    }

    static string Esc(string v) => v.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    public static string SetString(string text, string path, string value)
    {
        var s = Index(text)[path];
        return text[..s.Start] + "<string>" + Esc(value) + "</string>" + text[s.End..];
    }

    public static string AppendString(string text, string path, string value)
    {
        var arr = Index(text)[path];
        if (arr.Children.Count == 0) throw new NotSupportedException("empty array: needs indentation inference");
        var last = arr.Children[^1];
        int lineStart = text.LastIndexOf('\n', last.Start) + 1;
        var indent = text[lineStart..last.Start];
        return text[..last.End] + "\n" + indent + "<string>" + Esc(value) + "</string>" + text[last.End..];
    }
}
