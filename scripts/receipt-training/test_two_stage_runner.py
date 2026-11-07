"""No-GPU runner contract: generated labels only, strict failures and timing."""
import contextlib
import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import infer_two_stage


class RunnerTest(unittest.TestCase):
    def run_inference(self, responses):
        calls = []
        core = types.ModuleType("mlx.core")
        core.set_memory_limit = core.set_cache_limit = core.clear_cache = lambda *a: None
        mlx = types.ModuleType("mlx")
        mlx.core = core
        vlm = types.ModuleType("mlx_vlm")
        vlm.load = lambda *a, **kw: (types.SimpleNamespace(config={}, eval=lambda: None), object())
        template = types.ModuleType("mlx_vlm.prompt_utils")
        template.apply_chat_template = lambda p, c, messages, **kw: messages[0]["content"]
        compat = types.ModuleType("mllama_compat")
        compat.install_text_only_cross_attention_fix = lambda: None
        def generate(model, processor, prompt, **kwargs):
            calls.append((prompt, kwargs.get("image")))
            text, finish = responses[len(calls) - 1]
            yield types.SimpleNamespace(text=text, finish_reason=finish, generation_tokens=9)
        vlm.stream_generate = generate
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = {"source_group": "invented-reference", "images": ["invented-photo.jpg"],
                "messages": [{"role": "user", "content": "REFERENCE_PROMPT_MUST_NOT_ENTER_MODEL"},
                    {"role": "assistant", "content": json.dumps({"rows": [
                        ["REFERENCE_LABEL_MUST_NOT_ENTER_MODEL", "1.00", "", "Reference", "u"]]})}]}
            (root / "data.jsonl").write_text(json.dumps(reference) + "\n")
            (root / "prompts.json").write_text(json.dumps({"fields": "Read fields.", "names": "Name predicted labels: "}))
            args = ["infer_two_stage.py", "--model", "invented-model", "--data", str(root / "data.jsonl"),
                "--prompts", str(root / "prompts.json"), "--output", str(root / "output.jsonl")]
            with patch.dict(sys.modules, {"mlx": mlx, "mlx.core": core, "mlx_vlm": vlm,
                    "mlx_vlm.prompt_utils": template, "mllama_compat": compat}), \
                    patch.object(sys, "argv", args), contextlib.redirect_stdout(io.StringIO()):
                infer_two_stage.main()
            result = json.loads((root / "output.jsonl").read_text())
        return result, calls

    def test_both_calls_exclude_reference_and_keep_predicted_fields(self):
        result, calls = self.run_inference([
            ('{"entries":[["PREDICTED OATS 250G","2.31",""],["PREDICTED OATS 250G","6.93","3 @ $2.31"]]}', "stop"),
            ('{"labels":[[0,"Oats","pantry"]]}', "stop")])
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0], ("Read fields.", ["invented-photo.jpg"]))
        self.assertEqual(calls[1], ('Name predicted labels: [[0,"PREDICTED OATS 250G"]]', None))
        self.assertNotIn("REFERENCE", " ".join(prompt for prompt, _ in calls))
        self.assertEqual(json.loads(result["prediction"])["rows"], [
            ["PREDICTED OATS 250G", "2.31", "", "Oats", "p"],
            ["PREDICTED OATS 250G", "6.93", "3 @ $2.31", "Oats", "p"]])
        self.assertEqual(result["finish_reason"], "stop")
        self.assertGreaterEqual(result["seconds"], sum(stage["seconds"] for stage in result["stages"].values()))

    def test_invalid_fields_never_reach_naming(self):
        result, calls = self.run_inference([('{"entries":[["Oats","","2 @ $1.00"]]}', "stop")])
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["finish_reason"], "protocol_error")
        self.assertEqual(result["prediction"], "")

    def test_incomplete_naming_never_passes_as_complete_receipt(self):
        result, calls = self.run_inference([
            ('{"entries":[["Oats","2.31",""]]}', "stop"), ('{"labels":[]}', "stop")])
        self.assertEqual(result["finish_reason"], "protocol_error")
        self.assertEqual(result["prediction"], "")

    def test_truncated_vision_never_reaches_naming(self):
        result, calls = self.run_inference([('{"entries":[["Oats","2.31",""]]}', "length")])
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["finish_reason"], "length")
        self.assertEqual(result["prediction"], "")


if __name__ == "__main__":
    unittest.main()
