// Local persistence: everything lives in this browser only.

const read = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};

export const store = {
  jobs: read("ss.jobs", []),
  tracks: read("ss.tracks", {}),
  extras: read("ss.extras", {}),
  personas: read("ss.personas", []),
  draft: read("ss.draft", {}),

  save() {
    write("ss.jobs", this.jobs.slice(0, 300));
    write("ss.tracks", this.tracks);
    write("ss.extras", this.extras);
    write("ss.personas", this.personas);
  },
  saveDraft() {
    write("ss.draft", this.draft);
  },

  getKey() {
    return localStorage.getItem("ss.key") || sessionStorage.getItem("ss.key") || "";
  },
  setKey(k, remember) {
    this.clearKey();
    (remember ? localStorage : sessionStorage).setItem("ss.key", k);
  },
  clearKey() {
    localStorage.removeItem("ss.key");
    sessionStorage.removeItem("ss.key");
  },

  extra(trackId) {
    return (this.extras[trackId] ||= {});
  },

  upsertTracks(job, sunoData = []) {
    const ids = [];
    for (const d of sunoData) {
      if (!d || !d.id) continue;
      const prev = this.tracks[d.id] || {};
      this.tracks[d.id] = {
        ...prev,
        id: d.id,
        taskId: job.taskId,
        op: job.op,
        title: d.title || prev.title || "Untitled",
        tags: d.tags || prev.tags || "",
        lyrics: d.prompt || prev.lyrics || "",
        audioUrl: d.audio_url || d.source_audio_url || prev.audioUrl || "",
        streamUrl: d.stream_audio_url || d.source_stream_audio_url || prev.streamUrl || "",
        image: d.image_url || d.source_image_url || prev.image || "",
        duration: d.duration || prev.duration || 0,
        model: d.model_name || prev.model || job.model || "",
        createdAt: prev.createdAt || Date.now(),
        favorite: prev.favorite || false,
        instrumental: job.instrumental ?? prev.instrumental,
      };
      ids.push(d.id);
    }
    return ids;
  },

  trackList() {
    return Object.values(this.tracks).sort((a, b) => b.createdAt - a.createdAt);
  },
};
