"""Fail before corrupting an adapter and bound each optimizer update."""
import math


def checked_gradients(output, gradients, max_norm=1.0):
    import mlx.core as mx
    from mlx.utils import tree_flatten, tree_map
    if not math.isfinite(max_norm) or max_norm <= 0:
        raise ValueError("Gradient bound must be positive and finite")
    loss = output[0] if isinstance(output, tuple) else output
    arrays = [value.astype(mx.float32) for _, value in tree_flatten(gradients)]
    if not arrays:
        raise ValueError("No trainable gradients")
    norm = mx.sqrt(sum(mx.sum(value*value) for value in arrays))
    finite = mx.isfinite(loss).all() & mx.isfinite(norm)
    mx.eval(finite, norm)
    if not finite.item():
        raise FloatingPointError("Non-finite training loss/gradient; no optimizer update applied")
    factor = mx.minimum(mx.array(1.0), max_norm/mx.maximum(norm, mx.array(1e-12)))
    return tree_map(lambda value: value*factor.astype(value.dtype), gradients)


def install_numerical_guard(max_norm=1.0):
    from importlib.metadata import version
    if version("mlx-vlm") != "0.7.10":
        raise ValueError("Re-review the numerical guard for this MLX-VLM version")
    from mlx_vlm.trainer.common import engine
    if getattr(engine.apply_gradient_step, "_ourhouse_numeric_guard", False):
        return
    original = engine.apply_gradient_step

    def step(model, optimizer, loss_value_and_grad, batch, previous_gradients=None, **kwargs):
        if kwargs.get("accumulation_steps") != 1:
            raise ValueError("Re-review numerical guard before using gradient accumulation")

        def checked(model, batch, *extra):
            output, gradients = loss_value_and_grad(model, batch, *extra)
            return output, checked_gradients(output, gradients, max_norm)

        return original(model, optimizer, checked, batch, previous_gradients, **kwargs)

    step._ourhouse_numeric_guard = True
    engine.apply_gradient_step = step
