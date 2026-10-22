import { DEFAULTS, normalizeSettings, allowedFrame } from "./settings.js";
import { VideoRenderer } from "./renderer.js";
import { EnhancementUI } from "./ui.js";

const storageKey = "animeEnhanceSettings";
const storage = typeof chrome !== "undefined" ? chrome.storage?.local : undefined;
const demo = location.hostname === "localhost" && document.documentElement.hasAttribute("data-ae-demo");
const allowed = demo || allowedFrame({ hostname: location.hostname, topFrame: window.top === window,
  ancestors: Array.from(location.ancestorOrigins || []), referrer: document.referrer });

function messageFor(error) {
  const text = error?.message || String(error);
  if (error?.name === "SecurityError" || /cross.origin|taint|origin.clean/i.test(text)) return "Плеер не разрешает обработку кадров этого видео";
  if (/WEBGPU|GPU_UNAVAILABLE|GPU_CONTEXT/.test(text)) return "WebGPU недоступен в этом браузере или устройстве";
  if (/VIDEO_NOT_READY/.test(text)) return "Запусти видео — обработка подключится после загрузки кадра";
  if (/RESOLUTION_LIMIT/.test(text)) return "Выбранное разрешение превышает предел видеокарты";
  if (/GPU_LOST/.test(text)) return "Соединение с видеокартой потеряно. Выключи и включи обработку";
  if (/FP16_UNAVAILABLE/.test(text)) return "Видеокарта не поддерживает FP16. Сними галочку в «Дополнительно»";
  return "Обработка недоступна. Исходное видео продолжает работать";
}

class VideoEnhancement {
  constructor(video, settings, save) {
    this.video = video;
    this.parent = video.parentElement;
    this.settings = settings;
    this.save = save;
    this.generation = 0;
    this.changedPosition = getComputedStyle(this.parent).position === "static";
    if (this.changedPosition) { this.oldPosition = this.parent.style.position; this.parent.style.position = "relative"; }
    this.ui = new EnhancementUI(this.parent, settings, update => this.save(update));
    this.layout = () => {
      this.ui.layout(this.video.offsetHeight);
      if (!this.canvas) return;
      const style = getComputedStyle(this.video);
      Object.assign(this.canvas.style, { left: `${this.video.offsetLeft}px`, top: `${this.video.offsetTop}px`,
        width: `${this.video.offsetWidth}px`, height: `${this.video.offsetHeight}px`,
        objectFit: style.objectFit, objectPosition: style.objectPosition, borderRadius: style.borderRadius });
      if (this.comparisonLabels) Object.assign(this.comparisonLabels.style, {
        left: `${this.video.offsetLeft}px`, top: `${this.video.offsetTop}px`, width: `${this.video.offsetWidth}px`, height: `${this.video.offsetHeight}px`
      });
    };
    this.restart = () => this.scheduleStart();
    this.clear = () => { this.stop(); if (this.settings.enabled) this.ui.status("loading", "Загружается видео…"); };
    for (const event of ["loadedmetadata", "loadeddata", "resize"]) video.addEventListener(event, this.restart);
    video.addEventListener("emptied", this.clear);
    this.resize = new ResizeObserver(this.layout);
    this.resize.observe(video);
    this.resize.observe(this.parent);
    this.visibility = () => this.layout();
    document.addEventListener("fullscreenchange", this.visibility);
    this.apply(settings);
  }

  apply(settings) {
    const rebuild = !this.renderer || settings.mode !== this.settings.mode || settings.precision !== this.settings.precision;
    this.settings = settings;
    this.ui.update(settings);
    this.updateComparison();
    if (!settings.enabled) { this.stop(); this.ui.status("off", "Обработка выключена"); return; }
    if (rebuild) this.scheduleStart();
    else this.renderer.update(settings);
  }

