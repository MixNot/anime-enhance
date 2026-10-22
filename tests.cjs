const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const settings = () => import('./src/settings.js');
const output = process.env.ANIME_ENHANCE_OUTPUT ? path.resolve(process.env.ANIME_ENHANCE_OUTPUT) : path.resolve(__dirname,'extension');
const compiled = () => fs.readFileSync(path.join(output,'content.js'),'utf8');

test('settings accept only known profiles and preserve the manual HQ choice', async () => {
  const {normalizeSettings,DEFAULTS}=await settings();
  assert.deepEqual(normalizeSettings(null),DEFAULTS);
  assert.equal(normalizeSettings({mode:'hq'}).mode,'hq');
  assert.equal(normalizeSettings({mode:'fast-auto'}).mode,DEFAULTS.mode);
  assert.equal(normalizeSettings({strength:500,split:-2}).strength,100);
  assert.equal(normalizeSettings({strength:500,split:-2}).split,0);
  assert.equal(Object.hasOwn(normalizeSettings({adaptive:true}),'adaptive'),false);
});

test('output resolution is exact or rejected, never reduced automatically', async () => {
  const {outputSize}=await settings();
  assert.deepEqual(outputSize(1920,1080,'anime',8192),[3840,2160]);
  assert.deepEqual(outputSize(1920,1080,'hq',8192),[3840,2160]);
  assert.deepEqual(outputSize(1920,1080,'soft',8192),[1920,1080]);
  assert.throws(()=>outputSize(7680,4320,'hq',8192),/RESOLUTION_LIMIT/);
});

test('scope is restricted to AnimeLib and its embedded Kodik frames', async () => {
  const {allowedFrame}=await settings();
  assert.equal(allowedFrame({hostname:'animelib.org',topFrame:true}),true);
  assert.equal(allowedFrame({hostname:'kodikplayer.com',topFrame:false,ancestors:['https://animelib.org']}),true);
  assert.equal(allowedFrame({hostname:'kodikplayer.com',topFrame:false,referrer:'https://animelib.org/ru/'}),true);
  assert.equal(allowedFrame({hostname:'kodikplayer.com',topFrame:true,referrer:'https://animelib.org/ru/'}),false);
  assert.equal(allowedFrame({hostname:'kodikplayer.com',topFrame:false,ancestors:['https://animelib.org.evil.test']}),false);
  assert.equal(allowedFrame({hostname:'example.com',topFrame:true}),false);
});

function page({blocked=false}={}) {
  const dom=new JSDOM('<!doctype html><html data-ae-demo><body><div id="player"><video style="width:640px;height:360px" src="/episode.webm"></video><button id="site-control">Пауза</button></div></body></html>', {
    url:'http://localhost:8765',runScripts:'outside-only',pretendToBeVisual:true
  });
  const w=dom.window,v=w.document.querySelector('video');
  v.getBoundingClientRect=()=>({width:640,height:360});
  for(const [name,value] of Object.entries({readyState:2,videoWidth:640,videoHeight:360,offsetWidth:640,offsetHeight:360}))Object.defineProperty(v,name,{value,configurable:true});
  w.ResizeObserver=class {observe(){}disconnect(){}};
  if(blocked)Object.defineProperty(w.navigator,'gpu',{value:{}});
  if(blocked)w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData(){throw new w.DOMException('cross-origin frame','SecurityError');}});
  w.eval(compiled());
  return {dom,w,v};
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('panel is separate, starts disabled, and manual HQ selection does not enable or downgrade', async () => {
  const {dom,w,v}=page();
  try {
    await wait(330);
    const host=w.document.querySelector('anime-enhance-ui');
    assert.ok(host);
    const root=host.shadowRoot;
    assert.equal(root.querySelector('.switch').getAttribute('aria-checked'),'false');
    root.querySelector('.pill').click();
    assert.equal(root.querySelector('.panel').hidden,false);
    const mode=root.querySelector('#mode');mode.value='hq';mode.dispatchEvent(new w.Event('change'));
    await wait(160);
    assert.equal(mode.value,'hq');
    assert.equal(root.querySelector('.switch').getAttribute('aria-checked'),'false');
    assert.equal(w.document.querySelector('canvas'),null);
    assert.equal(w.document.querySelector('#site-control').hidden,false);
    assert.equal(v.getAttribute('src'),'/episode.webm');
  } finally {dom.window.close();}
});

