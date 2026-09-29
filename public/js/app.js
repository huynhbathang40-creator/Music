import { api, setKey, getMode, setMode } from "./api.js";
import { store } from "./store.js";
import { renderFields, readAll, cleanPayload, applyWhen, updateCounters, refItem, esc } from "./forms.js";
import { midiBlob } from "./midi.js";

// ================= helpers =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (s) => {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hue = (str = "") => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const artFallback = (t) => `background: linear-gradient(135deg, hsl(${hue(t.title)} 85% 60%), hsl(${(hue(t.title) + 70) % 360} 70% 45%))`;

function toast(msg, { type = "info", action, onAction, ms = 4500 } = {}) {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${msg}</span>${action ? `<button class="link">${esc(action)}</button>` : ""}`;
  if (action) el.querySelector("button").onclick = () => (onAction(), el.remove());
  const box = $("#toasts");
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

function burst() {
  const wrap = document.createElement("div");
  wrap.className = "burst";
  const colors = ["#ff4d6d", "#7c3aed", "#ffb020", "#22c55e", "#38bdf8"];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("i");
    p.style.setProperty("--x", `${(Math.random() - 0.5) * 520}px`);
    p.style.setProperty("--y", `${-Math.random() * 380 - 60}px`);
    p.style.setProperty("--r", `${Math.random() * 720}deg`);
    p.style.background = colors[i % colors.length];
    wrap.append(p);
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 1400);
}

function download(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "";
  a.target = "_blank";
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}
const safeName = (s) => (s || "track").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "track";

// ================= theme =================
function setTheme(t) {
  if (t === "system") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("ss.theme");
  } else {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("ss.theme", t);
  }
  $$("[data-theme-set]").forEach((b) => b.classList.toggle("on", b.dataset.themeSet === (localStorage.getItem("ss.theme") || "system")));
}

// ================= key gate =================
async function unlock(key, remember) {
  setKey(key);
  const credits = await api.credits();
  store.setKey(key, remember);
  showApp(credits);
}

function showGate(err) {
  $("#app").hidden = true;
  $("#gate").hidden = false;
  $("#gateErr").textContent = err || "";
  setTimeout(() => $("#gateKey").focus(), 50);
}

function initGate() {
  $("#gateReveal").onclick = () => {
    const i = $("#gateKey");
    i.type = i.type === "password" ? "text" : "password";
  };
  $("#gateForm").onsubmit = async (e) => {
    e.preventDefault();
    const key = $("#gateKey").value.trim();
    if (!key) return;
    const btn = $("#gateSubmit");
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Checking your key…';
    $("#gateErr").textContent = "";
    try {
      await unlock(key, $("#gateRemember").checked);
    } catch (err) {
      $("#gateErr").textContent = err.code === 401 ? "That key didn't work. Check for typos or generate a new one." : err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock the studio";
    }
  };
}

// ================= credits =================
let credits = null;
function setCredits(n) {
  credits = n;
  $("#credits").textContent = typeof n === "number" ? n.toLocaleString() : "—";
  $("#creditsBtn").classList.toggle("low", typeof n === "number" && n < 20);
}
async function refreshCredits() {
  try {
    setCredits(await api.credits());
  } catch (e) {
    if (e.code === 401) {
      store.clearKey();
      showGate("Your key is no longer valid. Please enter it again.");
    }
  }
}

// ================= navigation =================
let view = "create";
function go(v) {
  view = v;
  $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.view === v));
  $$(".view").forEach((s) => (s.hidden = s.id !== `view-${v}`));
  if (v === "library") renderLibrary();
  if (v === "studio") renderStudio();
  window.scrollTo({ top: 0, behavior: "smooth" });
  history.replaceState(null, "", `#${v}`);
}

// ================= form configs =================
const IDEAS = [
  "An upbeat indie-pop anthem about finally quitting a job you hate, handclaps and a shout-along chorus",
  "A lo-fi hip hop beat for a rainy Sunday in Tokyo, vinyl crackle, soft Rhodes, no vocals",
  "A dramatic power ballad sung by a lighthouse keeper to the ocean",
  "A funky disco track about a houseplant that wants more sunlight",
  "Dreamy synthwave about driving through a neon city at 3am, female vocals",
  "A sea shanty about debugging production on a Friday night",
  "A cinematic orchestral piece for the moment a spaceship leaves Earth",
  "A cozy acoustic folk song about grandma's kitchen, warm male vocals, fingerpicked guitar",
  "A hyperpop love song between two AI assistants",
  "A reggaeton summer hit about a road trip with best friends",
  "A jazzy bossa nova about a cat who runs a café",
  "An epic metal song about a very brave but very small hamster",
  "A gospel-choir celebration of the first day of spring",
  "A K-pop dance track about chasing your dreams, big synth drop",
  "A country song about a pickup truck that talks back",
  "An ambient soundscape of a forest waking up at dawn, no vocals",
  "Afrobeats track about dancing at a wedding till sunrise",
  "A melancholic piano ballad about the last day of summer camp",
];

const ADV = { t: "advanced", k: "_adv" };
const CREATE_SIMPLE = [
  { t: "describe", k: "prompt", label: "Describe your song", ph: "A happy song about a golden retriever's first day at the beach…", rows: 5, max: 3000 },
  { t: "row", fields: [{ t: "toggle", k: "instrumental", label: "Vocals", text: "Instrumental only (no singing)" }] },
  { t: "style", k: "style", label: "Style (optional)", max: 1000, rows: 2, ph: "Add a genre or vibe, or tap the chips" },
  { t: "refs", k: "_refs", label: "Inspiration (optional)", cls: "refs-field" },
  { t: "model", k: "model", label: "Model" },
];
const CREATE_CUSTOM = [
  { t: "text", k: "title", label: "Title", ph: "Give it a name", max: 80 },
  { t: "style", k: "style", label: "Style of music", max: 1000, rows: 2 },
  { t: "toggle", k: "instrumental", label: "Vocals", text: "Instrumental only (no singing)" },
  { t: "lyrics", k: "lyrics", label: "Lyrics", max: 5000, when: "instrumental=false" },
  { t: "row", fields: [
    { t: "text", k: "negativeTags", label: "Exclude styles", ph: "e.g. heavy metal, autotune", max: 1000 },
    { t: "gender", k: "vocalGender", label: "Voice", when: "instrumental=false" },
  ] },
  { t: "persona", k: "_persona", label: "Persona / Voice", hint: "Make a persona from any track in your library to reuse its sound." },
  { ...ADV, duration: true },
  { t: "model", k: "model", label: "Model" },
];

const lyricFields = (extra = {}) => [
  { t: "toggle", k: "instrumental", label: "Vocals", text: "Instrumental only" },
  { t: "lyrics", k: "lyrics", label: "Lyrics (optional)", max: 5000, rows: 7, when: "instrumental=false", ...extra },
  { t: "row", fields: [
    { t: "text", k: "negativeTags", label: "Exclude styles", ph: "e.g. screaming, trap hats" },
    { t: "gender", k: "vocalGender", label: "Voice", when: "instrumental=false" },
  ] },
];

