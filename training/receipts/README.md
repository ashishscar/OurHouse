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

### Angles and perspective

Use reviewed **complete receipt** pairs for pose augmentation. Do not rotate
ownership strips: a transformed boundary can cross a label or change which
purchase owns its quantity continuation. Check all first/last labels and prices
before approving complete-receipt privacy bounds.

```sh
python scripts/receipt-training/test_angles.py
python scripts/receipt-training/angles.py \
  --data work/receipt-training/reviewed-whole-receipts \
  --output work/receipt-training/angled-receipts
```

The fixed policy includes the original view, clockwise/anticlockwise 18-degree
rotation, left/right perspective and combined perspective with 8-degree rotation.
Rotations expand the canvas; perspective maps the complete source into an inset
quadrilateral. Product targets remain unchanged, and source EXIF is omitted.
Review the generated private images and `poses.private.json` before training.
These transforms simulate camera poses; they do not establish accuracy on real
curved, folded, blurred or partially obscured receipts.

Source receipts keep their original train/validation/test split. Derived views
are not additional independent receipts. The inference and evaluation tools
retain `pose` and report each source/pose separately, including a per-pose summary,
so a good straight scan cannot hide failures on angled versions. Compare base
and trained models with identical decoding, images and independent references.

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
The same version's text-only path also runs vision decoder layers without image
states. For a separate naming task with no image, both local runners skip these
layers unless a populated vision cache is supplied, following the reference
Mllama text-only behavior. The synthetic checks cover odd sequence lengths,
future-token isolation and preservation of image/cached-image cross-attention.
Verify mixed image/text batches through the actual trainer runtime before a run;
passing preparation alone does not establish valid forward/backward execution.
The runner also checks each loss and gradient for finite values before the
optimizer runs and clips the global gradient norm to 1. Run
`python scripts/receipt-training/test_numerics.py` to verify these checks. Stop and
diagnose a non-finite batch; never skip it or publish a later corrupted adapter.

```sh
python scripts/receipt-training/train_local.py \
  --config work/receipt-training/candidate.json --license-accepted
python scripts/receipt-training/infer_local.py \
  --model work/receipt-training/base-model \
  --data work/receipt-training/data/valid.jsonl \
  --output work/receipt-training/base-valid.jsonl
# Repeat with --adapter work/receipt-training/adapters/candidate for comparison.
node scripts/receipt-training/evaluate.mjs \
  work/receipt-training/base-valid.jsonl work/receipt-training/base-valid-report.json \
  work/receipt-training/data/valid.jsonl
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
For a structurally rejected receipt, `rowDiagnostics` identifies malformed row
indices and separately examines rows that individually satisfy the protocol.
It never repairs a row or changes the strict receipt result or aggregate score.
These partial diagnostics help investigate failures; they cannot approve a model.
`metadataExact` checks separate discount, subtotal, tax, total and item-count rows.
`exactExtraction` requires matching purchased labels, names, amounts, stock and
categories, matching metadata, no missing or extra purchases, and the reference
net amount. `completeExactSplit` additionally requires every reference image and
known successful completion. These are dataset checks, not deployment approval:
final held-out tests, hosted timing and the normal release gates remain required.
The evaluator requires the independent reference split. Missing crops retain all
expected purchases, duplicate crops are rejected and unknown provider completion
status is reported separately. A diagnostic `infer_local.py --limit 1` run must
never be presented as a complete split. Its token progress and `--max-seconds`
budget expose stalled/looping generation; timeout outputs remain failed cases.

Export only a verified compatible adapter and configuration to the owner's
private Cloudflare fine-tune. Check tensor names, shapes, rank and maximum adapter
size before upload. Verify hosted inference separately from local inference.
An untested adapter, a faster incomplete result or an improvement only on training
photos must not replace the production scanner. Existing exact-build, isolation,
idempotency, clean-source and rollback release gates still apply.

### Experimental separate naming task

`infer_two_stage.py` benchmarks a separately trained three-field vision task and
text-only naming task with the same local model. Its private prompt file contains
`fields` and `names` instructions. Vision returns
`{"entries":[[printed_label,line_total,quantity_line],...]}`; naming receives only
the actual predicted product labels and returns indexed names/sections. The
strict join preserves every purchase and its literal amount/quantity. It rejects
missing/duplicate naming indices, malformed prices and ambiguous metadata.
Identical printed labels share a naming request, never a purchase record.

Use an original five-field reference split with this runner and score its output
with the same independent evaluator above. Reference answers are never model
inputs. A naming component test given correct reference labels is an oracle
diagnostic only; it cannot establish extraction accuracy. Combined generation
time includes both calls and failed responses. This experiment has no app route
and does not approve a model or demonstrate phone/hosted performance.

```sh
python scripts/receipt-training/test_two_stage.py
python scripts/receipt-training/infer_two_stage.py \
  --model work/receipt-training/base-model \
  --adapter work/receipt-training/adapters/candidate \
  --data work/receipt-training/reviewed-whole-receipts/valid.jsonl \
  --prompts work/receipt-training/two-stage-prompts.private.json \
  --output work/receipt-training/two-stage-valid.jsonl
```

### Experimental small OCR recognizer

The private OCR control separates detected quadrilaterals, literal character
recognition, spatial ordering and semantic naming. `ocr_layout.py` joins rows by
their local text baseline and an ordered amount assignment. Negative amounts
attach only to explicit promotion text. Ambiguous/unmatched amounts stay in the
output and diagnostics. Numeric identifier-only boxes remain available in the
input and are listed separately when omitted from the assembled text. Repeated
purchases are never deduplicated by name. This module has no app route.

`ctc.py` supports supervised recognition using an inference-only CTC network. It
keeps batch normalization/dropout in evaluation mode and returns logits through
the same recognition layers, avoiding an absent auxiliary training head. It
rejects blank/unknown target tokens, impossible repeated-letter alignment,
nonfinite losses and nonfinite gradients before optimizer advancement. A
nonfinite post-update weight invalidates that update and checkpoint.

Before training, visually check each exact crop against independently annotated
printed text. Exclude incomplete crops and crops containing unlabelled adjacent
text. Label-only fine-tuning can degrade amounts and quantities: compare a
balanced set of independently checked labels, prices, signs, tax affixes and
quantity lines. Teacher predictions are not ground truth. Keep whole-source
validation/test separation. Verify a trained export against the exact training
runtime across batch sizes and input widths; similarly named vendor Torch/ONNX
checkpoints must not be assumed numerically identical.

Literal OCR and spatial checks do not establish short-name/category accuracy,
metadata fidelity, phone latency or production readiness. Preserve failed
receipts and run the complete independent evaluator and release gates before
integration. Learned checkpoints and private review sheets remain in ignored
`work/`, including exported ONNX files; publishing client weights needs separate
review because a downloadable model distributes the learned weights.

```sh
python scripts/receipt-training/test_ocr_layout.py
# Only in an explicitly prepared local PyTorch environment:
python scripts/receipt-training/test_ctc.py
```
