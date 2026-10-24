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


def install_text_only_cross_attention_fix():
    """Skip vision-only layers when neither an image nor its cache is present.

    MLX-VLM 0.7.10 otherwise splits text queries into fake image keys/values.
    That path can leak future text and fails on odd sequence lengths. Mllama's
    reference text-only path skips the entire cross-attention decoder layer:
    https://github.com/huggingface/transformers/blob/main/src/transformers/models/mllama/modeling_mllama.py
    Apply during both training and inference; cached image decoding still runs.
    """
    if version("mlx-vlm") != "0.7.10":
        raise ValueError("Re-review the text-only bridge for this MLX-VLM version")
    from mlx_vlm.models.mllama.language import MllamaCrossAttentionDecoderLayer
    if getattr(MllamaCrossAttentionDecoderLayer.__call__, "_ourhouse_text_only_bridge", False):
        return
    original = MllamaCrossAttentionDecoderLayer.__call__

    @wraps(original)
    def forward(self, hidden_states, cross_attention_states=None,
                attention_mask=None, full_text_row_masked_out_mask=None, cache=None):
        offset = getattr(cache, "offset", 0)
        if hasattr(offset, "max"):
            offset = offset.max().item()
        if cross_attention_states is None and offset == 0:
            return hidden_states
        return original(self, hidden_states, cross_attention_states, attention_mask,
                        full_text_row_masked_out_mask, cache)

    forward._ourhouse_text_only_bridge = True
    MllamaCrossAttentionDecoderLayer.__call__ = forward