test('CORS denial shows a useful error, removes overlay and preserves original playback and HQ setting', async () => {
  const {dom,w,v}=page({blocked:true});
  let touchedPlayback=false;
  v.pause=()=>{touchedPlayback=true;};v.load=()=>{touchedPlayback=true;};
  try {
    await wait(330);
    const host=w.document.querySelector('anime-enhance-ui');
    w.document.dispatchEvent(new w.CustomEvent('anime-enhance-demo-settings',{detail:{mode:'hq',enabled:true}}));
    await wait(250);
    assert.equal(host.dataset.state,'error');
    assert.match(host.shadowRoot.querySelector('.message').textContent,/не разрешает обработку кадров/);
    assert.equal(host.shadowRoot.querySelector('#mode').value,'hq');
    assert.equal(v.getAttribute('src'),'/episode.webm');
    assert.equal(w.document.querySelector('canvas'),null);
    assert.equal(touchedPlayback,false);
    host.shadowRoot.querySelector('.switch').click();
    assert.equal(host.dataset.state,'off');
  } finally {dom.window.close();}
});

test('removing a video removes its settings panel and injected layout style', async () => {
  const {dom,w,v}=page();
  try {
    await wait(330);
    const parent=v.parentElement;
    v.remove();
    await wait(300);
    assert.equal(w.document.querySelector('anime-enhance-ui'),null);
    assert.equal(parent.style.position,'');
  } finally {dom.window.close();}
});

test('manifest ships only local code and has no ad blocking or network interception permissions', () => {
  const m=JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
  assert.deepEqual(m.permissions,['storage']);
  assert.equal(m.content_scripts[0].all_frames,true);
  assert.equal(m.content_scripts[0].world,undefined);
  assert.equal(m.name.startsWith('Anime Enhance'),true);
  assert.equal(m.update_url,undefined);
});

test('comparison checkbox toggles split view while keeping enhancement and manual mode', async () => {
  const {dom,w}=page();
  try {
    await wait(330);
    const root=w.document.querySelector('anime-enhance-ui').shadowRoot;
    const compare=root.querySelector('#compare');
    compare.click();
    assert.equal(root.querySelector('.comparison-controls').hidden,false);
    assert.equal(root.querySelector('.split').hidden,false);
    const layout=root.querySelector('#comparison');
    layout.value='side';layout.dispatchEvent(new w.Event('change'));
    assert.equal(root.querySelector('.split').hidden,true);
    compare.click();
    assert.equal(root.querySelector('.comparison-controls').hidden,true);
    assert.equal(root.querySelector('.switch').getAttribute('aria-checked'),'false');
    assert.equal(root.querySelector('#mode').value,'anime');
  } finally {dom.window.close();}
});

test('execution plan preserves nested compute and render commands across fresh encoders', async () => {
  const {compilePlan}=await import('./src/gpu-plan.js');
  const model={getExecutionOrder:()=>[
    {isCompute:true,async recordCompute(p){p.setPipeline('CNN');p.setBindGroup(0,'weights');p.dispatchWorkgroups(240,135);}},
    {async pass(e){const p=e.beginRenderPass({label:'overlay'});p.setPipeline('overlay');p.draw(6);p.end();}},
    {isCompute:true,async recordCompute(p){p.setPipeline('clamp');p.dispatchWorkgroups(480,270);}}
  ]};
  const plan=await compilePlan(model);
  const record=()=>{
    const calls=[];
    const pass=()=>new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args])});
    plan({beginComputePass(){calls.push(['compute']);return pass();},beginRenderPass(d){calls.push(['render',d.label]);return pass();}});
    return calls;
  };
  const expected=[['compute'],['setPipeline','CNN'],['setBindGroup',0,'weights'],['dispatchWorkgroups',240,135],['end'],['render','overlay'],['setPipeline','overlay'],['draw',6],['end'],['compute'],['setPipeline','clamp'],['dispatchWorkgroups',480,270],['end']];
  assert.deepEqual(record(),expected);
  assert.deepEqual(record(),expected);
});

