import { CNNM, CNNSoftM, CNNVL, CNNx2M, CNNx2VL, PipelineChain, ClampHighlights } from "anime4k-webgpu-async";
import { compilePlan, modelDevice } from "./gpu-plan.js";
import { outputSize } from "./settings.js";

const COMPOSITE = /* wgsl */`
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let p = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var out: VertexOutput;
  out.position = vec4f(p[index], 0, 1);
  out.uv = vec2f((p[index].x + 1) * 0.5, (1 - p[index].y) * 0.5);
  return out;
}
struct Params { strength: f32, split: f32, comparison: f32, width: f32 }
@group(0) @binding(0) var imageSampler: sampler;
@group(0) @binding(1) var original: texture_2d<f32>;
@group(0) @binding(2) var enhanced: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: Params;
@fragment fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  var sampleUV = uv;
  var before = params.split >= 0.0 && uv.x < params.split;
  var divider = params.split;
  if (params.comparison > 0.5) {
    sampleUV = vec2f(fract(uv.x * 2.0), (uv.y - 0.25) * 2.0);
    if (sampleUV.y < 0.0 || sampleUV.y > 1.0) { return vec4f(0.025, 0.035, 0.04, 1); }
    before = uv.x < 0.5;
    divider = 0.5;
  }
  let source = textureSampleLevel(original, imageSampler, sampleUV, 0).rgb;
  if (before) { return vec4f(source, 1); }
  let processed = textureSampleLevel(enhanced, imageSampler, sampleUV, 0).rgb;
  if (divider >= 0.0 && abs(uv.x - divider) < 1.0 / params.width) { return vec4f(0.47, 0.9, 0.81, 1); }
  return vec4f(clamp(mix(source, processed, params.strength), vec3f(0), vec3f(1)), 1);
}`;

export class VideoRenderer {
  constructor(video, canvas, settings, { onStats, onError, onFirstFrame }) {
    Object.assign(this, { video, canvas, settings, onStats, onError, onFirstFrame });
    this.disposed = false;
    this.busy = false;
    this.active = false;
    this.firstFrame = false;
    this.frames = 0;
    this.skipped = 0;
    this.pendingFrame = false;
    this.totalMs = 0;
    this.paramData = new Float32Array(4);
    this.needsComposite = false;
    this.sourceVersion = 0;
    this.statsStart = performance.now();
    this.refresh = () => {
      if (!this.active || document.hidden) return;
      if (this.video.paused && this.lastStats) this.onStats({ ...this.lastStats, paused: true });
      this.draw().catch(error => this.fail(error));
    };
    this.seek = () => { this.sourceVersion++; this.refresh(); };
    this.resume = () => { this.frames = this.totalMs = this.skipped = 0; this.statsStart = performance.now(); this.refresh(); };
    this.visibility = () => { if (!document.hidden) this.resume(); };
  }