const TOOLS = {
  extend: {
    icon: "⟿", name: "Extend a track", desc: "Continue one of your songs from any point.", fn: "extend",
    fields: [
      { t: "track", k: "_track", label: "Track to extend" },
      { t: "number", k: "continueAt", label: "Continue from (seconds)", ph: "e.g. 60 — leave blank for the end", min: 0, hint: "Pick a moment before the ending to change direction." },
      { t: "row", fields: [{ t: "text", k: "title", label: "Title", max: 100 }, { t: "text", k: "style", label: "Style", ph: "keep blank to match the original" }] },
      ...lyricFields(),
      { t: "persona", k: "_persona", label: "Persona / Voice" },
      { ...ADV },
      { t: "model", k: "model", label: "Model" },
    ],
  },
  cover: {
    icon: "⟲", name: "Cover / restyle", desc: "Upload any audio and re-imagine it in a new style, keeping the melody.", fn: "uploadCover",
    fields: [
      { t: "audio", k: "uploadUrl", label: "Source audio", req: true },
      { t: "text", k: "title", label: "Title", max: 80 },
      { t: "style", k: "style", label: "New style", max: 1000, rows: 2 },
      ...lyricFields(),
      { t: "persona", k: "_persona", label: "Persona / Voice" },
      { ...ADV, duration: true },
      { t: "model", k: "model", label: "Model" },
    ],
  },
  uploadExtend: {
    icon: "⇥", name: "Extend an upload", desc: "Upload your own audio and let Suno keep it going in the same style.", fn: "uploadExtend",
    fields: [
      { t: "audio", k: "uploadUrl", label: "Source audio", req: true },
      { t: "number", k: "continueAt", label: "Continue from (seconds)", min: 0, ph: "e.g. 30" },
      { t: "row", fields: [{ t: "text", k: "title", label: "Title", max: 100 }, { t: "text", k: "style", label: "Style" }] },
      ...lyricFields(),
      { t: "persona", k: "_persona", label: "Persona / Voice" },
      { ...ADV },
      { t: "model", k: "model", label: "Model" },
    ],
  },
  addInstrumental: {
    icon: "🎹", name: "Add instrumental", desc: "Got a vocal or melody? Get a full backing track built around it.", fn: "addInstrumental",
    fields: [
      { t: "audio", k: "uploadUrl", label: "Vocal / melody audio", req: true },
      { t: "text", k: "title", label: "Title", req: true, max: 80 },
      { t: "style", k: "tags", label: "Backing style", req: true, rows: 2, ph: "e.g. warm acoustic guitar, brushed drums, indie folk" },
      { t: "text", k: "negativeTags", label: "Exclude", req: true, ph: "e.g. heavy distortion, EDM drops" },
      { t: "gender", k: "vocalGender", label: "Voice" },
      { ...ADV },
      { t: "model", k: "model", label: "Model" },
    ],
  },
  addVocals: {
    icon: "🎤", name: "Add vocals", desc: "Turn an instrumental into a full song with AI-sung lyrics.", fn: "addVocals",
    fields: [
      { t: "audio", k: "uploadUrl", label: "Instrumental audio", req: true },
      { t: "text", k: "title", label: "Title", req: true, max: 80 },
      { t: "style", k: "style", label: "Vocal & music style", req: true, rows: 2, ph: "e.g. soulful R&B, breathy female vocals" },
      { t: "lyrics", k: "lyrics", label: "Lyrics", max: 5000, rows: 8 },
      { t: "row", fields: [{ t: "text", k: "negativeTags", label: "Exclude", req: true, ph: "e.g. rap, screaming" }, { t: "gender", k: "vocalGender", label: "Voice" }] },
      { ...ADV },
      { t: "model", k: "model", label: "Model" },
    ],
  },
  mashup: {
    icon: "⨯", name: "Mashup", desc: "Blend two songs into something new.", fn: "mashup",
    fields: [
      { t: "row", fields: [{ t: "audio", k: "_a", label: "Track A", req: true }, { t: "audio", k: "_b", label: "Track B", req: true }] },
      { t: "text", k: "title", label: "Title", max: 80 },
      { t: "style", k: "style", label: "Style", max: 1000, rows: 2 },
      { t: "lyrics", k: "lyrics", label: "Lyrics (optional)", max: 5000, rows: 6 },
      { t: "gender", k: "vocalGender", label: "Voice" },
      { t: "persona", k: "_persona", label: "Persona / Voice" },
      { ...ADV, duration: true },
      { t: "model", k: "model", label: "Model" },
    ],
  },
  replace: {
    icon: "✂", name: "Replace a section", desc: "Rewrite 10+ seconds of a track — new lyrics, same song.", fn: "replaceSection",
    fields: [
      { t: "track", k: "_track", label: "Track" },
      { t: "range2", k: "_range", a: "infillStartS", b: "infillEndS", label: "Section to replace", req: true, hint: "At least 10 seconds, and no more than half the song." },
      { t: "lyrics", k: "lyrics", label: "New lyrics for this section", req: true, rows: 5, max: 5000 },
      { t: "textarea", k: "fullLyrics", label: "Full song lyrics after the change", req: true, rows: 7, ph: "Paste the complete lyrics with your new section in place", hint: "Tip: we prefill this with the track's lyrics when you pick it." },
      { t: "row", fields: [{ t: "text", k: "title", label: "Title", req: true }, { t: "text", k: "tags", label: "Style", req: true }] },
      { t: "row", fields: [{ t: "text", k: "negativeTags", label: "Exclude" }, { t: "gender", k: "vocalGender", label: "Voice" }] },
      { t: "persona", k: "_persona", label: "Persona / Voice" },
      { ...ADV },
    ],
  },
};

const KEYS = ["Any", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"];
const SOUNDS = [
  { t: "describe", k: "prompt", label: "Describe the sound", ph: "A punchy 808 drum loop with swung hi-hats…", rows: 4, max: 500 },
  { t: "row", fields: [
    { t: "number", k: "soundTempo", label: "Tempo (BPM)", ph: "Auto", min: 1, maxv: 300, step: 1 },
    { t: "select", k: "soundKey", label: "Key", options: KEYS, def: "Any" },
  ] },
  { t: "row", fields: [
    { t: "toggle", k: "soundLoop", label: "Loop", text: "Seamless loop" },
    { t: "toggle", k: "grabLyrics", label: "Subtitles", text: "Capture lyric subtitles" },
  ] },
  { t: "model", k: "model", label: "Model" },
];
const SOUND_IDEAS = [
  "Punchy 808 drum loop with swung hi-hats, 140 bpm",
  "Warm analog synth pad, slowly evolving, ambient",
  "Rain on a tin roof with distant thunder",
  "Funky slap bass groove",
  "Epic cinematic riser into a big impact",
  "Lo-fi vinyl crackle with a mellow jazz piano loop",
  "Retro 8-bit video game victory jingle",
  "Crowd cheering in a stadium",
];

// ================= form mounting =================
function formCtx(formId) {
  return {
    formId,
    draft: (store.draft[formId] ||= {}),
    showLegacy: false,
    tracks: () => store.trackList().filter((t) => t.audioUrl || t.streamUrl),
    personas: () => store.personas,
  };
}

function mountForm(root, formId, fields, { submitLabel, submitNote, onSubmit, header = "" }) {
  const ctx = formCtx(formId);
  root.innerHTML = `${header}<form class="form" data-form="${formId}" novalidate>${renderFields(fields, ctx)}
    <div class="submit-row"><button class="btn btn-primary btn-xl" type="submit">${submitLabel}</button><small>${submitNote || ""}</small></div></form>`;
  const form = $("form", root);
  const sync = () => {
    ctx.draft = store.draft[formId] = { ...store.draft[formId], ...readAll(form, { includeHidden: true }) };
    store.saveDraft();
    applyWhen(form);
    updateCounters(form);
  };
  applyWhen(form);
  updateCounters(form);
  bindForm(form, ctx, sync);
  form.onsubmit = async (e) => {
    e.preventDefault();
    sync();
    const btn = $('button[type="submit"]', form);
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Sending to the studio…';
    try {
      await onSubmit(cleanPayload(readAll(form)), form);
    } catch (err) {
      toast(`⚠ ${esc(err.message)}`, { type: "error", ms: 7000 });
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  };
  return form;
}

function bindForm(form, ctx, sync) {
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (el.type === "range" && el.dataset.f) {
      el.dataset.auto = "0";
      const out = form.querySelector(`[data-out="${el.dataset.f}"]`);
      const k = el.dataset.f;
      out.textContent = k === "variety" ? ["Exact", "Balanced", "High", "Extra", "Max"][el.value] : k === "duration" ? fmt(+el.value) : `${Math.round(el.value * 100)}%`;
      form.querySelector(`[data-reset="${k}"]`).hidden = false;
    }
    if (el.dataset.urlIn) setAudioValue(form, el.dataset.urlIn, el.value.trim(), true);
    sync();
  });
  form.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.type === "radio") {
      $$(`input[name="${el.name}"]`, form).forEach((r) => r.closest("label")?.classList.toggle("on", r.checked));
    }
    if (el.matches("[data-persona-pick]")) {
      const p = store.personas.find((x) => x.personaId === el.value);
      form.querySelector('[data-f="personaId"]').value = el.value;
      if (p) {
        const pm = form.querySelector(`[data-f="personaModel"][value="${p.kind === "voice" ? "voice_persona" : "style_persona"}"]`);
        pm.checked = true;
        pm.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    if (el.matches("[data-track-pick]")) {
      const t = store.tracks[el.value];
      form.querySelector('[data-f="audioId"]').value = t.id;
      form.querySelector('[data-f="taskId"]').value = t.taskId;
      const art = form.querySelector("[data-pick-art]");
      if (art) art.src = t.image;
      if (form.dataset.form === "tool-replace") {
        for (const [k, v] of [["fullLyrics", t.lyrics], ["tags", t.tags], ["title", t.title]]) form.querySelector(`[data-f="${k}"]`).value = v || "";
      }
    }
    if (el.dataset.libIn) setAudioValue(form, el.dataset.libIn, el.value, true);
    if (el.dataset.upload && el.files[0]) await uploadAudio(form, el.dataset.upload, el.files[0]);
    if (el.matches("[data-refs]")) await uploadRefs(form, [...el.files]);
    sync();
  });
  form.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.chip) {
      const ta = b.closest(".field").querySelector("textarea");
      const parts = ta.value.split(",").map((s) => s.trim()).filter(Boolean);
      const i = parts.findIndex((p) => p.toLowerCase() === b.dataset.chip.toLowerCase());
      i >= 0 ? parts.splice(i, 1) : parts.push(b.dataset.chip);
      ta.value = parts.join(", ");
      b.classList.toggle("on", i < 0);
      sync();
    } else if (b.dataset.section) {
      const ta = b.closest(".field").querySelector("textarea");
      insertAtCursor(ta, `${ta.value && !ta.value.endsWith("\n") ? "\n\n" : ""}[${b.dataset.section}]\n`);
      sync();
    } else if (b.dataset.act === "surprise") {
      const ta = b.closest(".field").querySelector("textarea");
      const pool = form.dataset.form === "sounds" ? SOUND_IDEAS : IDEAS;
      let next;
      do next = pool[Math.floor(Math.random() * pool.length)];
      while (next === ta.value && pool.length > 1);
      ta.value = next;
      ta.classList.remove("pop");
      void ta.offsetWidth;
      ta.classList.add("pop");
      sync();
    } else if (b.dataset.act === "boost") {
      await boostStyle(b.closest(".field").querySelector("textarea"), b);
      sync();
    } else if (b.dataset.act === "write-lyrics") {
      openLyricsWriter(b.closest(".field").querySelector("textarea"), form, sync);
    } else if (b.dataset.reset) {
      const k = b.dataset.reset;
      const r = form.querySelector(`input[type=range][data-f="${k}"]`);
      r.dataset.auto = "1";
      form.querySelector(`[data-out="${k}"]`).textContent = "Auto";
      b.hidden = true;
      delete ctx.draft[k];
      sync();
    } else if (b.dataset.src) {
      const box = b.closest("[data-audio-src]");
      $$("[data-src]", box).forEach((x) => x.classList.toggle("on", x === b));
      $$("[data-src-pane]", box).forEach((p) => (p.hidden = p.dataset.srcPane !== b.dataset.src));
    } else if (b.matches("[data-ref-remove]")) {
      const ref = b.closest(".ref");
      const key = { image: "imageUrls", audio: "audioUrls", video: "videoUrls" }[ref.dataset.refType];
      const input = form.querySelector(`[data-f="${key}"]`);
      input.value = JSON.stringify(JSON.parse(input.value || "[]").filter((u) => u !== ref.dataset.refUrl));
      ref.remove();
      sync();
    }
  });
  // drag & drop onto drop zones
  $$(".drop", form).forEach((z) => {
    z.addEventListener("dragover", (e) => (e.preventDefault(), z.classList.add("over")));
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", async (e) => {
      e.preventDefault();
      z.classList.remove("over");
      const files = [...e.dataTransfer.files];
      const input = $("input[type=file]", z);
      if (input.dataset.upload && files[0]) await uploadAudio(form, input.dataset.upload, files[0]);
      else if (input.matches("[data-refs]")) await uploadRefs(form, files);
      sync();
    });
  });
}

