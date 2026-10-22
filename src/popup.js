import { DEFAULTS, MODES, normalizeSettings } from "./settings.js";

const key = "animeEnhanceSettings";
let settings = { ...DEFAULTS };
const $ = selector => document.querySelector(selector);
$("#mode").innerHTML = Object.entries(MODES).map(([id, mode]) => `<option value="${id}">${mode.title}</option>`).join("");
function render() {
  $("#enabled").checked = settings.enabled;
  $("#mode").value = settings.mode;
  $("#gpu").textContent = navigator.gpu ? "WebGPU доступен браузеру" : "В этом браузере WebGPU недоступен";
}
async function change(patch) {
  settings = normalizeSettings({ ...settings, ...patch });
  await chrome.storage.local.set({ [key]: settings });
  render();
}
$("#enabled").addEventListener("change", event => change({ enabled: event.target.checked }));
$("#mode").addEventListener("change", event => change({ mode: event.target.value }));
$("#open").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "ANIME_ENHANCE_OPEN" });
    if (response?.found) window.close();
    else $("#note").textContent = "Открой серию на AnimeLib и запусти видео. Кнопка настроек появится в плеере.";
  } catch {
    $("#note").textContent = "Открой серию на AnimeLib. После установки расширения перезагрузи вкладку сайта.";
  }
});
chrome.storage.local.get(key).then(result => { settings = normalizeSettings(result[key]); render(); });
render();
