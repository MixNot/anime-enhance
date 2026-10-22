import { MODES } from "./settings.js";

const STYLE = `
:host{all:initial;position:absolute;top:12px;right:12px;z-index:1500;pointer-events:none;color:#eff9f8;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-synthesis:none;cursor:auto}
*{box-sizing:border-box}button,input,select{font:inherit}button,select,input{pointer-events:auto}button{cursor:pointer}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #70e4cf;outline-offset:3px}
.pill{display:flex;align-items:center;gap:8px;height:34px;margin-left:auto;padding:0 11px;color:#f0fbf9;background:#111c22ed;border:1px solid #ffffff24;border-radius:10px;box-shadow:0 3px 15px #0003;backdrop-filter:blur(16px);font-size:12px;font-weight:600}
.pill svg{color:#77e5d0}.badge{font-size:10px;font-weight:700;letter-spacing:.03em;color:#95a9ac;border-left:1px solid #ffffff20;padding-left:8px}.pill[data-active=true] .badge{color:#83ecd4}
.panel{pointer-events:auto;width:310px;max-width:calc(100vw - 36px);margin-top:8px;background:#0c151bf5;border:1px solid #ffffff21;border-radius:16px;box-shadow:0 18px 60px #0007;backdrop-filter:blur(22px);padding:18px;color:#ebf5f4}
[hidden]{display:none!important}.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.wordmark{font-size:17px;font-weight:700;letter-spacing:-.6px}.wordmark span{color:#78e6ce}.close{background:none;border:0;color:#8aa0a4;font-size:22px;padding:0 2px;line-height:1}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px}.toggle-row{padding-bottom:16px;border-bottom:1px solid #ffffff12;margin-bottom:15px}.switch{width:38px;height:22px;padding:3px;border:0;border-radius:20px;background:#334249;transition:background .15s}.switch:before{content:"";display:block;width:16px;height:16px;background:#cad4d4;border-radius:100%;transition:transform .15s}.switch[aria-checked=true]{background:#78e6ce}.switch[aria-checked=true]:before{transform:translateX(16px);background:#112e2a}
label{display:block;color:#a6b8bb;font-size:11px;font-weight:600}.select-wrap{position:relative}.select-wrap:after{content:"";position:absolute;right:13px;top:21px;width:7px;height:7px;border-right:1.5px solid #c3d8d4;border-bottom:1.5px solid #c3d8d4;transform:rotate(45deg);pointer-events:none}.select{appearance:none;width:100%;margin-top:7px;padding:10px 34px 10px 10px;border:1px solid #ffffff1b;border-radius:9px;background:#19262d;color:#eaf7f4;color-scheme:dark}.hint{min-height:31px;font-size:11px;color:#81979c;margin-top:7px;line-height:1.45}
.range-label{display:flex;justify-content:space-between;margin-top:14px}.value{color:#b1cec8;font-size:11px;font-variant-numeric:tabular-nums}input[type=range]{accent-color:#79e6d0;width:100%;height:20px;margin:5px 0 0}.compare-row{margin-top:14px;padding-top:14px;border-top:1px solid #ffffff12}.check{display:flex;align-items:center;gap:8px;color:#d5e4e3;font-size:12px;font-weight:400}.check input{accent-color:#79e6d0;margin:0}.split-label{display:flex;justify-content:space-between;color:#80979c;font-size:10px;margin-top:7px}
.status{margin-top:16px;padding:10px;border-radius:9px;background:#ffffff06;border:1px solid #ffffff0b;font-size:11px;color:#97b0b2}.status[data-state=active]{border-color:#77e6ce24;color:#a5e2d4}.status[data-state=error]{color:#efbfaa;border-color:#efbfaa24}.stats{display:block;margin-top:4px;font-variant-numeric:tabular-nums;font-size:10px;color:#77959a}.chart{margin-top:9px}.chart-head{display:flex;justify-content:space-between;font-size:9px;color:#7e9ca1}.chart svg{display:block;width:100%;height:42px;margin-top:3px;overflow:hidden}.chart path{fill:none;stroke:#79e6d0;stroke-width:1.3;vector-effect:non-scaling-stroke}.chart line{stroke:#ffffff10;stroke-width:1}.advanced{margin-top:12px}.advanced summary{cursor:pointer;font-size:10px;color:#8da5aa}.advanced .check{margin-top:9px;font-size:11px}.advanced p{font-size:10px;color:#7e969c;margin:5px 0 0}.comparison-controls{margin-top:8px}.diag{font-size:10px;color:#738c92;margin-top:8px}.diag summary{cursor:pointer}.diag pre{max-height:90px;overflow:auto;white-space:pre-wrap;word-break:break-word}
@media(max-width:500px){:host{top:8px;right:8px}.panel{width:280px;padding:14px}.pill{height:30px}}
:host([data-compact]) .panel{padding:12px}:host([data-compact]) .top{margin-bottom:8px}:host([data-compact]) .toggle-row{padding-bottom:8px;margin-bottom:8px}:host([data-compact]) .hint{min-height:0;margin-top:5px;font-size:10px}:host([data-compact]) .range-label{margin-top:8px}:host([data-compact]) .compare-row{margin-top:8px;padding-top:8px}:host([data-compact]) .status{margin-top:8px;padding:8px}:host([data-compact]) .chart svg{height:28px}:host([data-compact]) .advanced{margin-top:8px}:host([data-compact]) .select{padding-top:8px;padding-bottom:8px}:host([data-compact]) .select-wrap:after{top:19px}
`;

