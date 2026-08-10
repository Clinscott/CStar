# Host-native site Council autoresearch runner v2

This example preserves the fail-closed runner built for the Morderith dossier experiment.

It is a site-scoped host-native harness, not a canonical CStar autonomous runner. It uses the immutable 19-member Council protocol order from CStar commit 5887042deefaae240db2a546f3cc9640f601e9e2, pinned Augury routing, content-addressed packets, receipt-bound transitions, and one bounded Council sequential preference generation followed by a mandatory pause.

The evaluator deliberately does not claim independent Bernoulli trials, population inference, or empirical model-quality error guarantees. Token-Path remains quarantined, non-actionable, non-steering, and write-disabled.

Originating site source commit: a8b3e4845009870cc518f7bb14b13e1767ff8e0a
Runner contract SHA-256: bbce3dc477889699063df9bc2e8039202f61b7a09f6d6a8d17e749a83815c2c3

The included active index and golden test are the originating site's integration fixtures. Copy the scripts and adapt workflow.v2.json, owners, receipts, and index to the target site before execution.
