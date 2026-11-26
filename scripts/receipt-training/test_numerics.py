import unittest


class NumericalGuardTest(unittest.TestCase):
    def test_large_gradients_are_bounded_without_changing_direction(self):
        import mlx.core as mx
        from numerics import checked_gradients
        result = checked_gradients((mx.array(.5), {}), {"a": mx.array([30., 40.])})
        self.assertAlmostEqual(float(result["a"][0].item()), .6, places=6)
        self.assertAlmostEqual(float(result["a"][1].item()), .8, places=6)

    def test_nonfinite_loss_or_gradient_cannot_reach_the_optimizer(self):
        import mlx.core as mx
        from numerics import checked_gradients
        for loss, gradient in [(float('nan'), 1.), (.5, float('nan')), (.5, float('inf'))]:
            with self.assertRaises(FloatingPointError):
                checked_gradients((mx.array(loss), {}), {"a": mx.array([gradient])})

    def test_engine_rejects_bad_update_and_clips_a_valid_update(self):
        import mlx.core as mx
        import mlx.nn as nn
        import mlx.optimizers as optim
        from mlx_vlm.trainer.common import engine
        from numerics import install_numerical_guard
        install_numerical_guard()
        model = nn.Linear(1, 1, bias=False)
        model.weight = mx.array([[2.]])
        optimizer = optim.SGD(learning_rate=.1)
        optimizer.init(model.trainable_parameters())
        def bad(model, batch):
            return (mx.array(.5), {}), {"weight": mx.array([[float('nan')]])}
        with self.assertRaises(FloatingPointError):
            engine.apply_gradient_step(model, optimizer, bad, {}, update=True,
                                       accumulation_steps=1, loss_args=())
        self.assertEqual(model.weight.item(), 2.)
        self.assertEqual(optimizer.step.item(), 0)
        def good(model, batch):
            return (mx.array(.5), {}), {"weight": mx.array([[50.]])}
        engine.apply_gradient_step(model, optimizer, good, {}, update=True,
                                   accumulation_steps=1, loss_args=())
        self.assertAlmostEqual(model.weight.item(), 1.9, places=6)
        self.assertEqual(optimizer.step.item(), 1)


if __name__ == "__main__":
    unittest.main()
