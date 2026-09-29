// Turns SunoAPI MIDI note data into a Standard MIDI File (format 1) Blob.

const PPQ = 480;
const BPM = 120;
const secToTicks = (s) => Math.max(0, Math.round((s * BPM * PPQ) / 60));

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function chunk(type, data) {
  const len = data.length;
  return [...type].map((c) => c.charCodeAt(0)).concat([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255], data);
}

function textEvent(kind, str) {
  const bytes = Array.from(new TextEncoder().encode(str.slice(0, 120)));
  return [0, 0xff, kind, ...vlq(bytes.length), ...bytes];
}

export function midiBlob(instruments = []) {
  const tempo = Math.round(60000000 / BPM);
  const tracks = [
    chunk("MTrk", [...textEvent(3, "Suno Studio"), 0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0, 0xff, 0x2f, 0]),
  ];
  let melodic = 0;
  instruments.forEach((inst) => {
    const drums = /drum|percussion|kit/i.test(inst.name || "");
    let ch = 9;
    if (!drums) {
      ch = melodic % 15;
      if (ch >= 9) ch += 1;
      melodic++;
    }
    const events = [];
    for (const n of inst.notes || []) {
      const pitch = Math.min(127, Math.max(0, Math.round(n.pitch)));
      const v = n.velocity ?? 1;
      const vel = Math.min(127, Math.max(1, Math.round(v <= 1 ? 40 + v * 87 : v)));
      const on = secToTicks(n.start);
      const off = Math.max(on + 1, secToTicks(n.end));
      events.push([on, 1, [0x90 | ch, pitch, vel]], [off, 0, [0x80 | ch, pitch, 0]]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const data = [...textEvent(3, inst.name || "Instrument")];
    let last = 0;
    for (const [t, , bytes] of events) {
      data.push(...vlq(t - last), ...bytes);
      last = t;
    }
    data.push(0, 0xff, 0x2f, 0);
    tracks.push(chunk("MTrk", data));
  });
  const header = chunk("MThd", [0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (PPQ >> 8) & 255, PPQ & 255]);
  return new Blob([new Uint8Array(header.concat(...tracks))], { type: "audio/midi" });
}
