"""Private experimental benchmark: image fields, then names of predicted labels.

This is not an app integration. Original five-field reference answers are stored
for independent scoring only; neither model call receives reference answers.
"""
import argparse
import json
import os
import time
from pathlib import Path

from prepare import private_output
from two_stage import prepare_entries, join_names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--data", type=Path, required=True,
                        help="Original five-field reference split, with image paths")
    parser.add_argument("--prompts", type=Path, required=True,
                        help="Private JSON with fields and names instructions")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-tokens", type=int, default=1800)
    parser.add_argument("--max-seconds", type=float, default=240,
                        help="Combined generation budget per receipt; prefill is not interruptible")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if args.max_tokens < 1 or args.max_seconds <= 0 or (args.limit is not None and args.limit < 1):
        raise ValueError("Generation limits must be positive")
    output = private_output(args.output.parent) / args.output.name
    if output.exists():
        raise ValueError("Do not overwrite a benchmark run")
    prompts = json.loads(args.prompts.read_text())
    if any(not isinstance(prompts.get(k), str) or not prompts[k] for k in ["fields", "names"]):
        raise ValueError("Missing task instructions")
    examples = [json.loads(s) for s in args.data.read_text().splitlines() if s.strip()]
    total = len(examples)
    if not total:
        raise ValueError("Empty reference split")
    if args.limit is not None:
        examples = examples[:args.limit]
    os.environ.update(HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", TOKENIZERS_PARALLELISM="false")
    import mlx.core as mx
    from mlx_vlm import load, stream_generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mllama_compat import install_text_only_cross_attention_fix

    mx.set_memory_limit(18 * 1024**3)
    mx.set_cache_limit(1024**3)
    install_text_only_cross_attention_fix()
    model, processor = load(str(args.model), adapter_path=str(args.adapter) if args.adapter else None)
    model.eval()

    def generate(instruction, images, deadline):
        if time.perf_counter() >= deadline:
            return {"text": "", "finish": "wall_limit", "tokens": 0, "seconds": 0}
        prompt = apply_chat_template(processor, model.config,
            [{"role": "user", "content": instruction}], num_images=len(images))
        chunks, last, timed_out = [], None, False
        start = time.perf_counter()
        stream = stream_generate(model, processor, prompt, image=images or None,
                                 max_tokens=args.max_tokens, temperature=0)
        try:
            for last in stream:
                chunks.append(last.text)
                if time.perf_counter() >= deadline and last.finish_reason is None:
                    timed_out = True
                    break
        finally:
            stream.close()
        if last is None:
            raise RuntimeError("No model response")
        return {"text": "".join(chunks), "finish": "wall_limit" if timed_out else last.finish_reason,
                "tokens": last.generation_tokens, "seconds": time.perf_counter() - start}

    with output.open("x", encoding="utf-8") as file:
        for index, example in enumerate(examples):
            images = example["images"]
            if not isinstance(images, list) or not images:
                raise ValueError("Missing image identity")
            start = time.perf_counter()
            deadline = start + args.max_seconds
            stages, prediction, finish, failure = {}, "", "protocol_error", None
            fields = generate(prompts["fields"], images, deadline)
            stages["fields"] = fields
            if fields["finish"] != "stop":
                finish = fields["finish"] or "unspecified"
            else:
                try:
                    prepared, labels = prepare_entries(fields["text"])
                    # Labels come only from vision output, never the reference.
                    names = generate(prompts["names"] + json.dumps(labels, separators=(",", ":"),
                                     ensure_ascii=False), [], deadline) if labels else {
                                         "text": '{"labels":[]}', "finish": "stop", "tokens": 0, "seconds": 0}
                    stages["names"] = names
                    if names["finish"] != "stop":
                        finish = names["finish"] or "unspecified"
                    else:
                        prediction = json.dumps(join_names(prepared, labels, names["text"]), ensure_ascii=False)
                        finish = "stop"
                except (ValueError, TypeError) as error:
                    failure = str(error)
            # Read reference completion only after both generation calls finish.
            completion = example["messages"][-1]
            if completion["role"] != "assistant":
                raise ValueError("Missing independent reference")
            record = {"source_group": example["source_group"], "images": images,
                "expected": json.loads(completion["content"]), "prediction": prediction,
                "seconds": time.perf_counter() - start, "finish_reason": finish,
                "stages": stages, "protocol_failure": failure, "split_examples": total,
                "evaluated_examples": len(examples)}
            if "pose" in example:
                record["pose"] = example["pose"]
            file.write(json.dumps(record, ensure_ascii=False) + "\n")
            file.flush()
            print(json.dumps({"example": index + 1, "of": len(examples),
                "seconds": round(record["seconds"], 2), "finish": finish,
                "stages": {k: {x: v[x] for x in ["finish", "tokens", "seconds"]} for k, v in stages.items()}}), flush=True)
            mx.clear_cache()


if __name__ == "__main__":
    main()