test('FP16 is opt-in, changes only CNN arithmetic and preserves texture interfaces', async () => {
  const {normalizeSettings}=await settings();
  const {cnnToF16}=await import('./src/gpu-plan.js');
  const shader=(await import('./node_modules/anime4k-webgpu-async/dist/pipelines/restore/CNNM/shaders/conv2dtf.wgsl.js')).default;
  const converted=cnnToF16(shader);
  assert.equal(normalizeSettings({mode:'hq'}).precision,'f32');
  assert.match(converted,/enable f16;/);
  assert.match(converted,/mat4x4<f16>/);
  assert.match(converted,/texture_2d<f32>/);
  assert.match(converted,/textureStore\([^;]*vec4f\(result\)\)/);
  assert.equal(cnnToF16('@fragment fn main() {}'),'@fragment fn main() {}');
  assert.equal(normalizeSettings({mode:'sharp'}).mode,'soft');
});

test('graph retains 60 samples and redraws only when the panel is open', async () => {
  const {EnhancementUI}=await import('./src/ui.js');
  const {DEFAULTS}=await settings();
  const dom=new JSDOM('<body><div id="parent"></div>');
  const before=global.document;
  global.document=dom.window.document;
  try {
    const ui=new EnhancementUI(document.querySelector('#parent'),DEFAULTS,()=>{});
    for(let i=0;i<80;i++) ui.stats({fps:24,ms:15+i%5,skipped:0,input:[1920,1080],output:[3840,2160]});
    assert.equal(ui.history.length,60);
    assert.equal(ui.$('.chart path').getAttribute('d'),null);
    ui.open();
    assert.equal(ui.$('.chart').hidden,false);
    assert.match(ui.$('.chart path').getAttribute('d'),/^M/);
    const pathBefore=ui.$('.chart path').getAttribute('d');
    ui.open(false);
    ui.stats({fps:24,ms:70,skipped:0,input:[1920,1080],output:[3840,2160]});
    assert.equal(ui.$('.chart path').getAttribute('d'),pathBefore);
    ui.status('off','Обработка выключена');
    assert.equal(ui.history.length,0);
    ui.destroy();
  } finally {global.document=before;dom.window.close();}
});

test('GPU completion drains the newest frame only; comparison redraw reuses the processed frame', async () => {
  const {VideoRenderer}=await import('./src/renderer.js');
  const {DEFAULTS}=await settings();
  const before={document:global.document,GPUTextureUsage:global.GPUTextureUsage};
  global.document={hidden:false};
  const completions=[],copies=[];
  const pass={setPipeline(){},setBindGroup(){},draw(){},end(){}};
  const video={readyState:2,videoWidth:1920,videoHeight:1080,paused:false};
  const canvas={width:3840,height:2160};
  let first=0;
  const renderer=new VideoRenderer(video,canvas,DEFAULTS,{onStats(){},onFirstFrame(){first++;},onError(error){throw error;}});
  Object.assign(renderer,{active:true,width:1920,height:1080,input:{},params:{},record(){},pipeline:{},bindGroup:{},
    context:{getCurrentTexture:()=>({createView:()=>({})})},
    device:{queue:{writeBuffer(){},copyExternalImageToTexture(){copies.push(renderer.sourceVersion);},submit(){},onSubmittedWorkDone:()=>new Promise(resolve=>completions.push(resolve))},createCommandEncoder:()=>({beginRenderPass:()=>pass,finish(){return {};}})}
  });
  try {
    const firstDraw=renderer.draw();
    renderer.sourceVersion=1;await renderer.draw();
    renderer.sourceVersion=2;await renderer.draw();
    assert.deepEqual(copies,[0]);
    completions.shift()();await firstDraw;
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(copies,[0,2]);
    completions.shift()();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(first,1);
    await renderer.draw();assert.deepEqual(copies,[0,2]);
    renderer.update({...DEFAULTS,compare:true,comparison:'side'});
    assert.deepEqual(copies,[0,2]);
    completions.shift()();await new Promise(resolve=>setImmediate(resolve));
  } finally {renderer.disposed=true;global.document=before.document;}
});
