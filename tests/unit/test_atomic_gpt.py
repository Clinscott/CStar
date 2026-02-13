import unittest
from src.core.engine.atomic_gpt import Value, AtomicCortex

class TestAtomicGPT(unittest.TestCase):
    def test_value_autograd(self):
        a = Value(2.0)
        b = Value(-3.0)
        c = Value(10.0)
        e = a * b
        d = e + c
        f = Value(-2.0)
        L = d * f
        L.backward()
        
        self.assertEqual(L.data, -8.0)
        self.assertEqual(a.grad, 6.0) # dL/da = f * b = -2 * -3 = 6
        self.assertEqual(b.grad, -4.0) # dL/db = f * a = -2 * 2 = -4
        
    def test_cortex_forward(self):
        cortex = AtomicCortex(vocab_size=10, embed_dim=4)
        tokens = [1, 2, 3]
        logits = cortex.forward(tokens)
        self.assertEqual(len(logits), 3)
        self.assertEqual(len(logits[0]), 10)
        
    def test_cortex_loss(self):
        cortex = AtomicCortex(vocab_size=256, embed_dim=8)
        loss = cortex.calculate_project_loss("print('hello world')")
        self.assertIsInstance(loss, float)
        self.assertGreaterEqual(loss, 0)

if __name__ == "__main__":
    unittest.main()
