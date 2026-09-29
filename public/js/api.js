// Thin client for SunoAPI (https://docs.sunoapi.org).
// Requests go through the Netlify proxy (/suno-api, /suno-upload) when available,
// falling back to calling the API hosts directly.

const DIRECT = { api: "https://api.sunoapi.org", upload: "https://sunoapiorg.redpandaai.co" };
const PROXY = { api: "/suno-api", upload: "/suno-upload" };

const ERRORS = {
  400: "Some parameters were invalid.",
  401: "Your API key was rejected. Double-check it and try again.",
  402: "Not enough credits for this operation.",
  404: "That endpoint or task could not be found.",
  405: "Rate limit reached. Give it a moment.",
  409: "This resource already exists.",
  413: "The prompt or lyrics are too long for this model.",
  422: "The request could not be processed.",
  429: "You're out of credits. Top up at sunoapi.org.",
  430: "Too many requests too quickly. Slow down a little.",
  451: "Could not fetch the source file.",
  455: "SunoAPI is under maintenance. Try again shortly.",
  500: "SunoAPI had an internal error. Try again.",
};

export class ApiError extends Error {
  constructor(code, msg) {
    super(msg || ERRORS[code] || `Request failed (${code})`);
    this.code = code;
  }
}

let key = "";
let mode = localStorage.getItem("ss.conn") || (location.protocol.startsWith("http") ? "proxy" : "direct");

export const setKey = (k) => (key = k);
export const getMode = () => mode;
export const setMode = (m) => {
  mode = m;
  localStorage.setItem("ss.conn", m);
};

export function callbackUrl() {
  const local = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
  return location.protocol === "https:" && !local
    ? `${location.origin}/.netlify/functions/suno-callback`
    : "https://example.com/suno-callback";
}

async function request(path, { method = "GET", body, query, base = "api", raw = false, form } = {}, retried = false) {
  const root = (mode === "proxy" ? PROXY : DIRECT)[base];
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const headers = { Authorization: `Bearer ${key}` };
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(root + path + qs, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch (e) {
    if (mode === "direct" && !retried && location.protocol.startsWith("http")) {
      setMode("proxy");
      return request(path, { method, body, query, base, raw, form }, true);
    }
    throw new ApiError(0, "Network error — could not reach SunoAPI.");
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // The proxy path isn't there (e.g. running locally without `netlify dev`): go direct.
    if (mode === "proxy" && !retried) {
      setMode("direct");
      return request(path, { method, body, query, base, raw, form }, true);
    }
    throw new ApiError(res.status, ERRORS[res.status] || `Unexpected response (${res.status})`);
  }
  if (raw) return json;
  const code = json.code ?? res.status;
  if (code !== 200) throw new ApiError(code, friendly(code, json.msg));
  return json.data;
}

function friendly(code, msg) {
  if (msg && !/^(success|error)$/i.test(msg)) return ERRORS[code] ? `${ERRORS[code]} (${msg})` : msg;
  return ERRORS[code];
}

const post = (path, body) => request(path, { method: "POST", body: { callBackUrl: callbackUrl(), ...body } });
const get = (path, query) => request(path, { query });

export const api = {
  credits: () => get("/api/v1/generate/credit"),

  // Music creation
  generate: (b) => post("/api/v1/generate", b),
  extend: (b) => post("/api/v1/generate/extend", b),
  uploadCover: (b) => post("/api/v1/generate/upload-cover", b),
  uploadExtend: (b) => post("/api/v1/generate/upload-extend", b),
  addInstrumental: (b) => post("/api/v1/generate/add-instrumental", b),
  addVocals: (b) => post("/api/v1/generate/add-vocals", b),
  mashup: (b) => post("/api/v1/generate/mashup", b),
  replaceSection: (b) => post("/api/v1/generate/replace-section", b),
  sounds: (b) => post("/api/v1/generate/sounds", b),
  musicInfo: (taskId) => get("/api/v1/generate/record-info", { taskId }),

  // Writing helpers
  lyrics: (prompt) => post("/api/v1/lyrics", { prompt }),
  lyricsInfo: (taskId) => get("/api/v1/lyrics/record-info", { taskId }),
  boostStyle: (content) => request("/api/v1/style/generate", { method: "POST", body: { content } }),
  timestampedLyrics: (taskId, audioId) =>
    request("/api/v1/generate/get-timestamped-lyrics", { method: "POST", body: { taskId, audioId } }),

  // Track tools
  wav: (taskId, audioId) => post("/api/v1/wav/generate", { taskId, audioId }),
  wavInfo: (taskId) => get("/api/v1/wav/record-info", { taskId }),
  stems: (b) => post("/api/v1/vocal-removal/generate", b),
  stemsInfo: (taskId) => get("/api/v1/vocal-removal/record-info", { taskId }),
  midi: (b) => post("/api/v1/midi/generate", b),
  midiInfo: (taskId) => get("/api/v1/midi/record-info", { taskId }),
  video: (b) => post("/api/v1/mp4/generate", b),
  videoInfo: (taskId) => get("/api/v1/mp4/record-info", { taskId }),
  art: (taskId) => post("/api/v1/suno/cover/generate", { taskId }),
  artInfo: (taskId) => get("/api/v1/suno/cover/record-info", { taskId }),
  persona: (b) => request("/api/v1/generate/generate-persona", { method: "POST", body: b }),
  recover: (sunoTaskId) => post("/api/v1/suno/recovery", { sunoTaskId }),
  recoverInfo: (task_id) => request("/api/v1/suno/recovery/record-info", { query: { task_id }, raw: true }),

  // Files (temporary, deleted after 3 days)
  async upload(file) {
    const form = new FormData();
    form.append("file", file);
    form.append("uploadPath", "suno-studio");
    form.append("fileName", `${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`);
    const data = await request("/api/file-stream-upload", { method: "POST", base: "upload", form });
    return data.downloadUrl || data.fileUrl;
  },
};
