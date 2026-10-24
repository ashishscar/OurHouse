"""Invented geometry only. No household receipts or learned weights."""
import copy
import math
import unittest

from ocr_layout import assemble


def quad(x, y, width=90, height=10, slope=0):
    return [[x, y-height/2], [x+width, y+slope*width-height/2],
            [x+width, y+slope*width+height/2], [x, y+height/2]]


def record(lines):
    return {"texts": [x[0] for x in lines], "boxes": [x[1] for x in lines],
            "scores": [.95] * len(lines)}


class SpatialOCRTests(unittest.TestCase):
    def test_repeated_purchases_are_separate(self):
        source = record([("APPLES", quad(0, 0)), ("APPLES", quad(0, 30)),
                         ("$2.00", quad(200, 0, 40)), ("$2.00", quad(200, 30, 40))])
        before = copy.deepcopy(source)
        result = assemble(source)
        self.assertEqual(result["lines"], ["APPLES $2.00", "APPLES $2.00"])
        self.assertEqual(source, before)

    def test_slanted_columns_use_text_baseline(self):
        source = record([("APPLES", quad(0, 0, slope=.2)),
                         ("PEARS", quad(0, 28, slope=.2)),
                         ("$2.00", quad(200, 40, 40, slope=.2)),
                         ("$4.00", quad(200, 68, 40, slope=.2))])
        self.assertEqual(assemble(source)["lines"], ["APPLES $2.00", "PEARS $4.00"])

    def test_discount_does_not_consume_next_product(self):
        source = record([("APPLES", quad(0, 0)), ("2 FOR $4.00", quad(0, 20)),
                         ("BANANAS", quad(0, 34)), ("-$1.00", quad(200, 34, 40)),
                         ("3 @ $0.50", quad(0, 52)), ("$1.50", quad(200, 52, 40))])
        result = assemble(source)
        self.assertIn("2 FOR $4.00 -$1.00", result["lines"])
        self.assertIn("BANANAS", result["lines"])
        self.assertNotIn("BANANAS -$1.00", result["lines"])

    def test_unexplained_negative_stays_unassigned(self):
        result = assemble(record([("APPLES", quad(0, 0)), ("-$2.00", quad(200, 0, 40))]))
        self.assertEqual(result["unmatched"], [1])
        self.assertIn("-$2.00", result["lines"])
        self.assertIn("APPLES", result["lines"])

    def test_ambiguous_amount_is_kept_for_review(self):
        result = assemble(record([("APPLES", quad(0, 0)), ("PEARS", quad(0, 10)),
                                  ("$2.00", quad(200, 5, 40))]))
        self.assertEqual(result["ambiguous"], [2])
        self.assertIn("$2.00", result["lines"])

    def test_bad_fields_fail_instead_of_zip_truncation(self):
        source = record([("APPLES", quad(0, 0))])
        for bad in [{**source, "scores": []}, {**source, "scores": [math.nan]},
                    {**source, "boxes": [[[0, math.inf]]*4]},
                    {**source, "texts": [""]}]:
            with self.assertRaises(ValueError):
                assemble(bad)

    def test_no_text_or_empty_input_never_loses_amounts(self):
        self.assertEqual(assemble(record([]))["lines"], [])
        result = assemble(record([("$2.00", quad(200, 0, 40))]))
        self.assertEqual(result["unmatched"], [0])
        self.assertEqual(result["lines"], ["$2.00"])


if __name__ == "__main__":
    unittest.main()