function insertAtCursor(ta, text) {
  const s = ta.selectionStart ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(ta.selectionEnd ?? s);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + text.length;
}

function setAudioValue(form, key, url, fromInput) {
  form.querySelector(`[data-f="${key}"]`).value = url;
  const st = form.querySelector(`[data-status="${key}"]`);
  st.innerHTML = url ? `<span class="ok">✓ Ready</span> <audio controls preload="none" src="${esc(url)}"></audio>` : "";
  if (!fromInput) {
    const u = form.querySelector(`[data-url-in="${key}"]`);
    if (u) u.value = url;
  }
}

async function uploadAudio(form, key, file) {
  const st = form.querySelector(`[data-status="${key}"]`);
  st.innerHTML = `<span class="spin"></span> Uploading ${esc(file.name)}…`;
  try {
    const url = await api.upload(file);
    setAudioValue(form, key, url);
    toast(`Uploaded <b>${esc(file.name)}</b>`, { type: "ok" });
  } catch (e) {
    st.innerHTML = `<span class="bad">Upload failed: ${esc(e.message)}</span>`;
  }
}

async function uploadRefs(form, files) {
  const list = form.querySelector(".ref-list");
  for (const file of files) {
    const type = file.type.split("/")[0];
    const key = { image: "imageUrls", audio: "audioUrls", video: "videoUrls" }[type];
    if (!key) continue;
    const input = form.querySelector(`[data-f="${key}"]`);
    const arr = JSON.parse(input.value || "[]");
    const cap = { imageUrls: 5, videoUrls: 1, audioUrls: 8 }[key];
    if (arr.length >= cap) {
      toast(`Limit reached for ${type}s (${cap}).`, { type: "error" });
      continue;
    }
    const tmp = document.createElement("div");
    tmp.className = "ref loading";
    tmp.innerHTML = `<span class="spin"></span><span class="ref-name">${esc(file.name)}</span>`;
    list.append(tmp);
    try {
      const url = await api.upload(file);
      arr.push(url);
      input.value = JSON.stringify(arr);
      tmp.outerHTML = refItem(type, url);
    } catch (e) {
      tmp.remove();
      toast(`Upload failed: ${esc(e.message)}`, { type: "error" });
    }
  }
}

