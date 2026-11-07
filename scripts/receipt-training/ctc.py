"""Numerical guards for private supervised OCR recognition experiments.

No model, customer data, telemetry or network access is loaded by this module.
The caller owns dataset review, source splits, offline loading and evaluation.
"""


def recognition_logits(model, images):
    """Use the recognizer's inference path with logits and frozen BN/dropout.

    Some inference-only MultiHead exports omit their auxiliary training head.
    Calling model.train() on those exports is invalid. Require eval mode and
    temporarily change only the final CTC head's softmax flag instead.
    """
    if model.training:
        raise ValueError("The inference recognizer must keep BN/dropout frozen")
    head = model.head.ctc_head
    was_training = head.training
    try:
        head.training = True
        return head(model.head.ctc_encoder(model.backbone(images)))
    finally:
        head.training = was_training


def checked_ctc_loss(scores, targets, lengths):
    import torch
    if scores.ndim != 3 or not torch.isfinite(scores).all():
        raise FloatingPointError("OCR logits must be a finite batch/time/class tensor")
    if scores.shape[0] != len(lengths) or any(type(n) is not int or n <= 0 for n in lengths):
        raise ValueError("Every OCR target requires a positive length")
    if sum(lengths) != len(targets) or not targets:
        raise ValueError("OCR target lengths do not match their tokens")
    if any(type(t) is not int or not 0 < t < scores.shape[2] for t in targets):
        raise ValueError("OCR targets cannot contain the CTC blank or unknown tokens")
    offset = 0
    for length in lengths:
        tokens = targets[offset:offset+length]
        repeats = sum(a == b for a, b in zip(tokens, tokens[1:]))
        if length + repeats > scores.shape[1]:
            raise ValueError("OCR time axis cannot represent this target and its repeated letters")
        offset += length
    target = torch.tensor(targets, dtype=torch.long)
    target_lengths = torch.tensor(lengths, dtype=torch.long)
    input_lengths = torch.full((len(lengths),), scores.shape[1], dtype=torch.long)
    loss = torch.nn.functional.ctc_loss(scores.log_softmax(2).transpose(0, 1), target,
                                       input_lengths, target_lengths, blank=0,
                                       reduction="mean", zero_infinity=False)
    if not torch.isfinite(loss):
        raise FloatingPointError("Nonfinite OCR loss")
    return loss


def checked_update(model, optimizer, loss, max_norm=1.0):
    """Reject nonfinite loss/gradients before any optimizer state can change."""
    import math
    import torch
    if not math.isfinite(max_norm) or max_norm <= 0:
        raise ValueError("Gradient bound must be positive and finite")
    if loss.ndim != 0 or not torch.isfinite(loss):
        raise FloatingPointError("Nonfinite or nonscalar OCR loss")
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    if any(p.grad is not None and not torch.isfinite(p.grad).all() for p in model.parameters()):
        optimizer.zero_grad(set_to_none=True)
        raise FloatingPointError("Nonfinite OCR gradient")
    norm = torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm, error_if_nonfinite=True)
    optimizer.step()
    if any(not torch.isfinite(p).all() for p in model.parameters()):
        raise FloatingPointError("Nonfinite OCR weights: discard this update and checkpoint")
    return float(norm)
