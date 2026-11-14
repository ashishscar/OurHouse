"""Offline image-to-receipt benchmark. Predictions must remain private."""
import argparse
import json
import os
import time
from pathlib import Path

from prepare import private_output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--max-tokens", type=int, default=1600)
    parser.add_argument("--max-seconds", type=float, default=300,
                        help="Stop after this budget at the next generated token; prefill is not interruptible.")
    parser.add_argument("--limit", type=int, help="Explicit diagnostic subset; never report as a full-split benchmark.")
    args = parser.parse_args()
    if args.max_tokens < 1 or args.max_seconds <= 0 or (args.limit is not None and args.limit < 1):
        raise ValueError("Generation limits must be positive")
    output = private_output(args.output.parent) / args.output.name
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import mlx.core as mx
    from mlx_vlm import load, stream_generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mllama_compat import install_text_only_cross_attention_fix

    mx.set_memory_limit(18 * 1024**3)
    mx.set_cache_limit(1024**3)
    install_text_only_cross_attention_fix()
    model, processor = load(str(args.model), adapter_path=str(args.adapter) if args.adapter else None)
    model.eval()
    examples = [json.loads(line) for line in args.data.read_text().splitlines() if line.strip()]
    total_examples = len(examples)
    if args.limit is not None:
        examples = examples[:args.limit]
    # A new file is intentional: accidentally appending mixed model runs invalidates timing.
    with output.open("x", encoding="utf-8") as file:
        for index, example in enumerate(examples):
            messages = example["messages"]
            if messages[-1]["role"] != "assistant":
                raise ValueError("Missing reference completion")
            prompt = apply_chat_template(processor, model.config, messages[:-1], num_images=len(example["images"]))
            start = time.perf_counter()
            chunks, result, stopped = [], None, False
            stream = stream_generate(model, processor, prompt, image=example["images"],
                                     max_tokens=args.max_tokens, temperature=0)
            try:
                for result in stream:
                    chunks.append(result.text)
                    if result.generation_tokens and result.generation_tokens % 128 == 0:
                        print(json.dumps({"example": index+1, "tokens": result.generation_tokens,
                                          "seconds": round(time.perf_counter()-start, 2)}), flush=True)
                    if time.perf_counter()-start >= args.max_seconds and result.finish_reason is None:
                        stopped = True
                        break
            finally:
                stream.close()
            if result is None:
                raise ValueError("Model generated no result")
            record = {"source_group": example["source_group"], "images": example["images"],
                      "expected": json.loads(messages[-1]["content"]), "prediction": "".join(chunks),
                      "seconds": time.perf_counter()-start,
                      "finish_reason": "wall_limit" if stopped else result.finish_reason,
                      "split_examples": total_examples, "evaluated_examples": len(examples),
                      "generated_tokens": result.generation_tokens, "peak_gb": result.peak_memory}
            if "pose" in example:
                record["pose"] = example["pose"]
            file.write(json.dumps(record, ensure_ascii=False)+"\n")
            file.flush()
            print(json.dumps({"example": index+1, "of": len(examples), "seconds": round(record["seconds"], 2),
                              "tokens": result.generation_tokens, "finish": record["finish_reason"]}), flush=True)
            mx.clear_cache()


if __name__ == "__main__":
    main()
