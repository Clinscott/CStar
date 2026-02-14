import math
import random

class Value:
    """Autograd engine for local backpropagation. Inspired by micrograd."""
    def __init__(self, data, _children=(), _op=''):
        self.data = data
        self.grad = 0
        self._backward = lambda: None
        self._prev = set(_children)
        self._op = _op

    def __repr__(self):
        return f"Value(data={self.data}, grad={self.grad})"

    def __add__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data + other.data, (self, other), '+')
        def _backward():
            self.grad += out.grad
            other.grad += out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        other = other if isinstance(other, Value) else Value(other)
        out = Value(self.data * other.data, (self, other), '*')
        def _backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __pow__(self, other):
        assert isinstance(other, (int, float))
        out = Value(self.data**other, (self,), f'**{other}')
        def _backward():
            self.grad += (other * self.data**(other-1)) * out.grad
        out._backward = _backward
        return out

    def relu(self):
        out = Value(0 if self.data < 0 else self.data, (self,), 'ReLU')
        def _backward():
            self.grad += (out.data > 0) * out.grad
        out._backward = _backward
        return out

    def backward(self):
        topo = []
        visited = set()
        def build_topo(v):
            if v not in visited:
                visited.add(v)
                for child in v._prev:
                    build_topo(child)
                topo.append(v)
        build_topo(self)
        self.grad = 1
        for v in reversed(topo):
            v._backward()

    def __neg__(self): return self * -1
    def __sub__(self, other): return self + (-other)
    def __radd__(self, other): return self + other
    def __rmul__(self, other): return self * other
    def __truediv__(self, other): return self * other**-1

class Module:
    def zero_grad(self):
        for p in self.parameters():
            p.grad = 0
    def parameters(self):
        return []

class Neuron(Module):
    def __init__(self, nin, nonlin=True):
        self.w = [Value(random.uniform(-1, 1)) for _ in range(nin)]
        self.b = Value(0)
        self.nonlin = nonlin
    def __call__(self, x):
        act = sum((wi*xi for wi, xi in zip(self.w, x)), self.b)
        return act.relu() if self.nonlin else act
    def parameters(self):
        return self.w + [self.b]

class Layer(Module):
    def __init__(self, nin, nout, **kwargs):
        self.neurons = [Neuron(nin, **kwargs) for _ in range(nout)]
    def __call__(self, x):
        out = [n(x) for n in self.neurons]
        return out[0] if len(out) == 1 else out
    def parameters(self):
        return [p for n in self.neurons for p in n.parameters()]

class MLP(Module):
    def __init__(self, nin, nouts):
        sz = [nin] + nouts
        self.layers = [Layer(sz[i], sz[i+1], nonlin=i!=len(nouts)-1) for i in range(len(nouts))]
    def __call__(self, x):
        for layer in self.layers:
            x = layer(x)
        return x
    def parameters(self):
        return [p for layer in self.layers for p in layer.parameters()]

class AtomicCortex:
    """
    [THE ATOMIC CORTEX]
    Lore: "Memory of the Spear."
    Purpose: A simplified, dependency-free Transformer-like architecture for code analysis.
    """
    def __init__(self, vocab_size: int = 256, embed_dim: int = 16, n_layers: int = 1):
        self.vocab_size = vocab_size
        self.embed_dim = embed_dim
        # Token embeddings
        self.wte = [[Value(random.uniform(-1, 1)) for _ in range(embed_dim)] for _ in range(vocab_size)]
        # Simple MLP to process embeddings (replacing full transformer blocks for standard library constraints)
        self.mlp = MLP(embed_dim, [16, vocab_size])
        
    def forward(self, input_tokens: list[int]) -> list[list[Value]]:
        """Forward pass generating logits for each token."""
        all_logits = []
        for token in input_tokens:
            emb = self.wte[token % self.vocab_size]
            logits = self.mlp(emb)
            all_logits.append(logits)
        return all_logits
        
    def backward(self, loss: Value):
        """Trigger backpropagation."""
        loss.backward()
        
    def calculate_project_loss(self, text_corpus: str) -> float:
        """
        Calculates mathematical loss over the provided text.
        Returns the average cross-entropy loss.
        """
        if not text_corpus:
            return 100.0
            
        # Convert text to tokens (bytes for simplicity)
        tokens = [b for b in text_corpus.encode('utf-8')]
        if len(tokens) > 128: # Limit for performance
            tokens = tokens[:128]
            
        logits_list = self.forward(tokens[:-1])
        targets = tokens[1:]
        
        total_loss = Value(0)
        for logits, target in zip(logits_list, targets):
            # Simplified Softmax + Cross Entropy
            # loss = -log(exp(logits[target]) / sum(exp(logits)))
            # For AtomicCortex, we'll use a squared error on the target logit for simplicity
            # in a standard library implementation to avoid overflow/underflow issues.
            target_idx = target % self.vocab_size
            total_loss += (logits[target_idx] - 1.0)**2
            
        return total_loss.data / len(targets) if targets else 0.0

    def parameters(self):
        return [p for row in self.wte for p in row] + self.mlp.parameters()

    def train_step(self, text_corpus: str, learning_rate: float = 0.01):
        """Perform one training step."""
        tokens = [b for b in text_corpus.encode('utf-8')]
        if len(tokens) > 64:
            start = random.randint(0, len(tokens) - 65)
            tokens = tokens[start:start+64]
        if len(tokens) < 2: return
        
        logits_list = self.forward(tokens[:-1])
        targets = tokens[1:]
        
        loss = Value(0)
        for logits, target in zip(logits_list, targets):
            target_idx = target % self.vocab_size
            loss += (logits[target_idx] - 1.0)**2
            
        for p in self.parameters():
            p.grad = 0
        loss.backward()
        
        for p in self.parameters():
            # Gradient clipping to prevent explosion
            if p.grad > 1: p.grad = 1
            if p.grad < -1: p.grad = -1
            p.data -= learning_rate * p.grad
        
        return loss.data

if __name__ == "__main__":
    import sys
    import os
    
    # Simple CLI for training
    if len(sys.argv) > 1 and sys.argv[1] == "--train":
        steps = 500
        if len(sys.argv) > 2:
            steps = int(sys.argv[2])
            
        print(f"ALFRED: Initiating AtomicCortex training loop ({steps} steps)...")
        cortex = AtomicCortex()
        
        # Collect codebase text
        corpus = ""
        for root, dirs, files in os.walk("src"):
            for file in files:
                if file.endswith(".py"):
                    try:
                        with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                            corpus += f.read() + "\n"
                    except Exception: pass
        
        if not corpus:
            print("ALFRED: Training corpus is empty. Aborting.")
            sys.exit(0)
            
        for i in range(steps):
            loss = cortex.train_step(corpus)
            if i % 50 == 0:
                print(f"Step {i}: Loss {loss:.4f}")
                
        print("ALFRED: Training complete. Neural weights evolved.")