async function boostStyle(ta, btn) {
  const content = ta.value.trim();
  if (!content) return toast("Type a few words of style first, then Boost expands it.", { type: "error" });
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try {
    const d = await api.boostStyle(content);
    if (d?.result) {
      ta.value = d.result.slice(0, +ta.getAttribute("maxlength") || 1000);
      ta.classList.remove("pop");
      void ta.offsetWidth;
      ta.classList.add("pop");
      toast("✨ Style boosted", { type: "ok", action: "Undo", onAction: () => ((ta.value = content), ta.dispatchEvent(new Event("input", { bubbles: true }))) });
      if (typeof d.creditsRemaining === "number") setCredits(d.creditsRemaining);
    } else toast("Boost didn't return a result this time — try again.", { type: "error" });
  } catch (e) {
    toast(`⚠ ${esc(e.message)}`, { type: "error" });
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

// ================= validation =================
function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ================= Create view =================
let createMode = localStorage.getItem("ss.createMode") || "simple";
function renderCreate() {
  const root = $("#view-create");
  root.innerHTML = `<div class="grid-2">
    <div class="panel hero-panel"><div class="panel-head"><div><h2>What do you want to hear?</h2><p class="sub">${createMode === "simple" ? "Describe it in plain words. We'll write the lyrics and produce two takes." : "Full control: your lyrics, your style, your sliders."}</p></div>
      <div class="seg mode-seg"><button data-mode="simple" class="${createMode === "simple" ? "on" : ""}">Simple</button><button data-mode="custom" class="${createMode === "custom" ? "on" : ""}">Custom</button></div></div>
      <div id="createForm"></div></div>
    <aside class="side">${sidePanels()}</aside></div>`;
  $$("[data-mode]", root).forEach((b) => (b.onclick = () => {
    createMode = b.dataset.mode;
    localStorage.setItem("ss.createMode", createMode);
    renderCreate();
  }));
  mountForm($("#createForm", root), `create-${createMode}`, createMode === "simple" ? CREATE_SIMPLE : CREATE_CUSTOM, {
    submitLabel: "✦ Create song",
    submitNote: "Two takes · usually ready in 1–3 minutes",
    onSubmit: submitCreate,
  });
  renderQueue();
  renderRecent();
}

async function submitCreate(p) {
  const custom = createMode === "custom";
  const body = { customMode: custom, instrumental: !!p.instrumental, model: p.model || "V6" };
  if (custom) {
    Object.assign(body, p);
    if (body.instrumental) {
      delete body.lyrics;
      delete body.vocalGender;
      delete body.audioWeight;
    }
    need(body.style || body.lyrics || body.negativeTags, "Add a style or some lyrics so the studio knows what to make.");
  } else {
    for (const k of ["prompt", "style", "imageUrls", "audioUrls", "videoUrls"]) if (p[k]) body[k] = p[k];
    need(body.prompt || body.style || body.imageUrls || body.audioUrls || body.videoUrls, "Describe your song (or add a style or reference) to get started.");
  }
  const label = body.title || (body.prompt || body.style || "New song").slice(0, 60);
  await startMusic("generate", "generate", body, label);
}

function sidePanels() {
  return `<div class="panel"><div class="panel-head"><h3>In the studio</h3><button class="link" data-clear-done>Clear finished</button></div><div class="queue-slot"></div></div>
    <div class="panel"><div class="panel-head"><h3>Fresh takes</h3><button class="link" data-go="library">Library →</button></div><div class="recent-slot"></div></div>`;
}

// ================= Studio (remix) =================
let tool = "extend";
function renderStudio(preset) {
  const root = $("#view-studio");
  if (preset) {
    tool = preset.tool;
    store.draft[`tool-${tool}`] = { ...(store.draft[`tool-${tool}`] || {}), ...preset.values };
  }
  const t = TOOLS[tool];
  if (tool === "replace") {
    const d = (store.draft["tool-replace"] ||= {});
    const src = store.tracks[d.audioId] || store.trackList()[0];
    if (src) {
      d.fullLyrics ||= src.lyrics;
      d.tags ||= src.tags;
      d.title ||= src.title;
    }
  }
  root.innerHTML = `<div class="grid-2"><div>
    <div class="tool-grid">${Object.entries(TOOLS).map(([id, x]) => `<button class="tool ${id === tool ? "on" : ""}" data-tool="${id}"><span class="tool-ico">${x.icon}</span><b>${x.name}</b><small>${x.desc}</small></button>`).join("")}</div>
    <div class="panel"><div class="panel-head"><div><h2>${t.icon} ${t.name}</h2><p class="sub">${t.desc}</p></div></div><div id="toolForm"></div></div></div>
    <aside class="side">${sidePanels()}</aside></div>`;
  $$("[data-tool]", root).forEach((b) => (b.onclick = () => ((tool = b.dataset.tool), renderStudio())));
  mountForm($("#toolForm", root), `tool-${tool}`, t.fields, {
    submitLabel: `${t.icon} ${t.name}`,
    submitNote: "Runs in the background — keep creating",
    onSubmit: (p) => submitTool(tool, p),
  });
  renderQueue();
  renderRecent();
}

async function submitTool(id, p) {
  const t = TOOLS[id];
  const body = { ...p };
  if (body.instrumental) {
    delete body.lyrics;
    delete body.vocalGender;
    delete body.audioWeight;
  }
  let label = body.title;
  switch (id) {
    case "extend": {
      need(body.audioId, "Pick a track to extend.");
      const src = store.tracks[body.audioId];
      if (body.continueAt != null) need(body.continueAt > 0 && (!src?.duration || body.continueAt < src.duration), `Continue point must be between 0 and ${fmt(src?.duration)}.`);
      label ||= `${src?.title || "Track"} (extended)`;
      break;
    }
    case "cover":
    case "uploadExtend":
    case "addInstrumental":
    case "addVocals":
      need(body.uploadUrl, "Add source audio first (upload, link or library).");
      if (id === "addInstrumental") need(body.title && body.tags && body.negativeTags, "Title, backing style and exclude are required.");
      if (id === "addVocals") need(body.title && body.style && body.negativeTags, "Title, style and exclude are required.");
      label ||= t.name;
      break;
    case "mashup":
      need(body._a && body._b, "Add both tracks for the mashup.");
      body.uploadUrlList = [body._a, body._b];
      delete body._a;
      delete body._b;
      label ||= "Mashup";
      break;
    case "replace": {
      need(body.audioId, "Pick a track.");
      const s = body.infillStartS, e = body.infillEndS;
      need(s != null && e != null && e - s >= 10, "The section must be at least 10 seconds long.");
      const src = store.tracks[body.audioId];
      if (src?.duration) need(e - s <= src.duration / 2 + 0.01, `Replace at most half the song (${fmt(src.duration / 2)}).`);
      need(body.lyrics && body.fullLyrics && body.tags && body.title, "New lyrics, full lyrics, title and style are required.");
      body.prompt = body.lyrics;
      label = `${body.title} (section redo)`;
      break;
    }
  }
  if (!["replace"].includes(id)) body.model ||= "V6";
  await startMusic(id, t.fn, body, label || t.name);
}

// ================= Sounds =================
function renderSounds() {
  const root = $("#view-sounds");
  root.innerHTML = `<div class="grid-2"><div class="panel hero-panel"><div class="panel-head"><div><h2>Sound lab</h2><p class="sub">Loops, one-shots, textures and effects — with tempo and key control.</p></div></div><div id="soundForm"></div></div>
    <aside class="side">${sidePanels()}</aside></div>`;
  mountForm($("#soundForm", root), "sounds", SOUNDS, {
    submitLabel: "◎ Generate sound",
    submitNote: "Great for beats, stingers and ambience",
    onSubmit: async (p) => {
      need(p.prompt, "Describe the sound you want.");
      const body = { ...p, model: p.model || "V6" };
      if (body.soundKey === "Any") delete body.soundKey;
      await startMusic("sounds", "sounds", body, p.prompt.slice(0, 60));
    },
  });
  renderQueue();
  renderRecent();
}

// ================= jobs =================
const OPS = {
  generate: ["✦", "New song"], extend: ["⟿", "Extension"], cover: ["⟲", "Cover"], uploadExtend: ["⇥", "Upload extend"],
  addInstrumental: ["🎹", "Add instrumental"], addVocals: ["🎤", "Add vocals"], mashup: ["⨯", "Mashup"], replace: ["✂", "Section redo"],
  sounds: ["◎", "Sound"], import: ["⇩", "Imported"], lyrics: ["✍", "Lyrics"], wav: ["〰", "WAV"], stems: ["☰", "Stems"], midi: ["♩", "MIDI"],
  video: ["▶", "Video"], art: ["🖼", "Cover art"], recovery: ["↻", "Recovery"],
};
const FAIL = /FAILED|ERROR|EXCEPTION/;
const listeners = new Map();

async function startMusic(op, fn, body, label) {
  const data = await api[fn](body);
  const job = { taskId: data.taskId, kind: "music", op, label, model: body.model, instrumental: body.instrumental, createdAt: Date.now(), state: "running", status: "PENDING", trackIds: [] };
  store.jobs.unshift(job);
  store.save();
  renderQueue();
  toast(`${OPS[op][0]} <b>${esc(label)}</b> is in the studio`, { type: "ok" });
  refreshCredits();
  kick();
  return job;
}

function startJob(kind, taskId, extra = {}) {
  const job = { taskId, kind, op: kind, createdAt: Date.now(), state: "running", ...extra };
  store.jobs.unshift(job);
  store.save();
  renderQueue();
  kick();
  return job;
}

const PARSE = {
  async music(job) {
    const d = await api.musicInfo(job.taskId);
    const tracks = d?.response?.sunoData || d?.response?.data || [];
    const status = d?.status || "PENDING";
    job.status = status;
    if (tracks.length) job.trackIds = store.upsertTracks(job, tracks);
    if (status === "SUCCESS" || (status === "CALLBACK_EXCEPTION" && tracks.some((t) => t.audio_url))) return "done";
    if (FAIL.test(status)) {
      job.error = d.errorMessage || status.replace(/_/g, " ").toLowerCase();
      return "failed";
    }
    return tracks.length ? "partial" : "running";
  },
  async lyrics(job) {
    const d = await api.lyricsInfo(job.taskId);
    job.status = d?.status;
    if (d?.status === "SUCCESS") {
      job.result = (d.response?.data || []).filter((x) => x.text);
      return "done";
    }
    if (FAIL.test(d?.status || "")) return (job.error = d.errorMessage || d.status), "failed";
    return "running";
  },
  async wav(job) {
    const d = await api.wavInfo(job.taskId);
    if (d?.successFlag === "SUCCESS") return (job.result = d.response?.audioWavUrl), "done";
    if (FAIL.test(d?.successFlag || "")) return (job.error = d.errorMessage || d.successFlag), "failed";
    return "running";
  },
  async stems(job) {
    const d = await api.stemsInfo(job.taskId);
    if (d?.successFlag === "SUCCESS") return (job.result = d.response), "done";
    if (FAIL.test(d?.successFlag || "")) return (job.error = d.errorMessage || d.successFlag), "failed";
    return "running";
  },
  async midi(job) {
    const d = await api.midiInfo(job.taskId);
    const f = +d?.successFlag;
    if (f === 1) return (job.result = d.midiData?.instruments || []), "done";
    if (f >= 2) return (job.error = d.errorMessage || "MIDI generation failed"), "failed";
    return "running";
  },
  async video(job) {
    const d = await api.videoInfo(job.taskId);
    if (d?.successFlag === "SUCCESS") return (job.result = d.response?.videoUrl), "done";
    if (FAIL.test(d?.successFlag || "")) return (job.error = d.errorMessage || d.successFlag), "failed";
    return "running";
  },
  async art(job) {
    const d = await api.artInfo(job.taskId);
    const f = +d?.successFlag;
    if (f === 1) return (job.result = d.response?.images || []), "done";
    if (f === 3) return (job.error = d.errorMessage || "Cover generation failed"), "failed";
    return "running";
  },
  async recovery(job) {
    const r = await api.recoverInfo(job.taskId);
    if (r.code === 201) return "running";
    if (r.code === 200) return (job.result = r.data || []), "done";
    job.error = r.msg || "Recovery failed";
    return "failed";
  },
};

let polling = false;
let kickTimer;
function kick() {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(pollAll, 1500);
}

async function pollAll() {
  if (polling || $("#app").hidden) return;
  polling = true;
  try {
    const active = store.jobs.filter((j) => j.state === "running" || j.state === "partial");
    for (const job of active) {
      if (Date.now() - (job.lastPoll || 0) < 4000) continue;
      job.lastPoll = Date.now();
      const before = job.state;
      try {
        job.state = await PARSE[job.kind](job);
      } catch (e) {
        if (e.code === 401) {
          store.clearKey();
          return showGate("Your key is no longer valid. Please enter it again.");
        }
        job.misses = (job.misses || 0) + 1;
        if (job.misses > 8 && e.code && e.code !== 430 && e.code !== 405) (job.state = "failed"), (job.error = e.message);
      }
      if (job.state === "running" && Date.now() - job.createdAt > 30 * 60 * 1000) (job.state = "failed"), (job.error = "Timed out — try importing the task later.");
      if (before !== job.state) onJobChange(job, before);
      listeners.get(job.taskId)?.(job);
      await sleep(350);
    }
    store.save();
    if (active.length) renderQueue();
  } finally {
    polling = false;
    const more = store.jobs.some((j) => j.state === "running" || j.state === "partial");
    clearTimeout(kickTimer);
    kickTimer = setTimeout(pollAll, more ? 4000 : 15000);
  }
}

function onJobChange(job, before) {
  const [ico, name] = OPS[job.op] || ["•", job.kind];
  if (job.kind === "music") {
    renderRecent();
    if (view === "library") renderLibrary();
    updateLibCount();
    if (job.state === "partial" && before === "running") {
      toast(`${ico} First take of <b>${esc(job.label)}</b> is streaming`, { type: "ok", action: "Play", onAction: () => playTrack(job.trackIds[0]) });
    }
    if (job.state === "done") {
      burst();
      toast(`🎉 <b>${esc(job.label)}</b> is ready`, { type: "ok", action: "Play", onAction: () => playTrack(job.trackIds[0]), ms: 8000 });
      refreshCredits();
      if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") new Notification("Your song is ready", { body: job.label });
    }
  } else if (job.trackId) {
    applyDerived(job);
    if (job.state === "done" && job.kind !== "lyrics") toast(`${ico} ${name} ready for <b>${esc(store.tracks[job.trackId]?.title || "your track")}</b>`, { type: "ok", action: "Open", onAction: () => openDrawer(job.trackId) });
    refreshCredits();
  }
  if (job.state === "failed" && job.kind !== "lyrics") toast(`⚠ ${name} failed: ${esc(job.error)}`, { type: "error", ms: 8000 });
}

function applyDerived(job) {
  const x = store.extra(job.trackId);
  const rec = { taskId: job.taskId, state: job.state, result: job.result, error: job.error };
  if (job.kind === "stems") {
    const s = (x.stems || []).find((s) => s.taskId === job.taskId);
    if (s) Object.assign(s, rec);
  } else if (job.kind === "midi") {
    const s = (x.stems || []).find((s) => s.taskId === job.stemsTaskId);
    if (s) s.midi = rec;
  } else if (job.kind === "recovery") {
    x.recovery = rec;
    if (job.state === "done") {
      for (const r of job.result || []) if (r.status === "success" && store.tracks[r.id]) store.tracks[r.id].audioUrl = r.audio_url;
    }
  } else x[job.kind] = rec;
  store.save();
  if (drawerTrack === job.trackId) renderDrawer();
}

function stepIndex(job) {
  if (job.state === "done") return 3;
  if (job.state === "partial" || job.status === "FIRST_SUCCESS") return 2;
  if (job.status === "TEXT_SUCCESS") return 1;
  return 0;
}

function renderQueue() {
  const jobs = store.jobs.filter((j) => !j.hidden && j.kind !== "lyrics").slice(0, 8);
  const html = jobs.length
    ? jobs
        .map((j) => {
          const [ico, name] = OPS[j.op] || ["•", j.kind];
          const running = j.state === "running" || j.state === "partial";
          const track = j.trackId && store.tracks[j.trackId];
          const steps = j.kind === "music" && j.state !== "failed"
            ? `<div class="steps">${["Queued", "Writing", "First take", "Done"].map((s, i) => `<span class="${i <= stepIndex(j) ? "on" : ""}">${s}</span>`).join("")}</div>`
            : "";
          const takes = (j.trackIds || []).map((id) => store.tracks[id]).filter(Boolean);
          return `<div class="job ${j.state}">
            <div class="job-top"><span class="job-ico">${running ? '<span class="eq on"><i></i><i></i><i></i><i></i></span>' : ico}</span>
              <div class="job-meta"><b>${esc(j.label || (track ? track.title : name))}</b><small>${name} · ${ago(j.createdAt)} ago${j.state === "failed" ? ` · <span class="bad">${esc(j.error || "failed")}</span>` : ""}</small></div>
              ${running ? "" : `<button class="icon-btn sm" data-hide-job="${esc(j.taskId)}" aria-label="Dismiss">✕</button>`}</div>
            ${steps}
            ${takes.length ? `<div class="takes">${takes.map((t) => `<button class="take" data-play="${esc(t.id)}" title="Play"><span class="take-art" style="${t.image ? `background-image:url('${esc(t.image)}')` : artFallback(t)}"></span><span>▶ ${esc(t.title)}</span></button>`).join("")}</div>` : ""}
            ${track && j.state === "done" ? `<button class="link" data-open="${esc(j.trackId)}">Open ${esc(track.title)} →</button>` : ""}
          </div>`;
        })
        .join("")
    : `<div class="empty-mini">Nothing cooking yet. Your jobs show up here with live progress.</div>`;
  $$(".queue-slot").forEach((s) => (s.innerHTML = html));
}

function renderRecent() {
  const list = store.trackList().slice(0, 6);
  const html = list.length ? `<div class="recent">${list.map((t) => miniCard(t)).join("")}</div>` : `<div class="empty-mini">Your finished songs land here. Try <b>🎲 Surprise me</b> for a quick start.</div>`;
  $$(".recent-slot").forEach((s) => (s.innerHTML = html));
}

const miniCard = (t) => `<div class="mini ${current === t.id ? "playing" : ""}" data-open="${esc(t.id)}">
  <button class="mini-art" data-play="${esc(t.id)}" style="${t.image ? `background-image:url('${esc(t.image)}')` : artFallback(t)}" aria-label="Play ${esc(t.title)}"><span>▶</span></button>
  <div class="mini-meta"><b>${esc(t.title)}</b><small>${esc((t.tags || "").slice(0, 48))}</small></div><span class="dur">${fmt(t.duration)}</span></div>`;

// ================= library =================
let libFilter = "all";
let libQuery = "";
function updateLibCount() {
  const n = Object.keys(store.tracks).length;
  $("#libCount").textContent = n ? n : "";
}

function filteredTracks() {
  const q = libQuery.toLowerCase();
  return store.trackList().filter((t) => {
    if (libFilter === "fav" && !t.favorite) return false;
    if (libFilter === "inst" && !t.instrumental) return false;
    if (libFilter === "vocal" && t.instrumental) return false;
    if (q && !`${t.title} ${t.tags} ${t.lyrics}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderLibrary() {
  const root = $("#view-library");
  const all = store.trackList();
  const mins = Math.round(all.reduce((a, t) => a + (t.duration || 0), 0) / 60);
  const list = filteredTracks();
  root.innerHTML = `<div class="lib-head"><div><h2>Your library</h2><p class="sub">${all.length} song${all.length === 1 ? "" : "s"} · ${mins} min of music · saved in this browser</p></div>
    <div class="lib-tools"><input type="search" id="libSearch" placeholder="Search titles, styles, lyrics…" value="${esc(libQuery)}" />
      <div class="seg">${[["all", "All"], ["fav", "♥ Favorites"], ["vocal", "Vocal"], ["inst", "Instrumental"]].map(([k, l]) => `<button data-filter="${k}" class="${libFilter === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <button class="btn btn-ghost btn-sm" id="importTask">⇩ Import task</button></div></div>
    ${all.length === 0
      ? `<div class="empty"><div class="empty-art"><span class="eq on big"><i></i><i></i><i></i><i></i><i></i></span></div><h3>No songs yet</h3><p>Your first track is a sentence away.</p><button class="btn btn-primary" data-go="create">✦ Create your first song</button></div>`
      : list.length === 0
        ? `<div class="empty"><h3>No matches</h3><p>Try a different search or filter.</p></div>`
        : `<div class="lib-grid">${list.map(card).join("")}</div>`}`;
  const s = $("#libSearch", root);
  s.oninput = () => {
    libQuery = s.value;
    const pos = s.selectionStart;
    renderLibrary();
    const n = $("#libSearch");
    n.focus();
    n.selectionStart = n.selectionEnd = pos;
  };
  $$("[data-filter]", root).forEach((b) => (b.onclick = () => ((libFilter = b.dataset.filter), renderLibrary())));
  $("#importTask", root).onclick = openImport;
}

const card = (t) => `<article class="card ${current === t.id ? "playing" : ""}">
  <button class="card-art" data-play="${esc(t.id)}" style="${t.image ? `background-image:url('${esc(t.image)}')` : artFallback(t)}" aria-label="Play ${esc(t.title)}">
    <span class="card-play">${current === t.id && !audio.paused ? "❚❚" : "▶"}</span><span class="card-dur">${fmt(t.duration)}</span></button>
  <div class="card-body" data-open="${esc(t.id)}"><b>${esc(t.title)}</b><small>${esc((t.tags || "").slice(0, 70))}</small></div>
  <div class="card-foot"><span class="badge">${esc(OPS[t.op]?.[1] || "Song")}</span><span class="grow"></span>
    <button class="icon-btn sm fav ${t.favorite ? "on" : ""}" data-fav="${esc(t.id)}" aria-label="Favorite">${t.favorite ? "♥" : "♡"}</button>
    <button class="icon-btn sm" data-open="${esc(t.id)}" aria-label="More">⋯</button></div></article>`;

// ================= drawer =================
let drawerTrack = null;
function openDrawer(id) {
  if (!store.tracks[id]) return;
  drawerTrack = id;
  renderDrawer();
  $("#drawer").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
  $("#scrim").hidden = false;
  $("#drawer").focus();
}
function closeDrawer() {
  drawerTrack = null;
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#scrim").hidden = true;
}

const STEM_TYPES = [["separate_vocal", "Vocals + instrumental"], ["split_stem", "All instruments (up to 12)"], ["split_stem_advanced", "One specific instrument"]];
const STEM_NAMES = ["Lead Vocal", "Backing Vocals", "Drum Kit", "Kick", "Snare", "Hi-Hat", "Bass", "Synth Bass", "808", "Piano", "Electric Piano", "Rhodes", "Keyboards", "Organ", "Guitar", "Acoustic Guitar", "Electric Guitar", "Lead Electric Guitar", "Rhythm Electric Guitar", "Strings", "String Section", "Violin", "Cello", "Synth", "Synth Pad", "Synth Lead", "Synth Keys", "Arpeggiator", "Brass Section", "Trumpet", "Saxophone", "Flute", "Choir", "Percussion", "Hand Clap", "Sound Effects", "Risers", "Orchestra"];

function stemList(result) {
  if (!result) return [];
  if (Array.isArray(result.originData) && result.originData.length) return result.originData.map((s) => ({ name: s.stem_type_group_name || "Stem", url: s.audio_url, id: s.id }));
  return Object.entries(result)
    .filter(([k, v]) => /Url$/.test(k) && v && k !== "originUrl")
    .map(([k, v]) => ({ name: k.replace(/Url$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), url: v }));
}

function stateChip(rec) {
  if (!rec) return "";
  if (rec.state === "running" || rec.state === "partial") return `<span class="chip-state run"><span class="spin"></span> working…</span>`;
  if (rec.state === "failed") return `<span class="chip-state bad">failed · ${esc(rec.error || "")}</span>`;
  return `<span class="chip-state ok">✓ ready</span>`;
}

// A tool's action button, or its live state; failed runs show the error plus a retry.
function runBtn(rec, run, label) {
  if (!rec || rec.state === "failed") return `${rec ? stateChip(rec) : ""}<button class="btn btn-ghost btn-sm" data-tool-run="${run}">${rec ? "Retry" : label}</button>`;
  return stateChip(rec);
}

function renderDrawer() {
  const t = store.tracks[drawerTrack];
  if (!t) return closeDrawer();
  const x = store.extra(t.id);
  const url = t.audioUrl || t.streamUrl;
  const stems = x.stems || [];
  $("#drawer").innerHTML = `
    <div class="d-head">
      <button class="icon-btn d-close" data-close-drawer aria-label="Close">✕</button>
      <div class="d-art" style="${t.image ? `background-image:url('${esc(t.image)}')` : artFallback(t)}"><button class="play-btn big" data-play="${esc(t.id)}" aria-label="Play">${current === t.id && !audio.paused ? "❚❚" : "▶"}</button></div>
      <div class="d-title"><input class="title-edit" data-rename value="${esc(t.title)}" aria-label="Title" /><p>${esc(t.tags)}</p>
        <div class="d-meta"><span>${fmt(t.duration)}</span><span>${esc(t.model || "")}</span><span>${new Date(t.createdAt).toLocaleDateString()}</span></div></div>
      <div class="d-actions">
        <button class="btn btn-primary btn-sm" data-play="${esc(t.id)}">▶ Play</button>
        <button class="btn btn-ghost btn-sm" data-dl ${url ? "" : "disabled"}>⬇ MP3</button>
        <button class="btn btn-ghost btn-sm ${t.favorite ? "on" : ""}" data-fav="${esc(t.id)}">${t.favorite ? "♥ Loved" : "♡ Love"}</button>
        <button class="btn btn-ghost btn-sm" data-share>⧉ Copy link</button>
      </div>
    </div>

    <section class="d-sec"><h4>Keep going</h4><div class="quick">
      <button data-q="extend"><b>⟿ Extend</b><small>Make it longer</small></button>
      <button data-q="cover"><b>⟲ Restyle</b><small>Cover in a new genre</small></button>
      <button data-q="replace"><b>✂ Redo a section</b><small>Swap 10s+ of lyrics</small></button>
      <button data-q="like"><b>✦ More like this</b><small>Same style, new song</small></button>
      <button data-q="addVocals"><b>🎤 New vocals</b><small>Sing over this track</small></button>
      <button data-q="mashup"><b>⨯ Mashup</b><small>Blend with another</small></button>
    </div></section>

    <section class="d-sec"><h4>Export & tools</h4>
      <div class="toolrow"><div><b>〰 Studio-quality WAV</b><small>Lossless export for editing or release.</small></div>
        ${x.wav?.state === "done" ? `<button class="btn btn-soft btn-sm" data-dl-url="${esc(x.wav.result)}" data-dl-name="${esc(safeName(t.title))}.wav">⬇ WAV</button>` : runBtn(x.wav, "wav", "Convert")}</div>

      <div class="toolcard"><div class="toolrow"><div><b>☰ Stems</b><small>Split vocals, drums, bass and more.</small></div></div>
        <div class="stem-form"><select data-stem-type>${STEM_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <select data-stem-name hidden>${STEM_NAMES.map((n) => `<option>${n}</option>`).join("")}</select>
          <button class="btn btn-ghost btn-sm" data-tool-run="stems">Split</button></div>
        ${stems.map((s, i) => `<div class="stem-job"><div class="toolrow"><small>${esc(STEM_TYPES.find((x) => x[0] === s.type)?.[1] || s.type)}${s.stemName ? ` · ${esc(s.stemName)}` : ""}</small>${stateChip(s)}</div>
          ${s.state === "done" ? `<div class="stems">${stemList(s.result).map((st) => `<div class="stem"><span>${esc(st.name)}</span><audio controls preload="none" src="${esc(st.url)}"></audio><button class="icon-btn sm" data-dl-url="${esc(st.url)}" data-dl-name="${esc(safeName(t.title))}-${esc(safeName(st.name))}.mp3" aria-label="Download">⬇</button></div>`).join("")}</div>
            <div class="toolrow midi-row"><div><b>♩ MIDI</b><small>Notes for every instrument, ready for your DAW.</small></div>
            ${s.midi?.state === "done" ? `<button class="btn btn-soft btn-sm" data-midi="${i}">⬇ .mid</button><small class="muted">${(s.midi.result || []).map((m) => esc(m.name)).join(", ")}</small>` : s.midi && s.midi.state !== "failed" ? stateChip(s.midi) : `${s.midi ? stateChip(s.midi) : ""}<button class="btn btn-ghost btn-sm" data-midi-run="${i}">${s.midi ? "Retry" : "Generate"}</button>`}</div>` : ""}</div>`).join("")}
      </div>

      <div class="toolcard"><div class="toolrow"><div><b>▶ Music video</b><small>An MP4 visualizer, ready to post.</small></div>
        ${x.video?.state === "done" ? "" : stateChip(x.video)}</div>
        ${x.video?.state === "done" ? `<video controls preload="none" src="${esc(x.video.result)}" class="d-video"></video><button class="btn btn-soft btn-sm" data-dl-url="${esc(x.video.result)}" data-dl-name="${esc(safeName(t.title))}.mp4">⬇ MP4</button>`
          : x.video?.state === "running" ? "" : `<div class="stem-form"><input type="text" data-video-author maxlength="50" placeholder="Artist name (optional)" /><input type="text" data-video-domain maxlength="50" placeholder="Watermark (optional)" /><button class="btn btn-ghost btn-sm" data-tool-run="video">Create</button></div>`}
      </div>

      <div class="toolcard"><div class="toolrow"><div><b>🖼 Cover art</b><small>AI artwork for this song's session.</small></div>
        ${x.art?.state === "done" ? "" : runBtn(x.art, "art", "Generate")}</div>
        ${x.art?.state === "done" ? `<div class="art-grid">${(x.art.result || []).map((u) => `<div class="art-item"><img src="${esc(u)}" alt="Generated cover" loading="lazy" /><div><button class="link" data-set-art="${esc(u)}">Use as cover</button> · <button class="link" data-dl-url="${esc(u)}" data-dl-name="${esc(safeName(t.title))}.png">download</button></div></div>`).join("")}</div>` : ""}
      </div>

      <div class="toolrow"><div><b>❝ Synced lyrics</b><small>Word-by-word karaoke while it plays.</small></div>
        <button class="btn btn-ghost btn-sm" data-tool-run="aligned">${x.aligned ? "Show" : "Load"}</button></div>

      <div class="toolcard"><div class="toolrow"><div><b>👤 Persona</b><small>Capture this voice & vibe to reuse on new songs.</small></div>${x.persona ? `<span class="chip-state ok">✓ ${esc(x.persona.name)}</span>` : ""}</div>
        ${x.persona ? `<p class="muted mono">ID: ${esc(x.persona.personaId)}</p>` : `<div class="persona-form"><input type="text" data-p-name placeholder="Name, e.g. Midnight Crooner" maxlength="60" />
          <textarea data-p-desc rows="2" placeholder="Describe the voice, genre and mood">${esc(t.tags)}</textarea>
          <div class="range2"><label>Sample from <input type="number" data-p-start min="0" step="0.1" value="0" /> s</label><label>to <input type="number" data-p-end min="1" step="0.1" value="${Math.min(30, Math.floor(t.duration || 30))}" /> s</label></div>
          <button class="btn btn-ghost btn-sm" data-tool-run="persona">Create persona</button></div>`}
      </div>

      <div class="toolrow"><div><b>↻ Recover audio links</b><small>If playback stopped working, refresh this session's links.</small></div>
        ${x.recovery?.state === "done" ? `${stateChip(x.recovery)}<button class="btn btn-ghost btn-sm" data-tool-run="recovery">Again</button>` : runBtn(x.recovery, "recovery", "Recover")}</div>
    </section>

    ${t.lyrics ? `<section class="d-sec"><h4>Lyrics</h4><pre class="lyrics-view">${esc(t.lyrics)}</pre></section>` : ""}

    <section class="d-sec ids"><h4>Details</h4>
      <div class="kv"><span>Task ID</span><code>${esc(t.taskId)}</code><button class="link" data-copy="${esc(t.taskId)}">copy</button></div>
      <div class="kv"><span>Audio ID</span><code>${esc(t.id)}</code><button class="link" data-copy="${esc(t.id)}">copy</button></div>
      <button class="link danger" data-delete>Remove from library</button>
    </section>`;
  const d = $("#drawer");
  const typeSel = $("[data-stem-type]", d);
  if (typeSel) typeSel.onchange = () => ($("[data-stem-name]", d).hidden = typeSel.value !== "split_stem_advanced");
  const rn = $("[data-rename]", d);
  rn.onchange = () => {
    t.title = rn.value.trim() || t.title;
    store.save();
    renderRecent();
    if (view === "library") renderLibrary();
    if (current === t.id) $("#pTitle").textContent = t.title;
  };
}

async function drawerAction(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const t = store.tracks[drawerTrack];
  if (!t) return;
  const x = store.extra(t.id);
  const d = $("#drawer");
  if (b.dataset.closeDrawer != null) return closeDrawer();
  if (b.dataset.dl != null) return download(t.audioUrl || t.streamUrl, `${safeName(t.title)}.mp3`);
  if (b.dataset.share != null) return copy(t.audioUrl || t.streamUrl, "Audio link copied");
  if (b.dataset.copy) return copy(b.dataset.copy, "Copied");
  if (b.dataset.setArt) {
    t.image = b.dataset.setArt;
    store.save();
    renderDrawer();
    renderRecent();
    if (current === t.id) $("#pArt").src = t.image;
    return toast("Cover updated", { type: "ok" });
  }
  if (b.dataset.delete != null) {
    if (!confirm(`Remove "${t.title}" from your library? This only affects this browser.`)) return;
    delete store.tracks[t.id];
    delete store.extras[t.id];
    store.save();
    closeDrawer();
    renderRecent();
    updateLibCount();
    if (view === "library") renderLibrary();
    return;
  }
  if (b.dataset.midi != null) {
    const s = x.stems[+b.dataset.midi];
    const url = URL.createObjectURL(midiBlob(s.midi.result));
    download(url, `${safeName(t.title)}.mid`);
    return setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  if (b.dataset.q) return quickAction(b.dataset.q, t);

  const run = b.dataset.toolRun || (b.dataset.midiRun != null ? "midi" : null);
  if (!run) return;
  b.disabled = true;
  const old = b.innerHTML;
  b.innerHTML = '<span class="spin"></span>';
  try {
    switch (run) {
      case "wav": {
        const r = await api.wav(t.taskId, t.id);
        x.wav = { taskId: r.taskId, state: "running" };
        startJob("wav", r.taskId, { trackId: t.id, label: t.title });
        break;
      }
      case "stems": {
        const type = $("[data-stem-type]", d).value;
        const body = { taskId: t.taskId, audioId: t.id, type };
        if (type === "split_stem_advanced") body.stemName = $("[data-stem-name]", d).value;
        const r = await api.stems(body);
        (x.stems ||= []).unshift({ taskId: r.taskId, type, stemName: body.stemName, state: "running" });
        startJob("stems", r.taskId, { trackId: t.id, label: t.title });
        break;
      }
      case "midi": {
        const s = x.stems[+b.dataset.midiRun];
        const r = await api.midi({ taskId: s.taskId });
        s.midi = { taskId: r.taskId, state: "running" };
        startJob("midi", r.taskId, { trackId: t.id, stemsTaskId: s.taskId, label: t.title });
        break;
      }
      case "video": {
        const body = { taskId: t.taskId, audioId: t.id };
        const a = $("[data-video-author]", d).value.trim();
        const w = $("[data-video-domain]", d).value.trim();
        if (a) body.author = a;
        if (w) body.domainName = w;
        const r = await api.video(body);
        x.video = { taskId: r.taskId, state: "running" };
        startJob("video", r.taskId, { trackId: t.id, label: t.title });
        break;
      }
      case "art": {
        const r = await api.art(t.taskId);
        x.art = { taskId: r.taskId, state: "running" };
        startJob("art", r.taskId, { trackId: t.id, label: t.title });
        break;
      }
      case "recovery": {
        const r = await api.recover(t.taskId);
        const id = r?.taskId || r?.task_id || r;
        x.recovery = { taskId: id, state: "running" };
        startJob("recovery", id, { trackId: t.id, label: t.title });
        break;
      }
      case "aligned": {
        if (!x.aligned) {
          const r = await api.timestampedLyrics(t.taskId, t.id);
          x.aligned = r?.alignedWords || [];
          if (!x.aligned.length) toast("No timed lyrics for this track (instrumental?).", { type: "error" });
        }
        if (current !== t.id) playTrack(t.id);
        showKaraoke(true);
        break;
      }
      case "persona": {
        const name = $("[data-p-name]", d).value.trim();
        const description = $("[data-p-desc]", d).value.trim();
        need(name && description, "Give the persona a name and a description.");
        const vocalStart = +$("[data-p-start]", d).value || 0;
        const vocalEnd = +$("[data-p-end]", d).value || 30;
        need(vocalEnd > vocalStart, "The sample end must be after the start.");
        const r = await api.persona({ taskId: t.taskId, audioId: t.id, name, description, vocalStart, vocalEnd, style: t.tags?.slice(0, 200) || undefined });
        x.persona = { personaId: r.personaId, name: r.name || name };
        store.personas.unshift({ personaId: r.personaId, name: r.name || name, description, kind: "style", from: t.title });
        toast(`👤 Persona <b>${esc(name)}</b> saved — pick it in Custom mode`, { type: "ok" });
        break;
      }
    }
    store.save();
    renderDrawer();
  } catch (err) {
    toast(`⚠ ${esc(err.message)}`, { type: "error", ms: 7000 });
    b.disabled = false;
    b.innerHTML = old;
  }
}

function quickAction(q, t) {
  closeDrawer();
  const url = t.audioUrl || t.streamUrl;
  if (q === "like") {
    createMode = "custom";
    localStorage.setItem("ss.createMode", "custom");
    store.draft["create-custom"] = { ...(store.draft["create-custom"] || {}), style: t.tags, title: "", instrumental: !!t.instrumental };
    renderCreate();
    return go("create");
  }
  const presets = {
    extend: { audioId: t.id, taskId: t.taskId, style: t.tags },
    cover: { uploadUrl: url, title: `${t.title} (cover)` },
    replace: { audioId: t.id, taskId: t.taskId, fullLyrics: t.lyrics, tags: t.tags, title: t.title },
    addVocals: { uploadUrl: url, title: `${t.title} (vocals)` },
    mashup: { _a: url },
  };
  renderStudio({ tool: q, values: presets[q] });
  go("studio");
}

async function copy(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg, { type: "ok" });
  } catch {
    prompt("Copy:", text);
  }
}

// ================= player =================
const audio = $("#audio");
let current = null;
let queue = [];

function playTrack(id) {
  const t = store.tracks[id];
  if (!t) return;
  if (current === id) {
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
    return;
  }
  current = id;
  queue = (view === "library" ? filteredTracks() : store.trackList()).map((x) => x.id);
  audio.src = t.audioUrl || t.streamUrl;
  audio.dataset.fallback = t.audioUrl && t.streamUrl ? t.streamUrl : "";
  audio.play().catch(() => {});
  $("#player").hidden = false;
  document.body.classList.add("has-player");
  $("#pTitle").textContent = t.title;
  $("#pTags").textContent = t.tags || "";
  $("#pArt").src = t.image || "favicon.svg";
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: "Suno Studio", artwork: t.image ? [{ src: t.image, sizes: "512x512" }] : [] });
  }
  if (!$("#karaoke").hidden) renderKaraoke();
  refreshPlayingMarks();
}

function step(dir) {
  if (!queue.length) return;
  const i = queue.indexOf(current);
  const next = queue[(i + dir + queue.length) % queue.length];
  if (next) playTrack(next);
}

function refreshPlayingMarks() {
  $$(".card, .mini").forEach((c) => {
    const id = c.querySelector("[data-play]")?.dataset.play;
    c.classList.toggle("playing", id === current);
    const p = c.querySelector(".card-play");
    if (p) p.textContent = id === current && !audio.paused ? "❚❚" : "▶";
  });
  const dp = $("#drawer .d-art .play-btn");
  if (dp && drawerTrack) dp.textContent = drawerTrack === current && !audio.paused ? "❚❚" : "▶";
}

function initPlayer() {
  $("#pPlay").onclick = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
  $("#pPrev").onclick = () => step(-1);
  $("#pNext").onclick = () => step(1);
  $("#pOpen").onclick = () => current && openDrawer(current);
  $("#pLyrics").onclick = () => showKaraoke($("#karaoke").hidden);
  $("#karaokeClose").onclick = () => showKaraoke(false);
  $("#pVol").oninput = (e) => (audio.volume = +e.target.value);
  audio.volume = 0.9;
  const seek = $("#pSeek");
  let seeking = false;
  seek.oninput = () => {
    seeking = true;
    $("#pCur").textContent = fmt((seek.value / 1000) * (audio.duration || 0));
  };
  seek.onchange = () => {
    if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    seeking = false;
  };
  audio.ontimeupdate = () => {
    if (!seeking && audio.duration && isFinite(audio.duration)) seek.value = (audio.currentTime / audio.duration) * 1000;
    $("#pCur").textContent = fmt(audio.currentTime);
    $("#pDur").textContent = isFinite(audio.duration) ? fmt(audio.duration) : "live";
    seek.style.setProperty("--p", `${seek.value / 10}%`);
    highlightKaraoke();
  };
  audio.onplay = audio.onpause = () => {
    $("#pPlay").textContent = audio.paused ? "▶" : "❚❚";
    $("#pEq").classList.toggle("on", !audio.paused);
    refreshPlayingMarks();
  };
  audio.onended = () => step(1);
  audio.onerror = () => {
    if (audio.dataset.fallback) {
      audio.src = audio.dataset.fallback;
      audio.dataset.fallback = "";
      return audio.play().catch(() => {});
    }
    toast("This audio link didn't load. It may have expired.", { type: "error", action: "Recover", onAction: () => openDrawer(current) });
  };
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  }
}

// ---------- karaoke ----------
function showKaraoke(on) {
  $("#karaoke").hidden = !on;
  $("#pLyrics").classList.toggle("on", on);
  if (on) renderKaraoke();
}

function renderKaraoke() {
  const t = store.tracks[current];
  const body = $("#karaokeBody");
  if (!t) return (body.innerHTML = `<p class="muted">Play a track to see its lyrics.</p>`);
  $("#karaokeTitle").textContent = t.title;
  const words = store.extra(t.id).aligned;
  if (words?.length) {
    body.innerHTML = words
      .map((w, i) => {
        const txt = w.word || "";
        const html = esc(txt)
          .replace(/\[([^\]]+)\]/g, '<span class="k-sec">$1</span>')
          .replace(/\n/g, "<br />");
        return `<span class="kw" data-i="${i}">${html}</span>`;
      })
      .join(" ");
    body.dataset.mode = "sync";
  } else {
    body.dataset.mode = "plain";
    body.innerHTML = t.lyrics
      ? `<pre class="lyrics-view">${esc(t.lyrics)}</pre><p class="muted small">Want it word-by-word? Open the track and tap <b>Synced lyrics</b>.</p>`
      : `<p class="muted">No lyrics for this track.</p>`;
  }
}

let lastKw = -1;
function highlightKaraoke() {
  if ($("#karaoke").hidden || $("#karaokeBody").dataset.mode !== "sync") return;
  const words = store.extra(current)?.aligned;
  if (!words) return;
  const tm = audio.currentTime;
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].startS <= tm) idx = i;
    else break;
  }
  if (idx === lastKw) return;
  lastKw = idx;
  $$("#karaokeBody .kw").forEach((el, i) => {
    el.classList.toggle("past", i < idx);
    el.classList.toggle("now", i === idx);
  });
  const now = $(`#karaokeBody .kw[data-i="${idx}"]`);
  now?.scrollIntoView({ block: "center", behavior: "smooth" });
}

