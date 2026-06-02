"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  varying vec2 vUv;

  vec3 sampleBg(vec2 uv) {
    vec3 bg = vec3(0.004, 0.004, 0.005);
    float d1 = length(uv - vec2(0.08, 0.88));
    float d2 = length(uv - vec2(0.92, 0.62));
    float d3 = length(uv - vec2(0.50, 0.02));
    vec3 c = bg
      + mix(vec3(0.12), vec3(0.0, 0.898, 0.690), 0.28) * smoothstep(0.55, 0.0, d1) * 0.07
      + mix(vec3(0.10), vec3(0.486, 0.227, 1.0),  0.24) * smoothstep(0.50, 0.0, d2) * 0.06
      + mix(vec3(0.08), vec3(1.0, 0.0, 0.439),    0.20) * smoothstep(0.45, 0.0, d3) * 0.04;
    float v = length((uv - 0.5) * 2.0);
    return c * (1.0 - smoothstep(0.25, 1.0, v) * 0.78);
  }

  void main() {
    float w1 = sin(vUv.y * 9.0 + uTime * 1.6) * 0.022;
    float w2 = sin(vUv.y * 5.5 - uTime * 1.1) * 0.014;
    float w3 = sin(vUv.x * 7.0 + uTime * 2.0) * 0.011;
    vec2 wd = vec2(w1 + w2, w3);
    float d = uWave * 0.042;
    vec3 r = sampleBg(vUv + wd * d);
    vec3 g = sampleBg(vUv);
    vec3 b = sampleBg(vUv - wd * d);
    gl_FragColor = vec4(r.r, g.g, b.b, 1.0);
  }
`;

// Module-level: lives outside React, freely mutable by useFrame each tick.
// The ESLint react-hooks/immutability rule only guards hook-returned values.
const bgUniforms = { uTime: { value: 0 }, uWave: { value: 0 } };

function Background({ intensityRef }: { intensityRef: React.MutableRefObject<number> }) {
  const timeRef = useRef(0);
  const waveRef = useRef(0);

  useFrame((_, delta) => {
    const t = intensityRef.current;
    waveRef.current   += (t - waveRef.current) * (t > waveRef.current ? 0.07 : 0.045);
    timeRef.current   += delta;
    bgUniforms.uTime.value = timeRef.current;
    bgUniforms.uWave.value = waveRef.current;
  });

  return (
    <mesh scale={[20, 20, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial vertexShader={vert} fragmentShader={frag} uniforms={bgUniforms} />
    </mesh>
  );
}

type Props = { intensityRef: React.MutableRefObject<number> };

export default function GlitchCanvas({ intensityRef }: Props) {
  return (
    <Canvas
      frameloop="always"
      dpr={1}
      gl={{ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" }}
      camera={{ position: [0, 0, 3.5], fov: 60 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Background intensityRef={intensityRef} />
    </Canvas>
  );
}