  async initialize() {
    if (!navigator.gpu) throw new Error("WEBGPU_UNAVAILABLE");
    if (this.video.readyState < 2 || !this.video.videoWidth) throw new Error("VIDEO_NOT_READY");

    // Test access without touching src, playback state, or request headers.
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const context2D = probe.getContext("2d", { willReadFrequently: true });
    context2D.drawImage(this.video, 0, 0, 1, 1);
    context2D.getImageData(0, 0, 1, 1);

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("GPU_UNAVAILABLE");
    if (this.disposed) return;
    if (this.settings.precision === "f16" && !adapter.features.has("shader-f16")) throw new Error("FP16_UNAVAILABLE");
    this.device = await adapter.requestDevice({ requiredFeatures: this.settings.precision === "f16" ? ["shader-f16"] : [] });
    if (this.disposed) { this.device.destroy(); return; }
    this.device.lost.then(info => {
      if (!this.disposed) this.fail(new Error(`GPU_LOST: ${info.message}`));
    });
    this.device.addEventListener("uncapturederror", event => {
      if (!this.disposed) this.fail(event.error);
    });

    const device = this.device;
    this.width = this.video.videoWidth;
    this.height = this.video.videoHeight;
    const [width, height] = outputSize(this.width, this.height, this.settings.mode, device.limits.maxTextureDimension2D);
    this.canvas.width = width;
    this.canvas.height = height;
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) throw new Error("GPU_CONTEXT_UNAVAILABLE");
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format, alphaMode: "opaque", colorSpace: "srgb" });
    device.pushErrorScope("validation");
    this.input = device.createTexture({
      label: "Anime Enhance: decoded frame",
      size: [this.width, this.height], format: "rgba16float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.chain = new PipelineChain({ device: modelDevice(device, this.settings.precision === "f16"), inputTexture: this.input });
    {
      this.chain.add(ClampHighlights);
      if (this.settings.mode !== "fast") this.chain.add(this.settings.mode === "soft" ? CNNSoftM : this.settings.mode === "hq" ? CNNVL : CNNM);
      if (this.settings.mode !== "soft") {
        this.chain.add(this.settings.mode === "hq" ? CNNx2VL : CNNx2M);
      }
    }
    const shader = device.createShaderModule({ label: "Anime Enhance: compare and blend", code: COMPOSITE });
    this.pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vertexMain" },
      fragment: { module: shader, entryPoint: "fragmentMain", targets: [{ format }] },
      primitive: { topology: "triangle-list" }
    });
    if (this.disposed) return;
    this.params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.input.createView() },
        { binding: 2, resource: this.chain.getOutputTexture().createView() },
        { binding: 3, resource: { buffer: this.params } }
      ]
    });
    // Compile all model passes before replacing the visible original frame.
    this.record = await compilePlan(this.chain);
    const error = await device.popErrorScope();
    if (error) throw error;
    if (this.disposed) return;
    this.active = true;
    this.statsStart = performance.now();
    for (const event of ["seeked", "loadeddata"]) this.video.addEventListener(event, this.seek);
    this.video.addEventListener("pause", this.refresh);
    this.video.addEventListener("play", this.resume);
    document.addEventListener("visibilitychange", this.visibility);
    await this.draw();
    this.schedule();
  }

  update(settings) {
    this.settings = settings;
    this.needsComposite = true;
    this.refresh();
  }

  schedule() {
    if (!this.active || this.disposed) return;
    if (this.video.requestVideoFrameCallback) {
      this.callback = this.video.requestVideoFrameCallback(() => {
        this.sourceVersion++;
        this.schedule();
        if (document.hidden) return;
        this.draw().catch(error => this.fail(error));
      });
    } else {
      this.callback = requestAnimationFrame(() => {
        this.schedule();
        if (!document.hidden && !this.video.paused && this.lastTime !== this.video.currentTime) {
          this.lastTime = this.video.currentTime;
          this.sourceVersion++;
          this.draw().catch(error => this.fail(error));
        }
      });
    }
  }

  async draw() {
    if (this.disposed || !this.active || this.video.readyState < 2) return;
    if (this.busy) { if (this.pendingFrame) this.skipped++; this.pendingFrame = true; return; }
    if (this.width !== this.video.videoWidth || this.height !== this.video.videoHeight) return;
    const newFrame = !this.firstFrame || this.renderedVersion !== this.sourceVersion;
    if (!newFrame && !this.needsComposite) return;
    this.busy = true;
    this.pendingFrame = false;
    this.needsComposite = false;
    this.renderedVersion = this.sourceVersion;
    const start = performance.now();
    try {
      const { device, settings } = this;
      this.paramData.set([settings.strength / 100, settings.compare ? settings.split / 100 : -1,
        settings.compare && settings.comparison === "side" ? 1 : 0, this.canvas.width]);
      device.queue.writeBuffer(this.params, 0, this.paramData);
      const encoder = device.createCommandEncoder();
      if (newFrame) {
        device.queue.copyExternalImageToTexture({ source: this.video }, { texture: this.input }, [this.width, this.height]);
        this.record(encoder);
      }
      if (this.disposed) return;
      const pass = encoder.beginRenderPass({ colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store"
      }] });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      if (this.disposed) return;
      if (!this.firstFrame) {
        this.firstFrame = true;
        this.onFirstFrame();
        this.statsStart = performance.now();
      } else if (newFrame) { this.frames++; this.totalMs += performance.now() - start; }
      const elapsed = performance.now() - this.statsStart;
      if (elapsed >= 1000 && this.frames) {
        this.lastStats = { fps: Math.round(this.frames * 1000 / elapsed), ms: Math.round(this.totalMs / this.frames), precision: this.settings.precision, paused: this.video.paused, skipped: this.skipped, input: [this.width, this.height], output: [this.canvas.width, this.canvas.height] };
        this.onStats(this.lastStats);
        this.frames = this.skipped = this.totalMs = 0;
        this.statsStart = performance.now();
      }
    } finally {
      this.busy = false;
      // Keep only the newest waiting frame. Drain immediately instead of
      // losing another whole video interval after the GPU becomes available.
      if (this.pendingFrame && !this.disposed && !document.hidden) {
        this.pendingFrame = false;
        queueMicrotask(() => this.refresh());
      }
    }
  }

  fail(error) {
    if (this.disposed) return;
    this.dispose();
    this.onError(error);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    if (this.callback !== undefined) {
      if (this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.callback);
      else cancelAnimationFrame(this.callback);
    }
    for (const event of ["seeked", "loadeddata"]) this.video.removeEventListener(event, this.seek);
    this.video.removeEventListener("pause", this.refresh);
    this.video.removeEventListener("play", this.resume);
    document.removeEventListener("visibilitychange", this.visibility);
    this.canvas.hidden = true;
    this.canvas.style.visibility = "hidden";
    this.context?.unconfigure();
    this.device?.destroy();
  }
}