// ================= modals =================
const modal = $("#modal");
function openModal(html, onBind) {
  modal.innerHTML = `<button class="icon-btn modal-x" data-close-modal aria-label="Close">✕</button>${html}`;
  modal.showModal();
  onBind?.(modal);
}
modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.closest("[data-close-modal]")) modal.close();
});
modal.addEventListener("close", () => {
  for (const [k, fn] of listeners) if (fn.modal) listeners.delete(k);
});

function openLyricsWriter(target, form, sync) {
  const titleEl = form.querySelector('[data-f="title"]');
  const styleEl = form.querySelector('[data-f="style"]');
  const seed = [titleEl?.value, styleEl?.value].filter(Boolean).join(" — ");
  openModal(
    `<h3>✍ Write lyrics with AI</h3><p class="sub">Describe the story, mood or hook. You'll get a couple of versions to pick from.</p>
     <textarea id="lwPrompt" rows="3" maxlength="200" placeholder="A bittersweet song about moving out of your first apartment, with a hopeful chorus">${esc(seed ? `A song about ${seed}`.slice(0, 200) : "")}</textarea>
     <div class="modal-row"><small class="muted">Max 200 characters</small><span class="grow"></span><button class="btn btn-primary" id="lwGo">Write lyrics</button></div>
     <div id="lwOut"></div>`,
    (m) => {
      const out = $("#lwOut", m);
      $("#lwGo", m).onclick = async () => {
        const prompt = $("#lwPrompt", m).value.trim();
        if (!prompt) return;
        const btn = $("#lwGo", m);
        btn.disabled = true;
        out.innerHTML = `<div class="writing"><span class="eq on"><i></i><i></i><i></i><i></i></span> Finding the words… usually 10–40 seconds</div>`;
        try {
          const r = await api.lyrics(prompt);
          const job = startJob("lyrics", r.taskId, { label: prompt, hidden: true });
          const fn = (j) => {
            if (j.state === "done") {
              listeners.delete(j.taskId);
              btn.disabled = false;
              out.innerHTML = (j.result || [])
                .map((v, i) => `<div class="lw-opt"><div class="lw-head"><b>${esc(v.title || `Version ${i + 1}`)}</b><button class="btn btn-soft btn-sm" data-use="${i}">Use this</button></div><pre>${esc(v.text)}</pre></div>`)
                .join("") || `<p class="muted">No lyrics came back. Try rephrasing.</p>`;
              $$("[data-use]", out).forEach((b) => (b.onclick = () => {
                const v = j.result[+b.dataset.use];
                target.value = v.text;
                if (titleEl && !titleEl.value.trim() && v.title) titleEl.value = v.title.slice(0, 80);
                sync();
                modal.close();
                toast("Lyrics added ✍", { type: "ok" });
              }));
            } else if (j.state === "failed") {
              listeners.delete(j.taskId);
              btn.disabled = false;
              out.innerHTML = `<p class="bad">Couldn't write lyrics: ${esc(j.error)}</p>`;
            }
          };
          fn.modal = true;
          listeners.set(job.taskId, fn);
        } catch (e) {
          btn.disabled = false;
          out.innerHTML = `<p class="bad">${esc(e.message)}</p>`;
        }
      };
    },
  );
}

