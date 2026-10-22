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
    args = parser.parse_args()
    output = private_output(args.output.parent) / args.output.name
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import mlx.core as mx
    from mlx_vlm import load, generate
    from mlx_vlm.prompt_utils import apply_chat_template

    mx.set_memory_limit(18 * 1024**3)
    mx.set_cache_limit(1024**3)
    model, processor = load(str(args.model), adapter_path=str(args.adapter) if args.adapter else None)
    model.eval()
    examples = [json.loads(line) for line in args.data.read_text().splitlines() if line.strip()]
    # A new file is intentional: accidentally appending mixed model runs invalidates timing.
    with output.open("x", encoding="utf-8") as file:
        for index, example in enumerate(examples):
            messages = example["messages"]
            if messages[-1]["role"] != "assistant":
                raise ValueError("Missing reference completion")
            prompt = apply_chat_template(processor, model.config, messages[:-1], num_images=len(example["images"]))
            start = time.perf_counter()
            result = generate(model, processor, prompt, image=example["images"], max_tokens=args.max_tokens,
                              temperature=0, verbose=False)
            record = {"source_group": example["source_group"], "images": example["images"],
                      "expected": json.loads(messages[-1]["content"]), "prediction": result.text,
                      "seconds": time.perf_counter()-start, "finish_reason": result.finish_reason,
                      "generated_tokens": result.generation_tokens, "peak_gb": result.peak_memory}
            file.write(json.dumps(record, ensure_ascii=False)+"\n")
            file.flush()
            print(json.dumps({"example": index+1, "of": len(examples), "seconds": round(record["seconds"], 2),
                              "tokens": result.generation_tokens, "finish": result.finish_reason}), flush=True)
            mx.clear_cache()


if __name__ == "__main__":
    main()
