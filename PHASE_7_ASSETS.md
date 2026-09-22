# Phase 7 — Character Asset Preparation

Phase 7 introduces a reusable asset-preparation pipeline for the browser puppet rig.

## What it does

The source character remains untouched in `char_assets_fullbody/<character>/full_body.png`.

The preparation utility creates transparent:

- `head.png`
- `torso.png`
- `left_arm.png`
- `right_arm.png`
- `left_leg.png`
- `right_leg.png`

The renderer can use these layers independently for cleaner joint animation.

## Local use

```bash
python asset_preparer.py char_assets_fullbody/ayo_finch/full_body.png --output char_assets/ayo_finch
```

The normalized crop regions are intentionally shared across the existing character set, making the pipeline deterministic and easy to regenerate if the source artwork changes.

The original full-body artwork is never modified.