function openImport() {
  openModal(
    `<h3>⇩ Import a task</h3><p class="sub">Bring in songs made elsewhere with this API key (e.g. via code) using their task ID.</p>
     <input type="text" id="impId" placeholder="Task ID" spellcheck="false" />
     <div class="modal-row"><span class="grow"></span><button class="btn btn-primary" id="impGo">Import</button></div><p id="impMsg" class="muted"></p>`,
    (m) => {
      $("#impGo", m).onclick = async () => {
        const id = $("#impId", m).value.trim();
        if (!id) return;
        $("#impMsg", m).textContent = "Looking it up…";
        try {
          const d = await api.musicInfo(id);
          if (!d) throw new Error("Task not found.");
          const job = { taskId: id, kind: "music", op: "import", label: "Imported task", createdAt: Date.now(), state: "running", trackIds: [] };
          job.state = await PARSE.music(job);
          const first = store.tracks[job.trackIds[0]];
          if (first) job.label = first.title;
          store.jobs.unshift(job);
          store.save();
          renderQueue();
          renderRecent();
          updateLibCount();
          renderLibrary();
          kick();
          modal.close();
          toast(`Imported ${job.trackIds.length} track(s)`, { type: "ok" });
        } catch (e) {
          $("#impMsg", m).textContent = e.message;
        }
      };
    },
  );
}

