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


if __name__ == "__main__":
    unittest.main()
