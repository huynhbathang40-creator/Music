// Declarative form builder shared by Create, Remix and Sounds.
// Each field config renders to HTML; values are collected back into a SunoAPI payload.

export const MODELS = [
  { id: "V6", name: "V6", badge: "Recommended", desc: "Natural vocals, rich detail" },
  { id: "V6_WILD", name: "V6 Wild", badge: "Experimental", desc: "Bolder, more distinctive" },
  { id: "V6_MINI", name: "V6 Mini", badge: "Fast", desc: "Light and quick drafts" },
];
export const LEGACY_MODELS = ["V5_5", "V5", "V4_5PLUS", "V4_5ALL", "V4_5", "V4"];

export const CHIPS = {
  Genre: ["Pop", "Indie folk", "Lo-fi hip hop", "Synthwave", "Trap", "R&B", "House", "Drum & bass", "Jazz", "Bossa nova", "Afrobeats", "K-pop", "Metal", "Pop punk", "Country", "Gospel", "Cinematic", "Reggaeton", "Ambient", "Funk"],
  Mood: ["dreamy", "euphoric", "melancholic", "anthemic", "chill", "dark", "playful", "romantic", "epic", "nostalgic"],
  Sound: ["female vocals", "male vocals", "choir", "808s", "acoustic guitar", "piano", "strings", "analog synths", "saxophone", "vinyl crackle"],
};

const SECTIONS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Drop", "Outro"];
const VARIETY = ["Exact", "Balanced", "High", "Extra", "Max"];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

// ---------- rendering ----------

function wrap(f, inner, extra = "") {
  const when = f.when ? ` data-when="${esc(f.when)}"` : "";
  const label = f.label ? `<label class="label">${esc(f.label)}${f.req ? ' <em class="req">required</em>' : ""}${f.max ? ` <span class="counter" data-counter="${f.k}"></span>` : ""}</label>` : "";
  const hint = f.hint ? `<p class="hint">${f.hint}</p>` : "";
  return `<div class="field field-${f.t} ${f.cls || ""}"${when} ${extra}>${label}${inner}${hint}</div>`;
}

