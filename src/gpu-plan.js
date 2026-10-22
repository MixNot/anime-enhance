import { recordPipelineList } from "anime4k-webgpu-async";

// Resolve the library's async pipelines once. Reuse the exact commands, bindings
// and dispatch sizes; GPUCommandBuffers themselves are never reused.
export async function compilePlan(chain) {
  const commands = [];
  const makePass = () => Object.fromEntries(["setPipeline", "setBindGroup", "dispatchWorkgroups", "draw", "end"]
    .map(name => [name, (...args) => commands.push([name, args])]));
  await recordPipelineList({
    beginComputePass: descriptor => { commands.push(["beginComputePass", [descriptor]]); return makePass(); },
    beginRenderPass: descriptor => { commands.push(["beginRenderPass", [descriptor]]); return makePass(); }
  }, [chain]);
  return encoder => {
    let pass;
    for (const [name, args] of commands) {
      if (name === "beginComputePass" || name === "beginRenderPass") pass = encoder[name](...args);
      else pass[name](...args);
    }
  };
}

function mapCalls(code, name, transform) {
  let result = "", cursor = 0;
  const pattern = new RegExp(`\\b${name}\\(`, "g");
  for (let match; (match = pattern.exec(code));) {
    let end = pattern.lastIndex, depth = 1;
    while (depth && end < code.length) {
      if (code[end] === "(") depth++;
      if (code[end] === ")") depth--;
      end++;
    }
    result += code.slice(cursor, match.index) + transform(code.slice(match.index, end));
    cursor = pattern.lastIndex = end;
  }
  return result + code.slice(cursor);
}

// Only CNN arithmetic is converted. Texture interfaces, geometry, clamp stages
// and composition stay FP32. This is an explicit, optional user setting.
export function cnnToF16(code) {
  if (!code.includes("// Layer: Anime4K") || !code.includes("var result: vec4f")) return code;
  code = code.replace(/\bvec4f\b/g, "vec4h").replace(/mat4x4<f32>/g, "mat4x4<f16>").replace(/value: f32/g, "value: f16");
  code = mapCalls(code, "textureLoad", call => `vec4h(${call})`);
  code = code.replace(/textureStore\(([^;]+), result\);/g, "textureStore($1, vec4f(result));");
  return `enable f16;\n${code}`;
}

export function modelDevice(device, fp16) {
  if (!fp16) return device;
  // This wrapper belongs only to our pipeline constructors; no page APIs change.
  return new Proxy(device, { get(target, key) {
    if (key === "createShaderModule") return descriptor => target.createShaderModule({ ...descriptor, code: cnnToF16(descriptor.code) });
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
