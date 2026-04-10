# Museum Audio Guide – TODO List

## Tasks

1. Integrate Kokoro neural TTS (via @huggingface/transformers) for high-quality browser-based speech synthesis, with Web Speech API fallback. Build system (Vite + vite-plugin-singlefile) produces a single-file index.html artifact.
2. Redesign bottom player bar with artwork thumbnail, marquee title, compact controls. Add artwork detail modal (click card → shows image + description text).
3. ~~AI voice (Kokoro) should start loading automatically in the background on page load — no click required.~~
4. ~~Kokoro must not be downloaded from HuggingFace at runtime. `@huggingface/transformers` is now a proper npm dependency bundled into the build; WASM files are embedded in the single-file HTML; model weights are downloaded locally via `npm run setup` and served from `public/models/` — no external CDN or HuggingFace network calls at runtime.~~
5. ~~Validate image display and LLM prompt: `reina-sofia.json` sample data populated with Wikimedia Commons imageUrls; image display code verified correct in both player-bar thumbnail and artwork detail modal (both include `onerror` fallback); LLM prompt already instructs to provide Wikimedia Commons URLs for `imageUrl`.~~
