import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';

const VERTEX_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/* Luminous ledger contour shader: silky flowing waves in #2E2396, #4F46E5 & #0B6E54 reacting smoothly to pointer */
const FRAGMENT_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
  vec2 st = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = vec2((st.x - 0.5) * aspect, st.y - 0.5);
  vec2 m = vec2((u_mouse.x - 0.5) * aspect, (1.0 - u_mouse.y) - 0.5);

  float t = u_time * 0.45;
  float waveA = sin(p.x * 3.4 + t + cos(p.y * 2.5 - t * 0.75) * 0.95);
  float waveB = cos(p.y * 4.4 - t * 0.85 + sin(p.x * 2.2 + t * 0.6) * 0.8);
  float waveC = sin((p.x + p.y) * 2.6 - t * 0.55);
  float distMouse = length(p - m);
  float pointerRipple = exp(-distMouse * 2.1) * 0.72
                      + sin(distMouse * 14.0 - u_time * 3.2) * exp(-distMouse * 2.4) * 0.42;

  float field = (waveA * 0.42 + waveB * 0.38 + waveC * 0.2) + pointerRipple;

  /* Silky multi-layered topographic contour lines */
  float contour = smoothstep(0.085, 0.0, abs(fract(field * 3.0) - 0.5));
  float contourFine = smoothstep(0.045, 0.0, abs(fract(field * 6.0) - 0.5));
  float softGlow = clamp((field + 1.0) * 0.5, 0.0, 1.0);

  vec3 paper = vec3(0.9647, 0.9725, 0.9843);
  vec3 indigo = vec3(0.1804, 0.1373, 0.5882);
  vec3 violet = vec3(0.3098, 0.2745, 0.8980);
  vec3 emerald = vec3(0.0431, 0.4314, 0.3294);

  float edgeFade = smoothstep(0.0, 0.08, st.x) * smoothstep(1.0, 0.92, st.x)
                 * smoothstep(0.0, 0.1, st.y) * smoothstep(1.0, 0.92, st.y);

  vec3 inkA = mix(indigo, violet, softGlow);
  vec3 ink = mix(inkA, emerald, smoothstep(0.15, 0.88, st.x) * 0.55 + 0.12 * sin(t));
  float leftSafety = mix(0.62, 1.0, smoothstep(0.05, 0.55, st.x));
  float alpha = (contour * 0.13 + contourFine * 0.045 + softGlow * 0.075 + abs(pointerRipple) * 0.14) * edgeFade * leftSafety;

  vec3 col = mix(paper, ink, clamp(alpha, 0.0, 0.26));
  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Featherweight WebGL contour shader background for the Hero band.
 * Automatically pauses when offscreen or under prefers-reduced-motion, and falls back to archival paper silently.
 */
export function HeroShaderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(true);
  const pausedRef = useRef<boolean>(false);
  const resumeLoopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused) {
      resumeLoopRef.current?.();
    }
  }, [paused]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setPaused(true);
      pausedRef.current = true;
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    if (!gl) {
      setSupported(false);
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) {
      setSupported(false);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setSupported(false);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setSupported(false);
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'u_time');
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');

    let targetMouseX = 0.65;
    let targetMouseY = 0.42;
    let smoothMouseX = 0.65;
    let smoothMouseY = 0.42;
    let inViewport = true;
    let rafId = 0;
    let elapsed = 0;
    let lastStamp = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastStamp) / 1000));
      lastStamp = now;

      if (!pausedRef.current && inViewport) {
        elapsed += dt;
        smoothMouseX += (targetMouseX - smoothMouseX) * 0.06;
        smoothMouseY += (targetMouseY - smoothMouseY) * 0.06;
      }

      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, smoothMouseX, smoothMouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!pausedRef.current && inViewport) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      targetMouseX = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      targetMouseY = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = Boolean(entry?.isIntersecting);
        if (visible && !inViewport && !pausedRef.current) {
          inViewport = true;
          lastStamp = performance.now();
          rafId = window.requestAnimationFrame(drawFrame);
        } else {
          inViewport = visible;
        }
      },
      { threshold: 0.02 },
    );

    resize();
    drawFrame(performance.now());

    resumeLoopRef.current = () => {
      if (!pausedRef.current && inViewport) {
        window.cancelAnimationFrame(rafId);
        lastStamp = performance.now();
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && inViewport && !pausedRef.current) {
        lastStamp = performance.now();
        window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    observer.observe(container);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      resumeLoopRef.current = null;
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  if (!supported) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      aria-hidden={false}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
      {/* Bottom feather fade seamlessly into #F6F8FB canvas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#F6F8FB]" />

      {/* Explicit pause control required for motion accessibility — pinned top-right clear of bottom registration bar */}
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? 'Chạy chuyển động nền Hero' : 'Tạm dừng chuyển động nền Hero'}
        title={paused ? 'Chạy chuyển động nền' : 'Tạm dừng chuyển động nền'}
        className="pointer-events-auto absolute top-3 right-4 z-20 hidden items-center gap-1.5 rounded-full border border-border bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#475569] shadow-xs transition hover:border-[#2E2396]/40 hover:text-[#111625] sm:inline-flex"
      >
        <AppIcon name={paused ? 'play_arrow' : 'pause'} className="text-xs text-[#2E2396]" />
        <span>{paused ? 'Chạy nền' : 'Dừng nền'}</span>
      </button>
    </div>
  );
}
