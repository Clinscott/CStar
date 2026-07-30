---
name: autobot
description: Retirement notice for the former public AutoBot delegation surface.
---

# AutoBot retired

Public AutoBot delegation is decommissioned and cannot be activated. The files
retained in this directory are compatibility tombstones only and always fail
with `legacy_autobot_retired_use_cstar_forge`.

The only supported Corvus build lane is the durable CStar lifecycle:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute`

Forge delivery remains unverified until independent validation is recorded
through `cstar_record_result`.
