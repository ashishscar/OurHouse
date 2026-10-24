"""Small synthetic MLX checks; no customer images or model weights required."""
import unittest


class CausalMaskTest(unittest.TestCase):
    def test_future_tokens_cannot_change_prefix(self):
        import mlx.core as mx
        from mlx_vlm.models.mllama.config import TextConfig
        from mlx_vlm.models.mllama.language import MllamaTextModel
        from mllama_compat import causal_padding_mask
        mx.random.seed(369)
        model = MllamaTextModel(TextConfig(vocab_size=64, hidden_size=32,
            intermediate_size=64, num_hidden_layers=2, num_attention_heads=4,
            num_key_value_heads=2, cross_attention_layers=[]))
        a, b = mx.array([[1, 2, 3, 4]]), mx.array([[1, 2, 11, 12]])
        padding = mx.ones((1, 4), dtype=mx.int32)
        leaked = mx.max(mx.abs(model(a, mask=padding)[:, :2] - model(b, mask=padding)[:, :2])).item()
        self.assertGreater(leaked, .001)  # Demonstrate the library integration failure.
        causal = causal_padding_mask(padding)
        delta = mx.max(mx.abs(model(a, mask=causal)[:, :2] - model(b, mask=causal)[:, :2])).item()
        self.assertLess(delta, 1e-6)

    def test_padding_and_future_keys_are_hidden(self):
        import mlx.core as mx
        from mllama_compat import causal_padding_mask
        result = causal_padding_mask(mx.array([[1, 1, 0]])).tolist()
        self.assertEqual(result, [[[[True, False, False], [True, True, False], [True, True, False]]]])

    def test_text_only_cross_layer_is_identity_for_odd_length(self):
        import mlx.core as mx
        from mlx_vlm.models.mllama.config import TextConfig
        from mlx_vlm.models.mllama.language import MllamaCrossAttentionDecoderLayer
        from mllama_compat import install_text_only_cross_attention_fix
        install_text_only_cross_attention_fix()
        layer = MllamaCrossAttentionDecoderLayer(TextConfig(vocab_size=64,
            hidden_size=32, intermediate_size=64, num_attention_heads=4,
            num_key_value_heads=2), 1)
        layer.cross_attn_attn_gate = mx.ones(1)
        layer.cross_attn_mlp_gate = mx.ones(1)
        x = mx.random.normal((1, 5, 32))
        self.assertEqual(mx.max(mx.abs(layer(x, None) - x)).item(), 0)

    def test_text_only_future_tokens_cannot_leak_through_cross_layer(self):
        import mlx.core as mx
        from mlx_vlm.models.mllama.config import TextConfig
        from mlx_vlm.models.mllama.language import MllamaTextModel
        from mllama_compat import causal_padding_mask, install_text_only_cross_attention_fix
        install_text_only_cross_attention_fix()
        mx.random.seed(370)
        model = MllamaTextModel(TextConfig(vocab_size=64, hidden_size=32,
            intermediate_size=64, num_hidden_layers=3, num_attention_heads=4,
            num_key_value_heads=2, cross_attention_layers=[1]))
        model.layers[1].cross_attn_attn_gate = mx.ones(1)
        model.layers[1].cross_attn_mlp_gate = mx.ones(1)
        mask = causal_padding_mask(mx.ones((1, 5), dtype=mx.int32))
        a = model(mx.array([[1, 2, 3, 4, 5]]), mask=mask)
        b = model(mx.array([[1, 2, 11, 12, 13]]), mask=mask)
        self.assertLess(mx.max(mx.abs(a[:, :2] - b[:, :2])).item(), 1e-6)

    def test_vision_cross_layer_and_cached_decode_are_preserved(self):
        import mlx.core as mx
        from mlx_vlm.models.mllama.config import TextConfig
        from mlx_vlm.models.mllama.language import MllamaCrossAttentionDecoderLayer
        from mllama_compat import install_text_only_cross_attention_fix
        install_text_only_cross_attention_fix()
        layer = MllamaCrossAttentionDecoderLayer(TextConfig(vocab_size=64,
            hidden_size=32, intermediate_size=64, num_attention_heads=4,
            num_key_value_heads=2), 1)
        layer.cross_attn_attn_gate = mx.ones(1)
        layer.cross_attn_mlp_gate = mx.ones(1)
        x = mx.random.normal((1, 1, 32))
        vision = mx.random.normal((1, 6, 32))
        direct = layer(x, vision)
        # The upstream generation path normally forwards image states each step.
        # Also exercise its supported pre-populated cache.fetch() branch directly.
        cross = layer.cross_attn
        keys = cross.k_norm(cross.k_proj(vision).reshape(1, 6, 2, 8).transpose(0, 2, 1, 3))
        values = cross.v_proj(vision).reshape(1, 6, 2, 8).transpose(0, 2, 1, 3)
        class CachedVision:
            offset = 6
            def fetch(self):
                return keys, values
        cache = CachedVision()
        with_image = layer(x, vision, cache=cache)
        cached = layer(x, None, cache=cache)
        self.assertGreater(mx.max(mx.abs(direct - x)).item(), .001)
        self.assertLess(mx.max(mx.abs(with_image - direct)).item(), 1e-6)
        self.assertLess(mx.max(mx.abs(cached - direct)).item(), 1e-6)


if __name__ == "__main__":
    unittest.main()
