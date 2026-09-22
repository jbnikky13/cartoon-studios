# Phase 8 — Automated Asset Build & Validation

Phase 8 makes character assets reproducible in CI.

GitHub Actions watches the source artwork and the asset-preparation pipeline. It uses Pillow to:

1. Discover every `char_assets_fullbody/*/full_body.png`.
2. Validate the source image.
3. Generate the six transparent puppet layers.
4. Verify every required layer exists.
5. Verify generated layers are RGBA and non-empty.

A broken or incomplete character asset causes the workflow to fail instead of silently shipping a broken animation.

The source full-body artwork remains the canonical input.
