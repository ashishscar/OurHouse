"""Export a rank-8 Mllama MLX adapter to legacy HF/PEFT tensor layout.

This checks shapes and LoRA delta equivalence, not hosted compatibility or model
quality. A successful hosted validation is still required before deployment.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from prepare import private_output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    import numpy as np
    from safetensors.numpy import load_file, save_file

    base = json.loads((args.model / "config.json").read_text())
    if base.get("model_type") != "mllama":
        raise ValueError("Only the reviewed Mllama mapping is supported")
    settings = json.loads((args.adapter / "adapter_config.json").read_text())
    lora = settings["lora_parameters"]
    if settings.get("fine_tune_type") != "lora" or lora["rank"] != 8:
        raise ValueError("Expected a rank-8 LoRA")
    source = args.adapter / "adapters.safetensors"
    weights = load_file(source)
    text = base["text_config"]
    dims = text["hidden_size"]
    v_dims = text["num_key_value_heads"] * (dims // text["num_attention_heads"])
    cross = set(text["cross_attention_layers"])
    expected = set()
    for layer in range(text["num_hidden_layers"]):
        attn = "cross_attn" if layer in cross else "self_attn"
        for module in ["q_proj", "v_proj"]:
            expected.add(f"language_model.model.layers.{layer}.{attn}.{module}")
    if set(lora["keys"]) != expected or len(weights) != len(expected)*2:
        raise ValueError("Unexpected modules or extra trainable weights")
    output = private_output(args.output)
    if any(output.iterdir()):
        raise ValueError("Export directory must be empty")
    converted = {}
    worst = 0.0
    rng = np.random.default_rng(369)
    for key in sorted(expected):
        if not re.fullmatch(r"language_model\.model\.layers\.\d+\.(?:self|cross)_attn\.[qv]_proj", key):
            raise ValueError("Unreviewed tensor path")
        a, b = weights[key+".lora_a"], weights[key+".lora_b"]
        out_dims = dims if key.endswith("q_proj") else v_dims
        if a.shape != (dims, 8) or b.shape != (8, out_dims):
            raise ValueError("Unexpected adapter dimensions")
        if not np.isfinite(a).all() or not np.isfinite(b).all() or not np.any(b):
            raise ValueError("Untrained or non-finite adapter")
        a_hf, b_hf = np.ascontiguousarray(a.T), np.ascontiguousarray(b.T)
        x = rng.normal(0, .05, (2, dims)).astype(np.float32)
        mlx_delta = ((x @ a) @ b) * lora["scale"]
        hf_delta = (b_hf @ (a_hf @ x.T)).T * lora["scale"]
        if not np.allclose(mlx_delta, hf_delta, atol=1e-6, rtol=1e-4):
            raise ValueError("Export changed adapter algebra")
        worst = max(worst, float(np.max(np.abs(mlx_delta-hf_delta))))
        converted["base_model.model."+key+".lora_A.weight"] = a_hf
        converted["base_model.model."+key+".lora_B.weight"] = b_hf
    config = {"base_model_name_or_path": "meta-llama/Llama-3.2-11B-Vision-Instruct",
              "peft_type": "LORA", "task_type": "CAUSAL_LM", "model_type": "llama",
              "r": 8, "lora_alpha": 8*lora["scale"], "lora_dropout": lora["dropout"],
              "bias": "none", "target_modules": ["q_proj", "v_proj"],
              "fan_in_fan_out": False, "inference_mode": True}
    destination = output / "adapter_model.safetensors"
    save_file(converted, destination)
    if destination.stat().st_size >= 300_000_000:
        raise ValueError("Adapter exceeds hosting size limit")
    (output / "adapter_config.json").write_text(json.dumps(config, indent=2)+"\n")
    report = {"source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "export_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
              "tensors": len(converted), "bytes": destination.stat().st_size,
              "max_delta_error": worst, "hosted_verified": False}
    (output / "export.private.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps({"tensors": len(converted), "bytes": report["bytes"],
                      "max_delta_error": worst, "hosted_verified": False}))


if __name__ == "__main__":
    main()
