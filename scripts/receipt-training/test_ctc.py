"""Invented tensors only; requires a local PyTorch environment."""
import unittest
import torch
from torch import nn
from ctc import checked_ctc_loss, checked_update, recognition_logits


class InferenceOnlyHead(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm = nn.BatchNorm1d(3)
        self.fc = nn.Linear(3, 4)

    def forward(self, x):
        scores = self.fc(self.norm(x.transpose(1, 2)).transpose(1, 2))
        return scores if self.training else scores.softmax(2)


class InferenceOnlyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = nn.Linear(3, 3)
        self.head = nn.Module()
        self.head.ctc_encoder = nn.Identity()
        self.head.ctc_head = InferenceOnlyHead()

    def forward(self, x):
        return self.head.ctc_head(self.head.ctc_encoder(self.backbone(x)))


class CTCGuardTests(unittest.TestCase):
    def test_logits_preserve_eval_probability_and_bn_state(self):
        model = InferenceOnlyModel().eval()
        before = model.head.ctc_head.norm.running_mean.clone()
        images = torch.randn(2, 20, 3)
        self.assertTrue(torch.allclose(recognition_logits(model, images).softmax(2), model(images)))
        self.assertFalse(model.head.ctc_head.training)
        self.assertFalse(model.head.ctc_head.norm.training)
        self.assertTrue(torch.equal(before, model.head.ctc_head.norm.running_mean))
        with self.assertRaises(ValueError):
            recognition_logits(model.train(), images)

    def test_ctc_backward_updates_a_real_parameter(self):
        model = InferenceOnlyModel().eval()
        optimizer = torch.optim.AdamW(model.parameters(), lr=.01)
        before = model.backbone.weight.detach().clone()
        loss = checked_ctc_loss(recognition_logits(model, torch.randn(2, 20, 3)), [1, 2, 2, 3], [2, 2])
        self.assertGreater(checked_update(model, optimizer, loss), 0)
        self.assertFalse(torch.equal(before, model.backbone.weight))

    def test_invalid_ctc_targets_are_rejected(self):
        for scores, targets, lengths in [(torch.zeros(1, 2, 4), [1, 1], [2]),
                                          (torch.zeros(1, 4, 4), [0], [1]),
                                          (torch.zeros(1, 4, 4), [4], [1]),
                                          (torch.zeros(1, 4, 4), [1], [2])]:
            with self.assertRaises(ValueError):
                checked_ctc_loss(scores, targets, lengths)
        with self.assertRaises(FloatingPointError):
            checked_ctc_loss(torch.full((1, 4, 4), float("nan")), [1], [1])

    def test_nonfinite_gradient_cannot_advance_optimizer(self):
        model = nn.Linear(1, 1, bias=False)
        optimizer = torch.optim.AdamW(model.parameters(), lr=.1)
        before = model.weight.detach().clone()
        handle = model.weight.register_hook(lambda grad: grad*float("nan"))
        try:
            with self.assertRaises(FloatingPointError):
                checked_update(model, optimizer, model(torch.ones(1, 1)).sum())
        finally:
            handle.remove()
        self.assertTrue(torch.equal(before, model.weight))
        self.assertEqual(len(optimizer.state), 0)


if __name__ == "__main__":
    unittest.main()
