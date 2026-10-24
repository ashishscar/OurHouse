"""Protocol regressions use invented examples only."""
import unittest
from two_stage import prepare_entries, join_names


class TwoStageTest(unittest.TestCase):
    def test_repeats_keep_each_purchase_and_quantity(self):
        prepared, labels = prepare_entries({"entries": [
            ["EXAMPLE OATS 250G", "2.31", ""],
            ["EXAMPLE OATS 250G", "6.93", "3 @ $2.31"],
            ["Coupon", "-1.10", ""], ["SUB-TOTAL", "8.14", ""],
            ["HST 13%", "0.00", ""], ["TOTAL", "8.14", ""],
            ["Number of products", "4", ""]]})
        self.assertEqual(labels, [[0, "EXAMPLE OATS 250G"]])
        result = join_names(prepared, labels, {"labels": [[0, "Oats", "pantry"]]})
        self.assertEqual(result["rows"][:2], [
            ["EXAMPLE OATS 250G", "2.31", "", "Oats", "p"],
            ["EXAMPLE OATS 250G", "6.93", "3 @ $2.31", "Oats", "p"]])
        self.assertEqual([r[4] for r in result["rows"]], list("ppdsxtc"))
        self.assertEqual(result["rows"][2], ["Coupon", "1.10", "", "", "d"])

    def test_full_label_required_for_metadata(self):
        prepared, labels = prepare_entries({"entries": [["TOTAL WHOLEGRAIN CEREAL", "3.87", ""]]})
        self.assertEqual(labels, [[0, "TOTAL WHOLEGRAIN CEREAL"]])

    def test_rejects_malformed_field_rows_without_repair(self):
        for entry in [["Oats", "$2.31", ""], ["Oats", "", ""],
                      ["Oats", "2.31", "", "Oats"], ["Coupon", "--1.10", ""],
                      ["TOTAL", "2.31", "2 @ $1.15"], ["Number of products", "4.00", ""],
                      ["BOB Count", "4", ""], ["Discount", "1.10", ""]]:
            with self.subTest(entry=entry), self.assertRaises(ValueError):
                prepare_entries({"entries": [entry]})

    def test_naming_indices_must_cover_exactly_the_supplied_labels(self):
        prepared, labels = prepare_entries({"entries": [["OATS", "2.31", ""]]})
        for answers in [[], [[1, "Oats", "pantry"]], [[True, "Oats", "pantry"]],
                        [[0, "Oats", "pantry"], [0, "Oats", "pantry"]],
                        [[0, "Oats", "other"]], [[0, "", "pantry"]]]:
            with self.subTest(answers=answers), self.assertRaises(ValueError):
                join_names(prepared, labels, {"labels": answers})

    def test_metadata_only_receipt_does_not_need_naming(self):
        prepared, labels = prepare_entries({"entries": [["TOTAL", "0.00", ""]]})
        self.assertEqual(join_names(prepared, labels, {"labels": []}),
                         {"rows": [["TOTAL", "0.00", "", "", "t"]]})

    def test_name_cannot_change_fields_or_merge_purchases(self):
        prepared, labels = prepare_entries({"entries": [["ABC BLUE", "7.31", "2 @ $3.655"]]})
        result = join_names(prepared, labels, {"labels": [[0, "ABC BLUE", "unknown"]]})
        self.assertEqual(result["rows"], [["ABC BLUE", "7.31", "2 @ $3.655", "ABC BLUE", "u"]])


if __name__ == "__main__":
    unittest.main()
