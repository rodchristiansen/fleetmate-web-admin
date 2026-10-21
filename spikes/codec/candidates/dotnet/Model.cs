using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CodecSpike;

// Format-neutral document tree. Map keeps key order; Int is arbitrary precision.
public abstract record Node;
public sealed record MapNode(List<KeyValuePair<string, Node>> Items) : Node
{
    public Node? Get(string key) => Items.FirstOrDefault(kv => kv.Key == key).Value;
    public void Set(string key, Node value)
    {
        var i = Items.FindIndex(kv => kv.Key == key);
        if (i >= 0) Items[i] = new(key, value); else Items.Add(new(key, value));
    }
}
public sealed record ArrNode(List<Node> Items) : Node;
public sealed record StrNode(string Value) : Node;
public sealed record IntNode(BigInteger Value) : Node;
public sealed record RealNode(double Value) : Node;
public sealed record BoolNode(bool Value) : Node;
public sealed record DateNode(DateTime Value) : Node;
public sealed record DataNode(byte[] Value) : Node;
public sealed record NullNode : Node;

public static class NodeOps
{
    public static bool DeepEquals(Node a, Node b) => (a, b) switch
    {
        (MapNode x, MapNode y) => x.Items.Count == y.Items.Count &&
            x.Items.Zip(y.Items).All(p => p.First.Key == p.Second.Key && DeepEquals(p.First.Value, p.Second.Value)),
        (ArrNode x, ArrNode y) => x.Items.Count == y.Items.Count && x.Items.Zip(y.Items).All(p => DeepEquals(p.First, p.Second)),
        (DataNode x, DataNode y) => x.Value.AsSpan().SequenceEqual(y.Value),
        (DateNode x, DateNode y) => x.Value.ToUniversalTime() == y.Value.ToUniversalTime(),
        _ => a.Equals(b),
    };

    public static Node Clone(Node n) => n switch
    {
        MapNode m => new MapNode(m.Items.Select(kv => new KeyValuePair<string, Node>(kv.Key, Clone(kv.Value))).ToList()),
        ArrNode a => new ArrNode(a.Items.Select(Clone).ToList()),
        _ => n,
    };

    public static Node? At(Node root, params string[] path)
    {
        Node? cur = root;
        foreach (var p in path)
            cur = cur switch { MapNode m => m.Get(p), ArrNode a when int.TryParse(p, out var i) && i < a.Items.Count => a.Items[i], _ => null };
        return cur;
    }
}

// Tagged JSON for the browser. Safe integers and plain strings/bools stay native;
// everything JSON cannot carry exactly is wrapped in a one-key "$tag" object.
// A map whose keys start with "$" is wrapped in {"$map": [[k, v], ...]} so user
// data can never be mistaken for a tag.
public static class TaggedJson
{
    static readonly BigInteger MaxSafe = (BigInteger.One << 53) - 1;

    public static JsonNode? Encode(Node n) => n switch
    {
        StrNode s => JsonValue.Create(s.Value),
        BoolNode b => JsonValue.Create(b.Value),
        NullNode => null,
        IntNode i when BigInteger.Abs(i.Value) <= MaxSafe => JsonValue.Create((long)i.Value),
        IntNode i => Tag("$int", JsonValue.Create(i.Value.ToString(CultureInfo.InvariantCulture))),
        RealNode r => Tag("$real", JsonValue.Create(r.Value.ToString("R", CultureInfo.InvariantCulture))),
        DateNode d => Tag("$date", JsonValue.Create(d.Value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture))),
        DataNode d => Tag("$data", JsonValue.Create(Convert.ToBase64String(d.Value))),
        ArrNode a => new JsonArray(a.Items.Select(Encode).ToArray()),
        MapNode m when m.Items.Any(kv => kv.Key.StartsWith('$')) =>
            Tag("$map", new JsonArray(m.Items.Select(kv => (JsonNode)new JsonArray(JsonValue.Create(kv.Key), Encode(kv.Value))).ToArray())),
        MapNode m => MapObj(m),
        _ => throw new NotSupportedException(n.GetType().Name),
    };

    static JsonObject MapObj(MapNode m)
    {
        var o = new JsonObject();
        foreach (var kv in m.Items) o[kv.Key] = Encode(kv.Value);
        return o;
    }

    static JsonObject Tag(string tag, JsonNode? v) => new() { [tag] = v };

    public static Node Decode(JsonNode? j)
    {
        switch (j)
        {
            case null: return new NullNode();
            case JsonArray a: return new ArrNode(a.Select(Decode).ToList());
            case JsonObject o when o.Count == 1 && o.First().Key.StartsWith('$'):
                var (tag, v) = (o.First().Key, o.First().Value);
                return tag switch
                {
                    "$int" => new IntNode(BigInteger.Parse(v!.GetValue<string>(), CultureInfo.InvariantCulture)),
                    "$real" => new RealNode(double.Parse(v!.GetValue<string>(), CultureInfo.InvariantCulture)),
                    "$date" => new DateNode(DateTime.Parse(v!.GetValue<string>(), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal)),
                    "$data" => new DataNode(Convert.FromBase64String(v!.GetValue<string>())),
                    "$map" => new MapNode(v!.AsArray().Select(p => new KeyValuePair<string, Node>(p![0]!.GetValue<string>(), Decode(p[1]))).ToList()),
                    _ => throw new FormatException($"unknown tag {tag}"),
                };
            case JsonObject o: return new MapNode(o.Select(kv => new KeyValuePair<string, Node>(kv.Key, Decode(kv.Value))).ToList());
            case JsonValue jv:
                return jv.GetValueKind() switch
                {
                    JsonValueKind.String => new StrNode(jv.GetValue<string>()),
                    JsonValueKind.True => new BoolNode(true),
                    JsonValueKind.False => new BoolNode(false),
                    JsonValueKind.Number => new IntNode(new BigInteger(jv.GetValue<long>())),
                    _ => throw new FormatException(jv.ToJsonString()),
                };
        }
        throw new FormatException("unreachable");
    }

    public static string ToText(Node n) => Encode(n)!.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
    public static Node FromText(string s) => Decode(JsonNode.Parse(s));
}
