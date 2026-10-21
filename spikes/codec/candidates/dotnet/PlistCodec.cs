using System.Numerics;
using Claunia.PropertyList;

namespace CodecSpike;

// plist-cil (Claunia.PropertyList) <-> neutral model.
public static class PlistCodec
{
    public static NSObject ParseRaw(byte[] bytes) => PropertyListParser.Parse(bytes);

    public static byte[] WriteXml(NSObject o) => System.Text.Encoding.UTF8.GetBytes(o.ToXmlPropertyList());
    public static byte[] WriteBinary(NSObject o) => BinaryPropertyListWriter.WriteToArray(o);

    public static Node ToNode(NSObject o) => o switch
    {
        NSDictionary d => new MapNode(d.Select(kv => new KeyValuePair<string, Node>(kv.Key, ToNode(kv.Value))).ToList()),
        NSArray a => new ArrNode(a.Select(ToNode).ToList()),
        NSString s => new StrNode(s.Content),
        NSNumber n when n.isBoolean() => new BoolNode(n.ToBool()),
        NSNumber n when n.isInteger() => new IntNode(new BigInteger(n.ToLong())),
        NSNumber n => new RealNode(n.ToDouble()),
        NSDate dt => new DateNode(dt.Date.ToUniversalTime()),
        NSData b => new DataNode(b.Bytes),
        _ => throw new NotSupportedException(o.GetType().Name),
    };

    public static NSObject FromNode(Node n)
    {
        switch (n)
        {
            case MapNode m:
                var d = new NSDictionary();
                foreach (var kv in m.Items) d.Add(kv.Key, FromNode(kv.Value));
                return d;
            case ArrNode a:
                var arr = new NSArray(a.Items.Count);
                foreach (var i in a.Items) arr.Add(FromNode(i));
                return arr;
            case StrNode s: return new NSString(s.Value);
            case BoolNode b: return new NSNumber(b.Value);
            case IntNode i: return new NSNumber((long)i.Value);
            case RealNode r: return new NSNumber(r.Value);
            case DateNode dt: return new NSDate(dt.Value);
            case DataNode b: return new NSData(b.Value);
            default: throw new NotSupportedException(n.GetType().Name);
        }
    }
}
