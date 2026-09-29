# Suno Studio

A one-page web app for making AI music with the [SunoAPI](https://docs.sunoapi.org). Paste your API key and you can write, generate, remix and export songs. It's plain HTML, CSS and JS with no build step, and it's set up for Netlify.

## What it does

**Unlock with your key.** The app checks your key against the credits endpoint before letting you in. The key is stored only in your browser. Your remaining credits are always shown in the header.

**Create**
- **Simple mode:** describe a song in plain words, press 🎲 Surprise me for an idea, choose instrumental or vocals, add optional style chips, and attach inspiration (images, a video or audio are uploaded for you).
- **Custom mode:** set a title, a style (with ✨ Boost to expand it), lyrics (section tags plus ✍ Write with AI), styles to exclude, vocal gender, and a persona or voice ID. You can also fine-tune style weight, weirdness, audio weight, variety and length.
- **Models:** V6 (recommended), V6 Wild and V6 Mini, plus the legacy models in a collapsed list.

**Remix:** extend a track, cover or restyle an upload, extend an upload, add an instrumental, add vocals, mash up two songs, or replace a section.

**Sounds:** loops and one-shots with BPM, key, loop and subtitle options.

**Library and track tools:** play, love, rename and download songs. For each track you can also:
- Convert it to WAV
- Split it into stems, then turn the stems into a downloadable **.mid** file
- Make a music video (MP4)
- Generate cover art
- Show word-by-word karaoke lyrics
- Create a persona to reuse on new songs
- Recover expired audio links
- Import songs made elsewhere by entering their task ID

**Experience:** jobs are tracked live (Queued → Writing → First take → Done), and you can play a song as soon as its first take is ready. There's a player that stays at the bottom of the screen, optional desktop notifications, and backup/restore of your library. Themes are **light, dark and system**, and the layout works on phones.

## How it's deployed

- `public/` is the static site.
- `netlify.toml` proxies `/suno-api/*` to `https://api.sunoapi.org` and `/suno-upload/*` to the file-upload host, so the browser never runs into CORS errors. Settings let you switch to calling the API directly.
- `netlify/functions/suno-callback.mjs` acknowledges the `callBackUrl` that every task requires. The app gets results by polling.

To run it locally, use `npx netlify dev`.
