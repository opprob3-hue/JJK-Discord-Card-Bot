---
name: Crate weight decision
description: How the supplied Common crate probabilities are handled.
---

The Common crate preserves the requested 75/34/1 Epic, Legendary, and Mythic weights as relative weights and normalizes them at draw time because the supplied values total 110%.

**Why:** Silently changing one of the requested rarity values would be less predictable than preserving the stated ratios and making the normalization explicit.

**How to apply:** Keep future crate odds as relative weights and ensure the shop description states when a set of weights is normalized.