export class EnhancementUI {
  constructor(parent, settings, onChange) {
    this.onChange = onChange;
    this.history = [];
    this.host = document.createElement("anime-enhance-ui");
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style>
      <button class="pill" aria-expanded="false" title="Настройки улучшения изображения">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z" stroke="currentColor" stroke-width="1.6"/></svg>
        Изображение <span class="badge">ВЫКЛ</span>
      </button>
      <section class="panel" hidden aria-label="Anime Enhance — настройки изображения">
        <div class="top"><div><div class="wordmark">Anime <span>Enhance</span></div></div><button class="close" aria-label="Закрыть настройки">×</button></div>
        <div class="row toggle-row"><span>Улучшение изображения</span><button class="switch" role="switch" aria-label="Улучшение изображения" aria-checked="false"></button></div>
        <label for="mode">Режим обработки</label><div class="select-wrap"><select class="select" id="mode">${Object.entries(MODES).map(([id, mode]) => `<option value="${id}">${mode.title}</option>`).join("")}</select></div>
        <div class="hint"></div>
        <div class="range-label"><label for="strength">Сила обработки</label><span class="value" id="strengthValue"></span></div>
        <input id="strength" type="range" min="0" max="100" step="5" aria-label="Сила обработки">
        <div class="compare-row"><label class="check"><input id="compare" type="checkbox">До / после</label></div>
        <div class="comparison-controls" hidden><label for="comparison">Вид сравнения</label><div class="select-wrap"><select class="select" id="comparison"><option value="wipe">Подвижная граница</option><option value="side">Два кадра рядом</option></select></div></div><div class="split" hidden><div class="split-label"><span>Оригинал слева</span><span>Обработка справа</span></div><input id="split" type="range" min="0" max="100" step="1" aria-label="Граница сравнения"></div>
        <div class="status" role="status" data-state="off"><span class="message">Обработка выключена</span><span class="stats"></span><div class="chart" hidden><div class="chart-head"><span>Время кадра · мс</span><span class="chart-scale"></span></div><svg viewBox="0 0 268 42" role="img" aria-label="Время обработки: последние 60 замеров"><line x1="0" y1="40" x2="268" y2="40"/><line x1="0" y1="20" x2="268" y2="20"/><path/></svg></div></div>
        <details class="advanced"><summary>Дополнительно</summary><label class="check"><input id="fp16" type="checkbox">Вычисления FP16</label><p>Меньше точность вычислений, те же модели и разрешение. Требуется поддержка видеокарты.</p></details>
        <details class="diag" hidden><summary>Технические сведения</summary><pre></pre></details>
      </section>`;
    this.$ = selector => this.root.querySelector(selector);
    this.$(".pill").addEventListener("click", () => this.open(this.$(".panel").hidden));
    this.$(".close").addEventListener("click", () => this.open(false));
    this.$(".switch").addEventListener("click", () => onChange({ enabled: !this.settings.enabled }));
    this.$("#mode").addEventListener("change", event => onChange({ mode: event.target.value }));
    this.$("#strength").addEventListener("input", event => onChange({ strength: Number(event.target.value) }));
    this.$("#compare").addEventListener("change", event => onChange({ compare: event.target.checked }));
    this.$("#comparison").addEventListener("change", event => onChange({ comparison: event.target.value }));
    this.$("#fp16").addEventListener("change", event => onChange({ precision: event.target.checked ? "f16" : "f32" }));
    this.$("#split").addEventListener("input", event => onChange({ split: Number(event.target.value) }));
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "keydown", "keyup", "wheel"]) {
      this.host.addEventListener(type, event => {
        event.stopPropagation();
        if (type === "keydown" && event.key === "Escape") this.open(false);
      });
    }
    parent.append(this.host);
    this.update(settings);
  }

  open(value = true) {
    this.$(".panel").hidden = !value;
    this.$(".pill").setAttribute("aria-expanded", String(value));
    if (value) this.drawChart();
  }

  layout(height) {
    this.host.toggleAttribute("data-compact", height < 600);
    this.$(".panel").style.maxHeight = `${Math.max(150, height - 66)}px`;
    this.$(".panel").style.overflowY = "auto";
    this.$(".panel").style.scrollbarWidth = "thin";
  }

  update(settings) {
    this.settings = settings;
    this.$(".switch").setAttribute("aria-checked", String(settings.enabled));
    this.$("#mode").value = settings.mode;
    this.$(".hint").textContent = MODES[settings.mode].hint;
    this.$("#strength").value = settings.strength;
    this.$("#strengthValue").textContent = `${settings.strength}%`;
    this.$("#compare").checked = settings.compare;
    this.$(".comparison-controls").hidden = !settings.compare;
    this.$("#comparison").value = settings.comparison;
    this.$(".split").hidden = !settings.compare || settings.comparison === "side";
    this.$("#fp16").checked = settings.precision === "f16";
    this.$("#split").value = settings.split;
  }

  status(state, message, detail = "") {
    this.host.dataset.state = state;
    this.$(".status").dataset.state = state;
    this.$(".message").textContent = message;
    this.$(".pill").dataset.active = String(state === "active");
    this.$(".badge").textContent = state === "active" ? (MODES[this.settings.mode].scale === 2 ? "×2" : "ВКЛ") : state === "loading" ? "…" : state === "error" ? "!" : "ВЫКЛ";
    this.$(".diag").hidden = !detail;
    this.$(".diag pre").textContent = detail;
    if (state !== "active") { this.$(".stats").textContent = ""; this.history = []; this.$(".chart").hidden = true; }
  }

  stats({ fps, ms, skipped, input, output, precision = "f32", paused = false }) {
    this.$(".stats").textContent = `${input.join("×")} → ${output.join("×")} · ${paused ? "пауза" : `${fps} кадр/с`} · ${ms} мс · ${precision === "f16" ? "FP16" : "FP32"}${skipped > 2 ? " · высокая нагрузка" : ""}`;
    this.$(".stats").title = "Среднее время обработки кадра за интервал, включая отправку и ожидание GPU";
    if (!paused) { this.history.push(ms); if (this.history.length > 60) this.history.shift(); }
    if (!this.$(".panel").hidden) this.drawChart();
  }

  drawChart() {
    this.$(".chart").hidden = !this.history.length;
    if (!this.history.length) return;
    const max = Math.max(50, ...this.history) * 1.1;
    const points = this.history.map((ms, i) => `${i ? "L" : "M"}${(i * 268 / 59).toFixed(1)},${(40 - Math.min(ms / max, 1) * 38).toFixed(1)}`).join(" ");
    this.$(".chart path").setAttribute("d", points);
    this.$(".chart-scale").textContent = `0–${Math.ceil(max)} · 60 замеров`;
  }

  destroy() { this.host.remove(); }
}
