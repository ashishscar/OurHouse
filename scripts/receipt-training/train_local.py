"""Run an explicitly configured, offline-only MLX receipt training job."""
import argparse
import json
import os
import sys
from pathlib import Path

from prepare import private_output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--memory-gib", type=int, default=18)
    parser.add_argument("--license-accepted", action="store_true",
                        help="Use only after the model owner has authorized the license and eligibility requirements.")
    args = parser.parse_args()
    if not args.license_accepted:
        raise ValueError("The model license and eligibility must be authorized before training")
    if not 8 <= args.memory_gib <= 24:
        raise ValueError("Choose a reviewed memory limit between 8 and 24 GiB")
    settings = json.loads(args.config.read_text())
    if settings.get("wandb") or settings.get("dataset"):
        raise ValueError("External training datasets and telemetry are disabled")
    if settings.get("compile") or settings.get("gradient_accumulation_steps", 1) != 1:
        raise ValueError("The numerical guard requires eager, single-step updates")
    for key in ["model", "data"]:
        if not Path(settings[key]).is_dir():
            raise ValueError("Model and data must be existing local directories")
    if "output_path" not in settings or "adapter_file" in settings:
        raise ValueError("Use one explicit private output_path")
    private_output(Path(settings["output_path"]))
    if settings.get("train_type") != "lora" or settings.get("lora_rank") != 8:
        raise ValueError("This workflow requires the reviewed rank-8 LoRA configuration")
    os.environ.update(HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                      TOKENIZERS_PARALLELISM="false", WANDB_MODE="disabled")
    import mlx.core as mx
    from mlx_vlm.train import main as train
    from mllama_compat import install_causal_padding_fix, install_text_only_cross_attention_fix
    from numerics import install_numerical_guard

    mx.set_memory_limit(args.memory_gib*1024**3)
    mx.set_cache_limit(1024**3)
    install_causal_padding_fix()
    install_text_only_cross_attention_fix()
    install_numerical_guard()
    # The upstream CLI reads only this local config. No provider/API keys are used.
    sys.argv = [sys.argv[0], "--config", str(args.config.resolve())]
    train()


if __name__ == "__main__":
    main()