function openSettings() {
  const key = store.getKey();
  const mode = getMode();
  openModal(
    `<h3>Settings</h3>
     <div class="set-row"><div><b>API key</b><small class="mono">${esc(key.slice(0, 4))}••••••••${esc(key.slice(-4))}</small></div><button class="btn btn-ghost btn-sm" id="sLogout">Change / sign out</button></div>
     <div class="set-row"><div><b>Connection</b><small>Proxy routes through this site (avoids browser CORS). Direct calls SunoAPI from your browser.</small></div>
       <div class="seg"><button data-conn="proxy" class="${mode === "proxy" ? "on" : ""}">Proxy</button><button data-conn="direct" class="${mode === "direct" ? "on" : ""}">Direct</button></div></div>
     <div class="set-row"><div><b>Notifications</b><small>Get a desktop ping when a song finishes in a background tab.</small></div><button class="btn btn-ghost btn-sm" id="sNotify">${"Notification" in window && Notification.permission === "granted" ? "Enabled ✓" : "Enable"}</button></div>
     <div class="set-row"><div><b>Library backup</b><small>Your library lives in this browser. Export it to move devices.</small></div>
       <div class="btn-group"><button class="btn btn-ghost btn-sm" id="sExport">Export</button><label class="btn btn-ghost btn-sm">Import<input type="file" accept="application/json" id="sImport" hidden /></label></div></div>
     <div class="set-row"><div><b>Start fresh</b><small>Remove all songs, jobs and drafts from this browser.</small></div><button class="btn btn-ghost btn-sm danger" id="sClear">Clear library</button></div>
     <p class="fine">Built on <a href="https://docs.sunoapi.org" target="_blank" rel="noopener">SunoAPI</a>. Generated files are kept by SunoAPI for about 15 days — download what you love.</p>`,
    (m) => {
      $("#sLogout", m).onclick = () => {
        store.clearKey();
        modal.close();
        audio.pause();
        showGate();
      };
      $$("[data-conn]", m).forEach((b) => (b.onclick = () => {
        setMode(b.dataset.conn);
        $$("[data-conn]", m).forEach((x) => x.classList.toggle("on", x === b));
        refreshCredits();
      }));
      $("#sNotify", m).onclick = async (e) => {
        if (!("Notification" in window)) return toast("Notifications aren't supported here.", { type: "error" });
        const p = await Notification.requestPermission();
        e.target.textContent = p === "granted" ? "Enabled ✓" : "Blocked";
      };
      $("#sExport", m).onclick = () => {
        const blob = new Blob([JSON.stringify({ tracks: store.tracks, extras: store.extras, personas: store.personas, jobs: store.jobs }, null, 1)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        download(url, `suno-studio-library-${new Date().toISOString().slice(0, 10)}.json`);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      };
      $("#sImport", m).onchange = async (e) => {
        try {
          const data = JSON.parse(await e.target.files[0].text());
          Object.assign(store.tracks, data.tracks || {});
          Object.assign(store.extras, data.extras || {});
          for (const p of data.personas || []) if (!store.personas.some((x) => x.personaId === p.personaId)) store.personas.push(p);
          store.save();
          updateLibCount();
          renderRecent();
          if (view === "library") renderLibrary();
          toast(`Imported ${Object.keys(data.tracks || {}).length} tracks`, { type: "ok" });
        } catch {
          toast("That file doesn't look like a Suno Studio backup.", { type: "error" });
        }
      };
      $("#sClear", m).onclick = () => {
        if (!confirm("Clear your whole library from this browser? Download anything you want to keep first.")) return;
        store.tracks = {};
        store.extras = {};
        store.jobs = [];
        store.personas = [];
        store.draft = {};
        store.save();
        store.saveDraft();
        modal.close();
        location.reload();
      };
    },
  );
}

// ================= global events =================
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-play],[data-open],[data-fav],[data-go],[data-hide-job],[data-clear-done],[data-dl-url],[data-set-art]");
  if (!el) return;
  if (el.closest("#drawer") && !el.dataset.play && !el.dataset.fav && !el.dataset.dlUrl) return;
  if (el.dataset.play) {
    e.stopPropagation();
    return playTrack(el.dataset.play);
  }
  if (el.dataset.dlUrl) return download(el.dataset.dlUrl, el.dataset.dlName);
  if (el.dataset.fav) {
    const t = store.tracks[el.dataset.fav];
    t.favorite = !t.favorite;
    store.save();
    if (view === "library") renderLibrary();
    if (drawerTrack === t.id) renderDrawer();
    return;
  }
  if (el.dataset.open) return openDrawer(el.dataset.open);
  if (el.dataset.go) return go(el.dataset.go);
  if (el.dataset.hideJob) {
    const j = store.jobs.find((x) => x.taskId === el.dataset.hideJob);
    if (j) j.hidden = true;
    store.save();
    return renderQueue();
  }
  if (el.dataset.clearDone != null) {
    store.jobs.forEach((j) => (j.state === "done" || j.state === "failed") && (j.hidden = true));
    store.save();
    renderQueue();
  }
});

