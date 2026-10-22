# Private receipt vision training

This workflow trains image-to-structured-receipt extraction. Prompt changes and
passing application tests do not establish a model improvement. A training run,
learned adapter weights, before/after inference and source-held-out measurements
are required before calling an adapter trained or promoting it.

Keep original images, annotations, crops, model weights, adapters, predictions and
reports in ignored `work/` or outside this checkout. Never put them in GitHub,
application logs, CI artifacts or an external dataset repository. Crop verified
merchant, payment and account identifiers out before training. Training uses only
the owner's authorized examples; app users' receipts are not training data.

## Dataset contract

The private manifest is an array of objects with `id`, `source`, `sha256`, `split`
(`train`, `valid`, `test`), `verified: true` and normalized image `bounds`
(`[left, right, top, bottom]`). Bounds must be checked against the image to exclude
private headers/footers. The private annotation object maps each source ID to an
array of `{y, row}` records. `y` is the normalized vertical start of the product
block; `row` follows the five-field protocol in `receipts/row-prompt.json`.

Each row records a printed label, separate printed amount, printed quantity line,
supported short name and category. Do not guess a product identity, measurement or
price. Preserve printed abbreviations when uncertain. Negative discounts remain
metadata; repeated purchases remain separate products. A partial basket count is
not the receipt's overall count.

Prepare reviewed pairs with a Python environment containing Pillow:

```sh
python scripts/receipt-training/prepare.py \
  --manifest /private/path/manifest.json \
  --annotations /private/path/annotations.json \
  --output work/receipt-training/data
```

Preparation rejects changed files, exact duplicates and re-encoded pixel
duplicates. Split whole source receipts before tiling or augmentation; no crops
from a held-out source may enter training. Test and validation retain only the
normal tiling. Training adds shifted boundaries and mild contrast/blur variants.
Blue boundaries define ownership; faded adjacent context retains wrapped product
and quantity evidence without requiring name-based deduplication.

## Model and release checks

The candidate hosting route is a private rank-8 LoRA for Cloudflare's
`@cf/meta/llama-3.2-11b-vision-instruct`. Obtain the required Meta license, use-policy
and eligibility authorization before use; do not submit `agree` automatically.
Local MLX tools can train on Apple silicon without uploading the private dataset.
Do not enable training telemetry or upload to Hugging Face/W&B.

Use a separate local environment with `training/receipts/requirements.txt`. Place
the downloaded compatible model and the explicit MLX training config in ignored
`work/`. The reviewed settings are rank 8, alpha 16, language attention `q_proj`
and `v_proj`, batch size 1, completion-only loss, gradient checkpointing and full
validation at each checkpoint. Record the seed, learning rate, step count, prompt
hash, dataset manifest and environment versions beside each private run.

MLX-VLM 0.7.10's shared SFT trainer supplies a padding mask to Mllama, whose
forward path otherwise treats it as an attention mask. The local runner applies
the version-scoped causal bridge in `mllama_compat.py`. Run
`python scripts/receipt-training/test_causality.py` before training: modifying a
future synthetic token must not change earlier hidden states. Runs without this
bridge have invalid training losses and must not be used as candidates.

```sh
python scripts/receipt-training/train_local.py \
  --config work/receipt-training/candidate.json --license-accepted
python scripts/receipt-training/infer_local.py \
  --model work/receipt-training/base-model \
  --data work/receipt-training/data/valid.jsonl \
  --output work/receipt-training/base-valid.jsonl
# Repeat with --adapter work/receipt-training/adapters/candidate for comparison.
node scripts/receipt-training/evaluate.mjs \
  work/receipt-training/base-valid.jsonl work/receipt-training/base-valid-report.json
```

The local runner disables Hub access and telemetry and caps MLX allocation. It
uses the existing Mac rather than paid cloud training. Keep the Cloudflare
account on Workers Free: the provider's daily free AI allowance must stop cloud
reads when exhausted. Do not upgrade, buy credits, provision paid compute or
enable billable overage. On-device fallback must remain available. Free service
limits mean unlimited cloud scanning cannot be promised.

Evaluate the unmodified base and each candidate with identical decoding settings
on validation receipts. Keep final test receipts out of training and parameter
selection. Compare purchased-line recall/precision, printed-label fidelity,
amounts, quantities, categories, subtotal reconciliation and end-to-end latency.
Preserve failure cases; equal totals are not proof of correct extraction.

Export only a verified compatible adapter and configuration to the owner's
private Cloudflare fine-tune. Check tensor names, shapes, rank and maximum adapter
size before upload. Verify hosted inference separately from local inference.
An untested adapter, a faster incomplete result or an improvement only on training
photos must not replace the production scanner. Existing exact-build, isolation,
idempotency, clean-source and rollback release gates still apply.
