"""Python codec adapter for the FleetMate codec spike.

Three layers:
  * library load/dump (plistlib, ruamel.yaml round-trip mode),
  * surgical edits that patch only the changed bytes using source positions,
  * a tagged JSON encoding for sending documents to a browser.
"""

from __future__ import annotations

import base64
import datetime as dt
import io
import json
import plistlib
import re
from dataclasses import dataclass, field
from xml.sax.saxutils import escape

from ruamel.yaml import YAML

# ---------------------------------------------------------------- library I/O


def yaml_rt(tuned: bool = True) -> YAML:
    y = YAML(typ="rt")
    if tuned:
        # Match the house style of the fixtures: "key:\n  - item".
        y.preserve_quotes = True
        y.indent(mapping=2, sequence=4, offset=2)
        y.width = 4096
    return y


def load(kind: str, data: bytes):
    if kind == "yaml":
        return yaml_rt().load(data.decode("utf-8"))
    return plistlib.loads(data, aware_datetime=True)


def dump(kind: str, doc, *, tuned: bool = True) -> bytes:
    if kind == "yaml":
        buf = io.StringIO()
        yaml_rt(tuned).dump(doc, buf)
        return buf.getvalue().encode("utf-8")
    fmt = plistlib.FMT_BINARY if kind == "bplist" else plistlib.FMT_XML
    # plistlib sorts keys by default; tuned keeps the file's own order.
    return plistlib.dumps(doc, fmt=fmt, sort_keys=not tuned, aware_datetime=True)


# ------------------------------------------------------- surgical YAML edits

_PLAIN_END = re.compile(r"\s+#|\s*$")


def _yaml_scalar_span(line: str, col: int) -> tuple[int, int]:
    """End column of a single-line scalar token starting at col."""
    q = line[col]
    if q == "'":
        i = col + 1
        while True:
            i = line.index("'", i)
            if line[i + 1 : i + 2] == "'":
                i += 2
                continue
            return col, i + 1
    if q == '"':
        i = col + 1
        while line[i] != '"':
            i += 2 if line[i] == "\\" else 1
        return col, i + 1
    if q in "|>":
        raise ValueError("block scalar: surgical edit not supported")
    m = _PLAIN_END.search(line, col)
    return col, m.start()


def _yaml_render(value: str, style_char: str) -> str:
    """Render a string scalar, keeping the original quote style when safe."""
    if style_char == "'":
        return "'" + value.replace("'", "''") + "'"
    if style_char == '"':
        return json.dumps(value)
    probe = YAML(typ="safe").load(f"k: {value}\n")
    if probe == {"k": value} and "#" not in value and "\n" not in value:
        return value
    return json.dumps(value)


def yaml_set_scalar(text: str, doc, key: str, value: str) -> str:
    line_no, col = doc.lc.value(key)
    lines = text.splitlines(keepends=True)
    line = lines[line_no]
    start, end = _yaml_scalar_span(line, col)
    lines[line_no] = line[:start] + _yaml_render(value, line[start]) + line[end:]
    return "".join(lines)


def yaml_append_scalar(text: str, doc, key: str, value: str) -> str:
    seq = doc[key]
    if seq.fa.flow_style():
        raise ValueError("flow sequence: not handled in the spike")
    line_no, col = seq.lc.item(len(seq) - 1)
    lines = text.splitlines(keepends=True)
    last = lines[line_no]
    dash = last.rindex("-", 0, col)
    if not isinstance(seq[-1], str):
        raise ValueError("last item is not a scalar")
    new = last[:dash] + last[dash:col] + _yaml_render(value, "") + "\n"
    if not last.endswith("\n"):
        lines[line_no] = last + "\n"
    lines.insert(line_no + 1, new)
    return "".join(lines)


# ------------------------------------------------ surgical XML plist edits

_TOKEN = re.compile(
    r"<!--.*?-->|<\?.*?\?>|<!DOCTYPE[^>]*>"
    r"""|<(/?)([A-Za-z]+)(?:\s+(?:[^>"/]|"[^"]*")*)?(/?)>""",
    re.S,
)


@dataclass
class Node:
    tag: str
    start: int  # offset of "<"
    end: int = 0  # offset after the closing ">"
    inner_start: int = 0
    inner_end: int = 0
    children: list["Node"] = field(default_factory=list)


