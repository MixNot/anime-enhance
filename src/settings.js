export const MODES = Object.freeze({
  soft: { title: "Anime4K · мягкий", scale: 1, hint: "Восстановление контуров в исходном разрешении" },
  fast: { title: "Anime4K · ×2 быстрый", scale: 2, hint: "Увеличение ×2 одной моделью, без отдельного восстановления" },
  anime: { title: "Anime4K · ×2", scale: 2, hint: "Восстановление изображения и увеличение вдвое" },
  hq: { title: "Anime4K · ×2 HQ", scale: 2, hint: "Более крупные модели; выше нагрузка на видеокарту" }
});

export const DEFAULTS = Object.freeze({ enabled: false, mode: "anime", strength: 100, compare: false, comparison: "wipe", split: 50, precision: "f32" });

export function normalizeSettings(value = {}) {
  if (!value || typeof value !== "object") value = {};
  const number = (v, fallback) => Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
    mode: value.mode === "sharp" ? "soft" : Object.hasOwn(MODES, value.mode) ? value.mode : DEFAULTS.mode,
    strength: number(value.strength, DEFAULTS.strength),
    compare: typeof value.compare === "boolean" ? value.compare : DEFAULTS.compare,
    comparison: value.comparison === "side" ? "side" : "wipe",
    split: number(value.split, DEFAULTS.split),
    precision: value.precision === "f16" ? "f16" : "f32"
  };
}

export function allowedFrame({ hostname, topFrame, ancestors = [], referrer = "" }) {
  if (hostname === "animelib.org") return true;
  if (hostname !== "kodikplayer.com" && !hostname.endsWith(".kodikplayer.com")) return false;
  if (topFrame) return false;
  return [...ancestors, referrer].some(origin => {
    try { return new URL(origin).hostname === "animelib.org"; } catch { return false; }
  });
}

export function outputSize(width, height, mode, limit) {
  const scale = MODES[mode]?.scale ?? 1;
  const size = [width * scale, height * scale];
  if (!width || !height) throw new Error("VIDEO_NOT_READY");
  if (Math.max(...size) > limit) throw new Error("RESOLUTION_LIMIT");
  // Deliberately never reduce the user's selected output resolution.
  return size;
}
