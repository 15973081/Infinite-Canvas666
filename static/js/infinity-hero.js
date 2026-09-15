import * as T from '/static/vendor/js/three-0.160.0.module.js';
const host=document.querySelector('.welcome-icon');
if(host)try{init();}catch(e){host.classList.remove('infinity-ready');console.warn('Infinity hero fallback:',e.message);}
function init(){
 const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'});
 if(!gl){console.info('Infinity hero: WebGL2 unavailable; using static fallback.');return;}
 const coarse=matchMedia('(pointer:coarse)').matches,mobile=coarse&&innerWidth<700;
 const memory=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4;
 const count=memory<=2||cores<=2?1500:mobile?3000:coarse?6000:memory>=8&&cores>=8?22000:11000;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const renderer=new T.WebGLRenderer({canvas,context:gl,alpha:false,antialias:false});
 renderer.setClearColor(0x0d1016);renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.5:1.75));
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,30);camera.position.z=5.8;
 const geometry=new T.BufferGeometry(),seeds=new Float32Array(count*4);
 const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
 // Initialization only. Vertex positions are computed exclusively by the GPU.
 for(let i=0;i<count;i++){
  const trail=i%100<8,key=trail?Math.floor(i/100)*100:i;
  seeds.set([rand(key+1),rand(key+5),rand(key+19),trail?2+(i%100)/8:i%100<30?1:0],i*4);
 }
 geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(count*3),3));
 geometry.setAttribute('aSeed',new T.BufferAttribute(seeds,4));
 const uniforms={uTime:{value:0},uMouse:{value:new T.Vector2(20,20)},uIntensity:{value:0},uPixelRatio:{value:1}};
 const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,
 vertexShader:[
 'attribute vec4 aSeed;',
 'uniform float uTime,uIntensity,uPixelRatio; uniform vec2 uMouse;',
 'varying float vAlpha,vHighlight;',
 'const float TAU=6.28318530718;',
 'vec3 curve(float t){return vec3(2.65*sin(t),1.50*sin(t)*cos(t),.21*cos(t)+.12*sin(2.*t));}',
 'void main(){',
 'float layer=floor(aSeed.w),tail=fract(aSeed.w);',
 'float speed=layer>1.5?.65:layer>.5?.065:.12;',
 'speed*=.8+aSeed.y*.4;',
 'float t=aSeed.x*TAU+uTime*speed;',
 'float cycle=mod(uTime,9.0),head=cycle*1.65;',
 'float dist=abs(atan(sin(t-head),cos(t-head)));',
 'float pulse=exp(-dist*dist/.045)*smoothstep(0.,.6,cycle)*(1.-smoothstep(4.1,5.,cycle));',
 't+=pulse*.035; if(layer>1.5)t-=tail*.12;',
 't+=.035*sin(2.*t);',
 'vec3 p=curve(t);',
 'vec2 tangent=normalize(vec2(2.65*cos(t),1.50*cos(2.*t)));',
 'vec2 normal=vec2(-tangent.y,tangent.x);',
 'float orbit=aSeed.y*TAU+uTime*(.3+aSeed.z*.2);',
 'float drift=.5+.5*sin(uTime*.24+aSeed.x*TAU);',
 'float radius=layer>1.5?.018:layer>.5?.13+pow(drift,4.)*.35:.025+.10*aSeed.z;',
 'radius*=1.-.18*exp(-p.x*p.x*3.);',
 'p.xy+=normal*cos(orbit)*radius;p.z+=sin(orbit)*radius;',
 'p.y+=sin(t*7.+uTime*.4+aSeed.z*TAU)*radius*.13;',
 'p*=1.+sin(uTime*.9)*.012+sin(uTime*.41)*.003;',
 'float influence=1.-smoothstep(0.,2.0,length(p.xy-uMouse));',
 'p.xy+=(p.xy-uMouse)*influence*uIntensity*.08;',
 'p.z+=influence*uIntensity*.1*sin(t*9.+uTime);',
 'p.x+=p.z*clamp(uMouse.x,-3.,3.)*.018*uIntensity;',
 'vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;',
 'vHighlight=step(.925,aSeed.z);',
 'float size=mix(1.1,2.,aSeed.y)+vHighlight*.9;',
 'if(layer>1.5)size=2.3*(1.-tail*.45);',
 'gl_PointSize=clamp(size*uPixelRatio*(1.+pulse*.65)*(1.0+clamp(8.0/-mv.z,0.0,1.0)*.15),1.,7.);',
 'vAlpha=(layer>1.5?.6*(1.-tail):layer>.5?.14:.52)*(1.+pulse*.85);',
 'vAlpha*=.94+.06*sin(uTime*.9+aSeed.y);',
 '}'].join('\n'),
 fragmentShader:[
 'precision highp float;varying float vAlpha,vHighlight;',
 'void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;',
 'float core=exp(-r*r*7.5),halo=pow(1.-r,2.)*.22;',
 'vec3 color=mix(vec3(.62,.70,.82),vec3(.91,.94,1.),vHighlight);',
 'gl_FragColor=vec4(color,(core+halo)*vAlpha);}'].join('\n')});
 const points=new T.Points(geometry,material);points.frustumCulled=false;scene.add(points);
 canvas.setAttribute('aria-hidden','true');host.append(canvas);
 let frame=0,visible=true,disposed=false,lost=false,last=0,time=0,samples=0,slow=0,targetPower=0;
 const target=new T.Vector2(20,20);
 renderer.debug.onShaderError=()=>{lost=true;pause();host.classList.remove('infinity-ready');};
 function draw(){renderer.render(scene,camera);if(!lost&&!host.classList.contains('infinity-ready'))host.classList.add('infinity-ready');}
 function resize(){
  const r=host.getBoundingClientRect();if(!r.width||!r.height)return;
  camera.aspect=r.width/r.height;
  const narrow=r.width<=760,halfWidth=narrow?3.35:3.65;
  camera.position.z=halfWidth/camera.aspect/Math.tan(36*Math.PI/360);
  camera.far=Math.max(30,camera.position.z+10);camera.updateProjectionMatrix();
  points.position.set(narrow?0:-.55,narrow?halfWidth/camera.aspect*.52:0,0);
  renderer.setSize(r.width,r.height,false);uniforms.uPixelRatio.value=renderer.getPixelRatio();
  if(reduced.matches&&!lost)draw();
 }
 function tick(now){
  frame=0;if(disposed||lost||!visible||document.hidden)return;
  const delta=last?Math.min((now-last)/1000,.08):0;last=now;time+=delta;
  uniforms.uTime.value=time;uniforms.uMouse.value.lerp(target,.06);
  uniforms.uIntensity.value+=(targetPower-uniforms.uIntensity.value)*.06;draw();
  if(++samples<=180&&delta>.025)slow++;
  if(samples===180&&slow>75){geometry.setDrawRange(0,Math.max(800,Math.floor(count*.6)));renderer.setPixelRatio(1);resize();}
  if(!reduced.matches)frame=requestAnimationFrame(tick);
 }
 function resume(){if(!frame&&!disposed&&!lost&&visible&&!document.hidden){last=0;frame=requestAnimationFrame(tick);}}
 function pause(){cancelAnimationFrame(frame);frame=0;last=0;}
 function move(e){
  if(reduced.matches)return;
  const r=host.getBoundingClientRect(),half=Math.tan(36*Math.PI/360)*camera.position.z;
  target.set(((e.clientX-r.left)/r.width*2-1)*half*camera.aspect,(1-(e.clientY-r.top)/r.height*2)*half);target.sub(points.position);targetPower=1;
 }
 function leave(){targetPower=0;}
 function visibility(){document.hidden?pause():resume();}
 function motion(){pause();targetPower=0;resume();}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visible?resume():pause();});observer.observe(host);
 const resizer=new ResizeObserver(resize);resizer.observe(host);
 window.addEventListener('pointermove',move,{passive:true});document.documentElement.addEventListener('pointerleave',leave);
 document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',motion);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;pause();host.classList.remove('infinity-ready');});
 canvas.addEventListener('webglcontextrestored',()=>{lost=false;resize();resume();});
 window.addEventListener('pagehide',e=>{
  pause();if(e.persisted)return;disposed=true;observer.disconnect();resizer.disconnect();
  window.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',leave);
  document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);
  geometry.dispose();material.dispose();renderer.dispose();
 });
 window.addEventListener('pageshow',resume);resize();resume();
}
