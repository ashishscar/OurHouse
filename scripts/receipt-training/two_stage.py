"""Strict experimental field/naming join; never consult reference answers."""
import json
import re

MONEY = re.compile(r"\d{1,7}\.\d{2}")
COUNT = re.compile(r"\d{1,4}")
KINDS = {"pantry": "p", "household": "h", "unknown": "u"}


def json_object(text):
    if len(text) > 200000:
        raise ValueError("Oversized model response")
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError("Model response must be an object")
    return result


def _metadata(label, amount):
    upper = label.upper().strip()
    if amount.startswith("-"):
        if not MONEY.fullmatch(amount[1:]):
            raise ValueError("Invalid discount amount")
        return "d", amount[1:]
    if re.fullmatch(r"SUB[\s-]*TOTAL", upper):
        return "s", amount
    if upper == "TOTAL":
        return "t", amount
    if re.fullmatch(r"(?:H[ -])?(?:HST|GST|PST|QST|TAX)(?:\s+[\d.]+%?)?", upper):
        return "x", amount
    if re.fullmatch(r"(?:NUMBER\s+OF\s+(?:PRODUCTS|ITEMS)|ITEM\s+COUNT)\s*:?", upper):
        return "c", amount
    if re.search(r"BOB\s+COUNT", upper) or upper == "DISCOUNT":
        raise ValueError("Ambiguous or partial metadata")
    return None, amount


def prepare_entries(value):
    """Validate literal fields and return naming inputs plus purchase mapping.

    Identical labels share one naming query, but every purchase keeps its own
    position, amount and quantity. No output is filled from a benchmark target.
    """
    value = json_object(value) if isinstance(value, str) else value
    if not isinstance(value, dict) or set(value) != {"entries"}:
        raise ValueError("Expected only entries")
    entries = value["entries"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= 1000:
        raise ValueError("Invalid entry count")
    prepared, labels, indices = [], [], {}
    for entry in entries:
        if not isinstance(entry, list) or len(entry) != 3 or any(not isinstance(x, str) for x in entry):
            raise ValueError("Each entry requires three strings")
        label, amount, rate = entry
        if not label.strip() or len(label) > 160 or len(rate) > 160 or re.search(r"[\x00-\x1f<>]", label + rate):
            raise ValueError("Invalid entry text")
        label, rate = label.strip(), rate.strip()
        kind, amount = _metadata(label, amount)
        if not (COUNT if kind == "c" else MONEY).fullmatch(amount):
            raise ValueError("Invalid printed amount/count")
        if kind:
            if rate:
                raise ValueError("Metadata cannot own a quantity")
            prepared.append((label, amount, rate, kind, None))
        else:
            if label not in indices:
                indices[label] = len(labels)
                labels.append([len(labels), label])
            prepared.append((label, amount, rate, None, indices[label]))
    return prepared, labels


def join_names(prepared, labels, value):
    value = json_object(value) if isinstance(value, str) else value
    if not isinstance(value, dict) or set(value) != {"labels"} or not isinstance(value["labels"], list):
        raise ValueError("Expected only labels")
    answers = {}
    for answer in value["labels"]:
        if not isinstance(answer, list) or len(answer) != 3:
            raise ValueError("Invalid naming answer")
        index, name, section = answer
        if type(index) is not int or index < 0 or index >= len(labels) or index in answers:
            raise ValueError("Invalid or duplicate naming index")
        if not isinstance(name, str) or not name.strip() or len(name) > 80 or re.search(r"[\x00-\x1f<>]", name):
            raise ValueError("Invalid short name")
        if not isinstance(section, str) or section not in KINDS:
            raise ValueError("Invalid item section")
        answers[index] = (name.strip(), KINDS[section])
    if len(answers) != len(labels):
        raise ValueError("Missing naming answers")
    rows = []
    for label, amount, rate, kind, index in prepared:
        name, kind = ("", kind) if kind else answers[index]
        rows.append([label, amount, rate, name, kind])
    return {"rows": rows}