def plist_spans(text: str) -> Node:
    """Element tree with byte spans. Comments and whitespace are skipped."""
    root = Node("#root", 0)
    stack = [root]
    for m in _TOKEN.finditer(text):
        closing, tag, empty = m.group(1), m.group(2), m.group(3)
        if tag is None:
            continue
        if closing:
            node = stack.pop()
            assert node.tag == tag, (node.tag, tag)
            node.inner_end, node.end = m.start(), m.end()
        else:
            node = Node(tag, m.start(), inner_start=m.end())
            stack[-1].children.append(node)
            if empty:
                node.end = node.inner_end = m.end()
            else:
                stack.append(node)
    return root


def _top_dict_value(text: str, key: str) -> Node:
    top = plist_spans(text).children[0].children[0]  # <plist><dict>
    kids = top.children
    for k, v in zip(kids[0::2], kids[1::2]):
        if text[k.inner_start : k.inner_end] == escape(key):
            return v
    raise KeyError(key)


def plist_set_string(text: str, key: str, value: str) -> str:
    v = _top_dict_value(text, key)
    if v.tag != "string":
        raise ValueError(f"{key} is <{v.tag}>, not <string>")
    return text[: v.inner_start] + escape(value) + text[v.inner_end :]


def plist_append_string(text: str, key: str, value: str) -> str:
    v = _top_dict_value(text, key)
    if v.tag != "array" or not v.children:
        raise ValueError("needs a non-empty <array>")
    last = v.children[-1]
    indent = text[text.rfind("\n", 0, last.start) + 1 : last.start]
    new = f"\n{indent}<string>{escape(value)}</string>"
    return text[: last.end] + new + text[last.end :]


# ------------------------------------------------------- tagged JSON codec

SAFE_INT = 2**53 - 1


def to_tagged(x):
    if isinstance(x, bool) or x is None or isinstance(x, str):
        return x if not isinstance(x, str) else str(x)
    if isinstance(x, int):
        return int(x) if abs(x) <= SAFE_INT else {"$type": "int", "value": str(int(x))}
    if isinstance(x, float):
        # JSON/JS cannot tell 2.0 from 2: tag every real so <real> stays <real>.
        return {"$type": "real", "value": repr(float(x))}
    if isinstance(x, dt.datetime):
        return {"$type": "date", "value": x.isoformat()}
    if isinstance(x, (bytes, bytearray)):
        return {"$type": "data", "value": base64.b64encode(x).decode()}
    if isinstance(x, dict):
        # Ordered pairs: JS objects reorder integer-like keys ("10" before "a").
        return {
            "$type": "dict",
            "value": [[str(k), to_tagged(v)] for k, v in x.items()],
        }
    if isinstance(x, list):
        return [to_tagged(v) for v in x]
    raise TypeError(type(x))


def from_tagged(x):
    if isinstance(x, list):
        return [from_tagged(v) for v in x]
    if isinstance(x, dict):
        t, v = x["$type"], x["value"]
        if t == "int":
            return int(v)
        if t == "real":
            return float(v)
        if t == "date":
            return dt.datetime.fromisoformat(v)
        if t == "data":
            return base64.b64decode(v)
        if t == "dict":
            return {k: from_tagged(val) for k, val in v}
        raise ValueError(t)
    return x


def kind_of(x) -> str:
    for name, t in (
        ("bool", bool),
        ("int", int),
        ("real", float),
        ("str", str),
        ("bytes", (bytes, bytearray)),
        ("date", dt.datetime),
        ("dict", dict),
        ("list", list),
    ):
        if isinstance(x, t):
            return name
    return type(x).__name__


def strict_equal(a, b, path="$") -> str | None:
    """None if equal in value, type and key order; else the first mismatch."""
    if kind_of(a) != kind_of(b):
        return f"{path}: {kind_of(a)} vs {kind_of(b)}"
    if isinstance(a, dict):
        if list(a) != list(b):
            return f"{path}: key order/set differs"
        for k in a:
            if r := strict_equal(a[k], b[k], f"{path}.{k}"):
                return r
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path}: length differs"
        for i, (p, q) in enumerate(zip(a, b)):
            if r := strict_equal(p, q, f"{path}[{i}]"):
                return r
        return None
    return None if a == b else f"{path}: {a!r} != {b!r}"
