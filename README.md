# Cartoon Studio

Cartoon Studio is an original browser-based production workspace for animated explainers and music videos. The V9 Anime Director workflow is designed to be touch-friendly on iPhone Safari.

## V9 Anime Director MVP

- Create a six-scene storyboard with scene timings, character actions, camera direction and artwork prompts.
- Use Gemini AI for scene planning when configured; otherwise use an editable built-in storyboard template.
- Generate original 16:9 scene artwork using Gemini image generation.
- Reuse the first generated scene as a visual reference for subsequent scenes.
- Send storyboard scenes into the existing CanvasWebCodecs animation timeline, with generated artwork behind the animated characters.
- Add a music track in the timeline and export using the existing browser video pipeline.

## MiniMax H3 Photoreal Microdrama

- Select **Photoreal Microdrama** from the main mode switch.
- Enter a scene prompt and optionally provide a publicly accessible HTTPS character reference image URL.
- Configure `MINIMAX_API_KEY` as a server-side Vercel environment variable. `MINIMAX_API_BASE` defaults to `https://api.minimax.io`.
- Start generation, then manually check the returned task ID for completion. A successful task returns a provider-hosted MP4 URL.
- The API key is only read in the server route and is never sent to the browser. Video generation may incur provider charges; verify model access and credits before use.

## AI configuration

Set `GEMINI_API_KEY` as a server-side environment variable in the deployment platform. Never expose this key in client-side code.

Without the key, storyboard templates and manual editing remain available, but AI-generated artwork is disabled.

## Development

- Node.js
- Next.js 14
- React 18
- Mediabunny for browser video export

```bash
npm install
npm run build
npm run start
```

## Notes

- Video export support depends on browser codec capabilities and device memory. Keep scene counts and project duration modest when working on mobile.
- Scene art is generated per scene; image-provider availability, limits and costs depend on the configured Gemini account.
- Cartoon Studio uses original code and assets and is inspired by general 2D animation workflows, not proprietary Moho implementation details.