  scheduleStart() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.start(), 120);
  }

  async start() {
    if (!this.settings.enabled || !this.video.isConnected) return;
    if (this.renderer?.active && this.renderer.width === this.video.videoWidth && this.renderer.height === this.video.videoHeight && this.renderer.settings.mode === this.settings.mode && this.renderer.settings.precision === this.settings.precision) return;
    this.stop();
    if (this.video.readyState < 2 || !this.video.videoWidth) {
      this.ui.status("loading", "Запусти видео — ожидаю первый кадр");
      return;
    }
    const generation = ++this.generation;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.dataset.animeEnhance = "";
    this.canvas.hidden = true;
    Object.assign(this.canvas.style, { position: "absolute", zIndex: "0", pointerEvents: "none", background: "#000", visibility: "hidden" });
    this.video.after(this.canvas);
    this.comparisonLabels = document.createElement("div");
    this.comparisonLabels.setAttribute("aria-hidden", "true");
    Object.assign(this.comparisonLabels.style, { position: "absolute", pointerEvents: "none", zIndex: "1", display: "none" });
    for (const text of ["До", "После"]) {
      const label = document.createElement("span");
      label.textContent = text;
      Object.assign(label.style, { position: "absolute", top: "12px", padding: "4px 8px", borderRadius: "5px", background: "#0c151bc9", color: "#eaf7f4", font: "11px system-ui" });
      this.comparisonLabels.append(label);
    }
    this.canvas.after(this.comparisonLabels);
    this.layout();
    this.ui.status("loading", "Подготавливаю шейдеры…");
    const current = () => generation === this.generation && this.settings.enabled;
    this.renderer = new VideoRenderer(this.video, this.canvas, this.settings, {
      onFirstFrame: () => {
        if (!current()) return;
        this.canvas.hidden = false;
        this.canvas.style.visibility = "visible";
        this.updateComparison();
        this.ui.status("active", "Обработка включена");
      },
      onStats: stats => { if (current()) this.ui.stats(stats); },
      onError: error => { if (current()) this.showError(error); }
    });
    try { await this.renderer.initialize(); }
    catch (error) { if (current()) this.showError(error); }
  }

  showError(error) {
    this.stop();
    this.ui.status("error", messageFor(error), `${error?.name || "Error"}: ${error?.message || String(error)}`);
    console.info("[Anime Enhance]", error);
  }

  updateComparison() {
    if (!this.comparisonLabels) return;
    this.comparisonLabels.style.display = this.settings.compare && this.renderer?.firstFrame ? "block" : "none";
    const [before, after] = this.comparisonLabels.children;
    before.style.left = "12px";
    after.style.left = `calc(${this.settings.comparison === "side" ? 50 : this.settings.split}% + 12px)`;
    before.hidden = this.settings.comparison !== "side" && this.settings.split < 10;
    after.hidden = this.settings.comparison !== "side" && this.settings.split > 90;
  }

  stop() {
    clearTimeout(this.timer);
    this.generation++;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas?.remove();
    this.canvas = null;
    this.comparisonLabels?.remove();
    this.comparisonLabels = null;
  }

  destroy() {
    this.stop();
    for (const event of ["loadedmetadata", "loadeddata", "resize"]) this.video.removeEventListener(event, this.restart);
    this.video.removeEventListener("emptied", this.clear);
    document.removeEventListener("fullscreenchange", this.visibility);
    this.resize.disconnect();
    this.ui.destroy();
    if (this.changedPosition && this.parent.style.position === "relative") this.parent.style.position = this.oldPosition;
  }
}

if (allowed) {
  let settings = { ...DEFAULTS };
  let controller;
  let pending;
  let saveTimer;
  const apply = value => {
    settings = normalizeSettings(value);
    controller?.apply(settings);
  };
  const save = patch => {
    apply({ ...settings, ...patch });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { storage?.set({ [storageKey]: settings }).catch(() => {}); }, 150);
  };
  const selectVideo = () => {
    const videos = [...document.querySelectorAll("video")].filter(video => {
      const rect = video.getBoundingClientRect();
      return rect.width >= 160 && rect.height >= 90 && getComputedStyle(video).visibility !== "hidden" &&
        !video.closest(".creative-player, .vast-player, .preload-html");
    });
    return videos.find(video => video.classList.contains("zk_ar")) || videos.sort((a, b) =>
      b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height
    )[0];
  };
  const scan = () => {
    pending = null;
    const onWatchPage = /\/anime\/[^/]+\/watch\/?$/.test(location.pathname);
    const video = (demo || location.hostname !== "animelib.org" || onWatchPage) ? selectVideo() : undefined;
    if (controller?.video === video && video?.isConnected) return;
    controller?.destroy();
    controller = video ? new VideoEnhancement(video, settings, save) : null;
  };
  const scheduleScan = () => {
    if (pending) return;
    pending = setTimeout(scan, 250);
  };
  storage?.get(storageKey).then(result => { apply(result[storageKey]); scheduleScan(); }).catch(() => {});
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[storageKey]) apply(changes[storageKey].newValue);
    });
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.type === "ANIME_ENHANCE_OPEN") {
        if (!controller) return false;
        controller?.ui.open();
        respond({ found: Boolean(controller), state: controller?.ui.host.dataset.state });
      }
    });
  }
  new MutationObserver(scheduleScan).observe(document, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleScan);
  window.addEventListener("pagehide", () => controller?.destroy(), { once: true });
  if (demo) {
    // The local diagnostic fixture uses the same public UI and renderer.
    document.addEventListener("anime-enhance-demo-settings", event => save(event.detail));
  }
  scheduleScan();
}
