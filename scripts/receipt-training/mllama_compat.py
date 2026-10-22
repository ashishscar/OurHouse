"""Version-scoped training bridge for MLX-VLM 0.7.10 Mllama.

The shared SFT trainer supplies a 2D padding mask. Mllama interprets its mask as
an attention mask and creates a causal mask only when it receives None. Passing
the padding mask unchanged lets future completion tokens leak into training.
"""
from functools import wraps
from importlib.metadata import version


def causal_padding_mask(padding):
    import mlx.core as mx
    if padding.ndim != 2:
        raise ValueError("Expected batch-by-sequence padding mask")
    length = padding.shape[-1]
    causal = mx.arange(length)[None, :] <= mx.arange(length)[:, None]
    # Ignore padded keys. Padded queries are excluded by the trainer's loss mask.
    return causal[None, None, :, :] & padding[:, None, None, :].astype(mx.bool_)


def install_causal_padding_fix():
    if version("mlx-vlm") != "0.7.10":
        raise ValueError("Re-review the training mask bridge for this MLX-VLM version")
    from mlx_vlm.models.mllama.mllama import Model
    if getattr(Model.__call__, "_ourhouse_causal_bridge", False):
        return
    original = Model.__call__

    @wraps(original)
    def forward(self, input_ids, pixel_values=None, mask=None, cache=None, **kwargs):
        if mask is not None and mask.ndim == 2:
            if cache is not None or mask.shape != input_ids.shape:
                raise ValueError("The training bridge requires an uncached, aligned sequence")
            mask = causal_padding_mask(mask)
        return original(self, input_ids, pixel_values, mask, cache, **kwargs)

    forward._ourhouse_causal_bridge = True
    Model.__call__ = forward