function showApp(c) {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  setCredits(c);
  renderCreate();
  renderSounds();
  updateLibCount();
  const initial = location.hash.slice(1);
  go(["create", "studio", "sounds", "library"].includes(initial) ? initial : "create");
  kick();
}

function init() {
  setTheme(localStorage.getItem("ss.theme") || "system");
  $$("[data-theme-set]").forEach((b) => (b.onclick = () => setTheme(b.dataset.themeSet)));
  $$(".tab").forEach((t) => (t.onclick = () => go(t.dataset.view)));
  $("#creditsBtn").onclick = async () => {
    $("#creditsBtn").classList.add("spinning");
    await refreshCredits();
    $("#creditsBtn").classList.remove("spinning");
  };
  $("#settingsBtn").onclick = openSettings;
  $("#drawer").addEventListener("click", drawerAction);
  $("#scrim").onclick = closeDrawer;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawerTrack) closeDrawer();
    if (e.code === "Space" && current && !e.target.closest("input,textarea,select,button,[contenteditable]")) {
      e.preventDefault();
      audio.paused ? audio.play().catch(() => {}) : audio.pause();
    }
  });
  setInterval(() => document.visibilityState === "visible" && $$(".queue-slot").length && renderQueue(), 30000);
  initGate();
  initPlayer();

  const key = store.getKey();
  if (!key) return showGate();
  setKey(key);
  showApp(null);
  refreshCredits();
}

init();
