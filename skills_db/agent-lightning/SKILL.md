---
name: Agent Lightning
description: Optimization framework for AI agents using Reinforcement Learning (RL) traces.
---
# ⚡ Agent Lightning (Optimization)

**Activation Words**: optimize, rl, reinforcement learning, fine-tune, train, gradient, reward

## Description
Agent Lightning is a Microsoft framework for optimizing agentic workflows. It uses a "sidecar" architecture to capture execution traces and rewards, enabling RL-based fine-tuning of the agent's decision models.

## Installation
Run this command to install the necessary Python packages and initialize the sidecar.

```powershell
pip install agent-lightning
# Initialize sidecar (Conceptual - check specific docs for exact init)
echo "Agent Lightning Installed. Consult specific documentation for sidecar injection."
```

## Usage
To use Agent Lightning, wrap your agent's execution loop:

```python
from agent_lightning import Sidecar

with Sidecar() as trace:
    # Your agent code here
    result = agent.run()
    trace.log_reward(calculate_reward(result))
```
