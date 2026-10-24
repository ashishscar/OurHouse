"""Offline OCR geometry experiment; never invent or correct recognized text."""
import math
import statistics
import re
from decimal import Decimal, InvalidOperation


def assemble(record, threshold=1.5, margin=0.25):
    """Order OCR quadrilaterals without changing their literal text or amounts.

    This is an offline experiment, not a production parser. An unassigned or
    ambiguous amount remains in the output and the review diagnostics. A nearby
    negative amount may attach only to an explicit printed promotion label.
    """
    fields = [record.get(name) for name in ("texts", "boxes", "scores")]
    if not all(isinstance(values, list) for values in fields):
        raise ValueError("OCR fields must be lists")
    if len({len(values) for values in fields}) != 1:
        raise ValueError("OCR fields have different lengths")
    if len(fields[0]) > 3000:
        raise ValueError("Too many OCR boxes for this offline assembler")
    for text, quad, score in zip(*fields):
        if not isinstance(text, str) or not text.strip():
            raise ValueError("OCR text must be nonempty")
        if not isinstance(score, (int, float)) or not math.isfinite(score):
            raise ValueError("OCR confidence must be finite")
        if (not isinstance(quad, list) or len(quad) != 4
                or any(not isinstance(point, list) or len(point) != 2 for point in quad)
                or any(not isinstance(v, (int, float)) or not math.isfinite(v)
                       for point in quad for v in point)):
            raise ValueError("OCR boxes require four finite points")
    if not math.isfinite(threshold) or threshold <= 0 or not math.isfinite(margin) or margin < 0:
        raise ValueError("Invalid spatial thresholds")
    return _assemble(record, threshold, margin)
PRICE = re.compile('^\\s*[*]?\\s*(?:[-−]\\s*)?\\$?\\s*\\d+(?:[.,]\\d{2})(?:\\s*[-−])?\\s*[A-Z*]{0,3}\\s*$')

def norm_box(index, text, q, score):
    left = [(q[0][k] + q[3][k]) / 2 for k in [0, 1]]
    right = [(q[1][k] + q[2][k]) / 2 for k in [0, 1]]
    h = (math.dist(q[0], q[3]) + math.dist(q[1], q[2])) / 2
    dx = right[0] - left[0]
    return {'index': index, 'text': text, 'x': (left[0] + right[0]) / 2, 'y': (left[1] + right[1]) / 2, 'slope': (right[1] - left[1]) / dx if abs(dx) > 1 else 0, 'h': max(1, h), 'width': math.dist(left, right), 'score': score, 'money': bool(PRICE.fullmatch(text))}

def x_overlap(a, b):
    return max(0, min(a['x'] + a['width'] / 2, b['x'] + b['width'] / 2) - max(a['x'] - a['width'] / 2, b['x'] - b['width'] / 2))

def distance(a, b):
    anchor, other = (a, b) if a['width'] >= b['width'] else (b, a)
    return abs(other['y'] - anchor['y'] - anchor['slope'] * (other['x'] - anchor['x'])) / max(1, (a['h'] + b['h']) / 2)