const R = {
  text: (f, v) => wrap(f, `<input type="text" data-f="${f.k}" value="${esc(v ?? "")}" placeholder="${esc(f.ph || "")}" ${f.max ? `maxlength="${f.max}"` : ""} />`),

  number: (f, v) =>
    wrap(f, `<input type="number" data-f="${f.k}" data-type="num" value="${esc(v ?? "")}" placeholder="${esc(f.ph || "")}" ${f.min != null ? `min="${f.min}"` : ""} ${f.maxv != null ? `max="${f.maxv}"` : ""} step="${f.step || "any"}" />`),

  textarea: (f, v) =>
    wrap(f, `<textarea data-f="${f.k}" rows="${f.rows || 4}" placeholder="${esc(f.ph || "")}" ${f.max ? `maxlength="${f.max}"` : ""}>${esc(v ?? "")}</textarea>`),

  select: (f, v) =>
    wrap(f, `<select data-f="${f.k}">${f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v ?? f.def ?? "") === String(val) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select>`),

  toggle: (f, v) =>
    wrap(
      f,
      `<label class="switch"><input type="checkbox" data-f="${f.k}" data-type="bool" ${v ?? f.def ? "checked" : ""} /><span class="slider"></span><span class="switch-text">${esc(f.text || "")}</span></label>`,
    ),

  describe: (f, v) =>
    wrap(
      f,
      `<div class="describe"><textarea data-f="${f.k}" rows="${f.rows || 4}" maxlength="${f.max || 3000}" placeholder="${esc(f.ph || "")}">${esc(v ?? "")}</textarea>
       <div class="describe-bar"><button type="button" class="btn btn-ghost btn-sm" data-act="surprise">🎲 Surprise me</button><span class="hint-inline">Tip: mention genre, mood, instruments and what the song is about.</span></div></div>`,
    ),

  style: (f, v) =>
    wrap(
      f,
      `<div class="style-box"><textarea data-f="${f.k}" rows="${f.rows || 2}" maxlength="${f.max || 1000}" placeholder="${esc(f.ph || "e.g. dreamy synthwave, female vocals, 100 bpm")}">${esc(v ?? "")}</textarea>
        <button type="button" class="btn btn-soft btn-sm boost" data-act="boost" title="Let AI expand your style into a richer description">✨ Boost</button></div>
       <div class="chips" data-chips="${f.k}">${Object.entries(CHIPS)
         .map(([g, list]) => `<div class="chip-row"><span class="chip-group">${g}</span>${list.map((c) => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>`)
         .join("")}</div>`,
    ),

  lyrics: (f, v) =>
    wrap(
      f,
      `<div class="lyrics-tools">${SECTIONS.map((s) => `<button type="button" class="tag-btn" data-section="${s}">[${s}]</button>`).join("")}
        <span class="grow"></span><button type="button" class="btn btn-soft btn-sm" data-act="write-lyrics">✍ Write with AI</button></div>
       <textarea class="lyrics-area" data-f="${f.k}" rows="${f.rows || 10}" maxlength="${f.max || 5000}" placeholder="${esc(f.ph || "[Verse]\nWrite your lines here…\n\n[Chorus]\n…")}">${esc(v ?? "")}</textarea>`,
    ),

  model: (f, v, ctx) => {
    const cur = v || "V6";
    const legacy = LEGACY_MODELS.includes(cur) || ctx.showLegacy;
    return wrap(
      f,
      `<div class="models" role="radiogroup">${MODELS.map(
        (m) =>
          `<label class="model ${cur === m.id ? "on" : ""}"><input type="radio" name="${ctx.formId}-model" value="${m.id}" data-f="${f.k}" ${cur === m.id ? "checked" : ""} />
            <b>${m.name}</b><span class="badge">${m.badge}</span><small>${m.desc}</small></label>`,
      ).join("")}</div>
      <details class="legacy" ${legacy ? "open" : ""}><summary>Legacy models (discontinued upstream)</summary>
        <div class="legacy-list">${LEGACY_MODELS.map((m) => `<label class="pill-radio ${cur === m ? "on" : ""}"><input type="radio" name="${ctx.formId}-model" value="${m}" data-f="${f.k}" ${cur === m ? "checked" : ""} />${m.replace(/_/g, ".").replace(".5PLUS", ".5+")}</label>`).join("")}</div>
      </details>`,
    );
  },

  gender: (f, v) =>
    wrap(
      f,
      `<div class="seg seg-wide" role="radiogroup">${[["", "Any"], ["f", "Female"], ["m", "Male"]]
        .map(([val, lab]) => `<label class="${(v || "") === val ? "on" : ""}"><input type="radio" name="g-${f.k}-${Math.random().toString(36).slice(2, 6)}" data-f="${f.k}" value="${val}" ${(v || "") === val ? "checked" : ""} />${lab}</label>`)
        .join("")}</div>`,
    ),

  advanced: (f, v, ctx) => {
    const d = ctx.draft;
    const slider = (k, label, min, max, step, help, fmt) => {
      const val = d[k];
      const auto = val == null || val === "";
      return `<div class="adv-row"><div class="adv-top"><span>${label}</span><output data-out="${k}">${auto ? "Auto" : fmt(val)}</output><button type="button" class="link reset" data-reset="${k}" ${auto ? "hidden" : ""}>reset</button></div>
        <input type="range" data-f="${k}" data-type="num" data-auto="${auto ? 1 : 0}" min="${min}" max="${max}" step="${step}" value="${auto ? (k === "variety" ? 1 : k === "duration" ? 120 : 0.5) : val}" />
        <small>${help}</small></div>`;
    };
    const pct = (x) => `${Math.round(x * 100)}%`;
    return wrap(
      { ...f, label: "" },
      `<details class="advanced" ${f.open ? "open" : ""}><summary><span>🎛 Fine-tune</span><small>style weight, weirdness, variety${f.duration ? ", length" : ""}</small></summary><div class="adv-grid">
        ${slider("styleWeight", "Style adherence", 0, 1, 0.01, "How closely to follow your style text.", pct)}
        ${slider("weirdnessConstraint", "Weirdness", 0, 1, 0.01, "Higher = more experimental and surprising.", pct)}
        ${f.audioWeight === false ? "" : slider("audioWeight", "Audio weight", 0, 1, 0.01, "Influence of source audio features (vocal tracks only).", pct)}
        ${slider("variety", "Variety", 0, 4, 1, "How different the takes are from each other.", (x) => VARIETY[x])}
        ${f.duration ? slider("duration", "Length", 10, 360, 5, "Target length. V6 models only.", (x) => fmtDur(+x)) : ""}
      </div></details>`,
    );
  },

  persona: (f, v, ctx) => {
    const d = ctx.draft;
    const list = ctx.personas();
    return wrap(
      f,
      `<div class="persona-row"><select data-persona-pick><option value="">No persona</option>${list
        .map((p) => `<option value="${esc(p.personaId)}" ${d.personaId === p.personaId ? "selected" : ""}>${esc(p.name)}${p.kind === "voice" ? " (voice)" : ""}</option>`)
        .join("")}</select>
        <input type="text" data-f="personaId" value="${esc(d.personaId || "")}" placeholder="…or paste a Persona / Voice ID" spellcheck="false" /></div>
       <div class="seg seg-wide small">${[["style_persona", "Style persona"], ["voice_persona", "Voice persona"]]
         .map(([val, lab]) => `<label class="${(d.personaModel || "style_persona") === val ? "on" : ""}"><input type="radio" name="${ctx.formId}-pm" data-f="personaModel" value="${val}" ${(d.personaModel || "style_persona") === val ? "checked" : ""} />${lab}</label>`)
         .join("")}</div>`,
    );
  },

  track: (f, v, ctx) => {
    const list = ctx.tracks();
    const d = ctx.draft;
    if (!list.length) return wrap(f, `<div class="empty-mini">Your library is empty — create a song first, or use an uploaded file instead.</div><input type="hidden" data-f="audioId" /><input type="hidden" data-f="taskId" />`);
    const cur = d.audioId || list[0].id;
    const t = list.find((x) => x.id === cur) || list[0];
    return wrap(
      f,
      `<div class="track-pick"><img src="${esc(t.image)}" alt="" data-pick-art /><select data-track-pick>${list
        .map((x) => `<option value="${esc(x.id)}" ${x.id === t.id ? "selected" : ""}>${esc(x.title)} · ${fmtDur(x.duration)} · ${esc((x.tags || "").slice(0, 30))}</option>`)
        .join("")}</select></div>
       <input type="hidden" data-f="audioId" value="${esc(t.id)}" /><input type="hidden" data-f="taskId" value="${esc(t.taskId)}" />`,
    );
  },

  audio: (f, v, ctx) => {
    const list = ctx.tracks().filter((t) => t.audioUrl);
    return wrap(
      f,
      `<div class="audio-src" data-audio-src="${f.k}">
        <div class="seg small src-tabs"><button type="button" data-src="file" class="on">Upload</button><button type="button" data-src="url">Link</button>${list.length ? '<button type="button" data-src="lib">From library</button>' : ""}</div>
        <div data-src-pane="file"><label class="drop"><input type="file" accept="audio/*" data-upload="${f.k}" hidden /><span class="drop-ico">⇪</span><span class="drop-text">Drop an audio file or <u>browse</u></span><small>${esc(f.limit || "MP3/WAV · up to 8 minutes · stored for 3 days")}</small></label></div>
        <div data-src-pane="url" hidden><input type="url" data-url-in="${f.k}" placeholder="https://…/song.mp3" value="${esc(v || "")}" /></div>
        ${list.length ? `<div data-src-pane="lib" hidden><select data-lib-in="${f.k}"><option value="">Choose a track…</option>${list.map((t) => `<option value="${esc(t.audioUrl)}">${esc(t.title)} · ${fmtDur(t.duration)}</option>`).join("")}</select></div>` : ""}
        <input type="hidden" data-f="${f.k}" value="${esc(v || "")}" />
        <div class="src-status" data-status="${f.k}">${v ? `<span class="ok">✓ Ready</span> <audio controls preload="none" src="${esc(v)}"></audio>` : ""}</div>
      </div>`,
    );
  },

  refs: (f, v, ctx) => {
    const d = ctx.draft;
    const items = [...(d.imageUrls || []).map((u) => ["image", u]), ...(d.audioUrls || []).map((u) => ["audio", u]), ...(d.videoUrls || []).map((u) => ["video", u])];
    return wrap(
      f,
      `<div class="refs"><label class="drop drop-sm"><input type="file" accept="image/*,audio/*,video/*" multiple data-refs hidden /><span class="drop-ico">＋</span><span class="drop-text">Add images, a video or audio as inspiration</span><small>Up to 5 images · 1 video (≤241s) · audio 6s–30min</small></label>
        <div class="ref-list">${items.map(([type, u]) => refItem(type, u)).join("")}</div>
        <input type="hidden" data-f="imageUrls" data-type="json" value="${esc(JSON.stringify(d.imageUrls || []))}" />
        <input type="hidden" data-f="audioUrls" data-type="json" value="${esc(JSON.stringify(d.audioUrls || []))}" />
        <input type="hidden" data-f="videoUrls" data-type="json" value="${esc(JSON.stringify(d.videoUrls || []))}" /></div>`,
    );
  },

  range2: (f, v, ctx) => {
    const d = ctx.draft;
    return wrap(
      f,
      `<div class="range2"><label>From <input type="number" data-f="${f.a}" data-type="num" min="0" step="0.01" value="${esc(d[f.a] ?? "")}" placeholder="0.00" /> s</label>
       <label>To <input type="number" data-f="${f.b}" data-type="num" min="0" step="0.01" value="${esc(d[f.b] ?? "")}" placeholder="30.00" /> s</label></div>`,
    );
  },
};

export function refItem(type, url) {
  const ico = { image: "🖼", audio: "🎵", video: "🎬" }[type];
  const prev = type === "image" ? `<img src="${esc(url)}" alt="" />` : `<span class="ref-ico">${ico}</span>`;
  return `<div class="ref" data-ref-type="${type}" data-ref-url="${esc(url)}">${prev}<span class="ref-name">${esc(decodeURIComponent(url.split("/").pop()).slice(0, 40))}</span><button type="button" class="icon-btn sm" data-ref-remove aria-label="Remove">✕</button></div>`;
}

export function renderFields(fields, ctx) {
  return fields.map((f) => (f.t === "html" ? f.html : f.t === "row" ? `<div class="row">${renderFields(f.fields, ctx)}</div>` : R[f.t](f, ctx.draft[f.k], ctx))).join("");
}

// ---------- reading ----------

function readEl(el) {
  const type = el.dataset.type;
  if (el.type === "radio") return el.checked ? el.value : undefined;
  if (type === "bool") return el.checked;
  if (el.dataset.auto === "1") return undefined;
  const raw = el.value;
  if (type === "num") return raw === "" ? undefined : Number(raw);
  if (type === "json") {
    try {
      return JSON.parse(raw || "[]");
    } catch {
      return [];
    }
  }
  return raw;
}

export function readAll(form, { includeHidden = false } = {}) {
  const out = {};
  form.querySelectorAll("[data-f]").forEach((el) => {
    if (!includeHidden && el.closest("[data-when]")?.hidden) return;
    const v = readEl(el);
    if (v !== undefined) out[el.dataset.f] = v;
  });
  return out;
}

export function cleanPayload(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "" || v == null || (Array.isArray(v) && !v.length)) continue;
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  if (!out.personaId) delete out.personaModel;
  return out;
}

// Evaluates simple `key=value` / `key!=value` conditions (joined with &) against current values.
export function applyWhen(form) {
  const vals = readAll(form, { includeHidden: true });
  form.querySelectorAll("[data-when]").forEach((el) => {
    const ok = el.dataset.when.split("&").every((cond) => {
      const neg = cond.includes("!=");
      const [k, v] = cond.split(neg ? "!=" : "=");
      const cur = String(vals[k] ?? "");
      return neg ? cur !== v : cur === v;
    });
    el.hidden = !ok;
  });
}

export function updateCounters(form) {
  form.querySelectorAll("[data-counter]").forEach((c) => {
    const el = form.querySelector(`[data-f="${c.dataset.counter}"]`);
    if (!el) return;
    const max = +el.getAttribute("maxlength") || 0;
    c.textContent = max ? `${el.value.length}/${max}` : "";
    c.classList.toggle("warn", max && el.value.length > max * 0.9);
  });
}