def _assemble(record, threshold=1.5, margin=0.25):
    boxes = [norm_box(i, t, q, s) for i, (t, q, s) in enumerate(zip(record['texts'], record['boxes'], record['scores']))]
    anchors = [b for b in boxes if not b['money'] and abs(b['slope']) < 1]
    prices = [b for b in boxes if b['money']]
    if not anchors:
        return {'lines': [b['text'] for b in boxes], 'unmatched': [b['index'] for b in prices], 'ambiguous': [], 'assignments': []}
    xref = statistics.median((a['x'] - a['width'] / 2 for a in anchors))
    rows = []
    for a in sorted(anchors, key=lambda a: a['y'] + a['slope'] * (xref - a['x'])):
        candidates = []
        for i, row in enumerate(rows):
            if any((x_overlap(a, b) > 0.15 * min(a['width'], b['width']) for b in row['members'])):
                continue
            d = distance(row['rep'], a)
            if d < 0.65:
                candidates.append((d, i))
        if candidates:
            _, i = min(candidates)
            row = rows[i]
            row['members'].append(a)
            if a['width'] > row['rep']['width']:
                row['rep'] = a
        else:
            rows.append({'rep': a, 'members': [a], 'prices': []})
    ignored_ids = []
    kept = []
    for row in rows:
        label = ' '.join((b['text'] for b in sorted(row['members'], key=lambda b: b['x']))).strip()
        if re.fullmatch('\\d{4,14}/?', label):
            ignored_ids.extend((b['index'] for b in row['members']))
        else:
            kept.append(row)
    rows = sorted(kept, key=lambda row: row['rep']['y'] + row['rep']['slope'] * (xref - row['rep']['x']))
    coarse = statistics.median((a['slope'] for a in anchors))
    prices = sorted(prices, key=lambda b: b['y'] + coarse * (xref - b['x']))
    n, m = (len(rows), len(prices))
    weights = [[None] * m for _ in range(n)]
    distances = [[None] * m for _ in range(n)]
    for i, row in enumerate(rows):
        a = row['rep']
        text = ' '.join((b['text'] for b in sorted(row['members'], key=lambda b: b['x'])))
        rate = re.search(r'(\d+(?:[.,]\d{1,3})?)\s*(?:kg|lbs?|g|ml|l|each|pcs?)?\s*@\s*[$]?\s*(\d+[.,]\d{2})(?:\s*(?:per\s*(?:1\s*)?(?:kg|lbs?|g|ml|l)|/(?:kg|lbs?|g|ml|l)|ea[.]?))?\s*$', text, re.I)
        rate_total = (Decimal(rate[1].replace(',', '.')) * Decimal(rate[2].replace(',', '.'))
                      if rate else None)
        has_amount = bool(re.search('\\d+[.,]\\d{2}\\s*[A-Z*]{0,3}$', text) and '@' not in text)
        for j, price in enumerate(prices):
            negative = bool(re.search('[-−]', price['text']))
            promotion = bool(re.search('^(?:\\d+\\s+FOR\\b|DISCOUNT\\b|SAVINGS?\\b|COUPON\\b|(?:\\d+\\s+)?(?:TPD\\s*/|/\\s*\\d))', text.strip(), re.I))
            if negative and (not promotion):
                continue
            if has_amount and (not (negative and promotion)):
                continue
            # A curved page can tilt its left and right columns differently.
            # Integrate the two observed local baselines across the gap rather
            # than extending only the label's tangent into the price column.
            slope = (a['slope'] + price['slope']) / 2
            d = abs(price['y'] - a['y'] - slope * (price['x'] - a['x'])) / max(1, (a['h'] + price['h']) / 2)
            bound = 3.0 if negative and promotion else threshold
            if d <= bound:
                weights[i][j] = 4 - d if negative else 3 - d
                # Printed arithmetic supports an existing spatial edge only.
                # It never creates a price, reaches beyond the spatial bound,
                # or assigns a negative promotion amount to a purchase.
                numeric = re.search(r'\d+[.,]\d{2}', price['text'])
                if not negative and rate_total is not None and numeric:
                    try:
                        observed = Decimal(numeric[0].replace(',', '.'))
                        if abs(observed - rate_total) <= Decimal('.03'):
                            weights[i][j] += 2
                    except InvalidOperation:
                        pass
                distances[i][j] = d
    forward = [[0.0] * (m + 1) for _ in range(n + 1)]
    backward = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            w = weights[i][j]
            forward[i + 1][j + 1] = max(forward[i][j + 1], forward[i + 1][j], forward[i][j] + w if w is not None else -1)
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            w = weights[i][j]
            backward[i][j] = max(backward[i + 1][j], backward[i][j + 1], w + backward[i + 1][j + 1] if w is not None else -1)
    best = forward[n][m]
    i, j = (n, m)
    path = {}
    while i and j:
        w = weights[i - 1][j - 1]
        if w is not None and abs(forward[i][j] - (forward[i - 1][j - 1] + w)) < 1e-08:
            path[j - 1] = i - 1
            i -= 1
            j -= 1
        elif forward[i - 1][j] >= forward[i][j - 1]:
            i -= 1
        else:
            j -= 1
    matches = []
    unmatched = []
    ambiguous = []
    for j, price in enumerate(prices):
        if j not in path:
            unmatched.append(price['index'])
            continue
        i = path[j]
        alternatives = [forward[k][j] + weights[k][j] + backward[k + 1][j + 1] for k in range(n) if k != i and weights[k][j] is not None]
        alternatives.extend((forward[k][j] + backward[k][j + 1] for k in range(n + 1)))
        runner = max(alternatives, default=-math.inf)
        if best - runner < margin:
            ambiguous.append(price['index'])
            continue
        rows[i]['prices'].append(price)
        matches.append({'price': price['index'], 'anchors': [a['index'] for a in rows[i]['members']], 'distance': distances[i][j], 'global_margin': best - runner})
    output = []
    for row in rows:
        a = row['rep']
        y = a['y'] + a['slope'] * (xref - a['x'])
        text = ' '.join((b['text'] for b in sorted(row['members'] + row['prices'], key=lambda b: b['x'])))
        output.append((y, text))
    coarse = statistics.median((a['slope'] for a in anchors))
    for i in unmatched + ambiguous:
        b = boxes[i]
        output.append((b['y'] + coarse * (xref - b['x']), b['text']))
    output.sort()
    return {'lines': [t for _, t in output], 'unmatched': unmatched, 'ambiguous': ambiguous, 'assignments': matches, 'xref': xref, 'ignored_identifier_boxes': ignored_ids}
