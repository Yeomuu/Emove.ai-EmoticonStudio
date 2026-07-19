import { useEffect, useRef } from "react";

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const SIMULATION_SHADER = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform vec2 uPointer;
  uniform vec2 uAspect;
  uniform float uImpulse;
  uniform float uReset;

  float heightAt(vec2 uv) {
    return texture2D(uState, clamp(uv, vec2(0.0), vec2(1.0))).r * 2.0 - 1.0;
  }

  void main() {
    if (uReset > 0.5) {
      gl_FragColor = vec4(0.5, 0.5, 0.0, 1.0);
      return;
    }

    vec4 previous = texture2D(uState, vUv);
    float height = previous.r * 2.0 - 1.0;
    float velocity = previous.g * 2.0 - 1.0;
    float wake = previous.b * 0.985;
    float neighbors =
      heightAt(vUv + vec2(uTexel.x, 0.0)) +
      heightAt(vUv - vec2(uTexel.x, 0.0)) +
      heightAt(vUv + vec2(0.0, uTexel.y)) +
      heightAt(vUv - vec2(0.0, uTexel.y));

    velocity += (neighbors * 0.25 - height) * 0.38;
    velocity *= 0.93;
    height = (height + velocity) * 0.97;

    vec2 delta = (vUv - uPointer) * uAspect;
    float brush = smoothstep(0.052, 0.0, length(delta));
    height += brush * uImpulse * 0.26;
    velocity += brush * uImpulse * 0.14;
    wake = max(wake, brush * smoothstep(0.018, 0.12, uImpulse));

    gl_FragColor = vec4(
      clamp(height * 0.5 + 0.5, 0.0, 1.0),
      clamp(velocity * 0.5 + 0.5, 0.0, 1.0),
      wake,
      1.0
    );
  }
`;

const DISPLAY_SHADER = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform vec2 uAspect;
  uniform float uPointerEnergy;
  uniform vec3 uTrail[12];
  uniform float uTime;
  uniform float uLight;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x),
      f.y
    );
  }

  float heightAt(vec2 uv) {
    return texture2D(uState, clamp(uv, vec2(0.0), vec2(1.0))).r * 2.0 - 1.0;
  }

  float causticField(vec2 uv, float time) {
    const float tau = 6.2831853;
    vec2 p = mod(uv * tau, tau) - 250.0;
    vec2 iteration = p;
    float strength = 1.0;
    const float intensity = 0.005;

    for (int index = 0; index < 4; index++) {
      float phase = time * (1.0 - 3.5 / float(index + 1));
      iteration = p + vec2(
        cos(phase - iteration.x) + sin(phase + iteration.y),
        sin(phase - iteration.y) + cos(phase + iteration.x)
      );
      vec2 divisor = vec2(
        sin(iteration.x + phase),
        cos(iteration.y + phase)
      ) / intensity;
      vec2 warped = vec2(
        p.x / (abs(divisor.x) < 0.0001 ? 0.0001 : divisor.x),
        p.y / (abs(divisor.y) < 0.0001 ? 0.0001 : divisor.y)
      );
      strength += 1.0 / max(length(warped), 0.001);
    }

    strength *= 0.25;
    strength = 1.17 - pow(strength, 1.4);
    return clamp(pow(abs(strength), 4.0), 0.0, 1.0);
  }

  void main() {
    float height = heightAt(vUv);
    float wake = (
      texture2D(uState, vUv).b * 2.0
        + texture2D(uState, vUv + vec2(uTexel.x, 0.0)).b
        + texture2D(uState, vUv - vec2(uTexel.x, 0.0)).b
        + texture2D(uState, vUv + vec2(0.0, uTexel.y)).b
        + texture2D(uState, vUv - vec2(0.0, uTexel.y)).b
    ) / 6.0;
    vec2 gradient = vec2(
      heightAt(vUv + vec2(uTexel.x, 0.0)) - heightAt(vUv - vec2(uTexel.x, 0.0)),
      heightAt(vUv + vec2(0.0, uTexel.y)) - heightAt(vUv - vec2(0.0, uTexel.y))
    );
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 centeredUv = (vUv - 0.5) * vec2(aspect, 1.0);
    vec2 flow = vec2(
      noise(centeredUv * 2.6 + vec2(uTime * 0.22, -uTime * 0.17)),
      noise(centeredUv * 2.8 + vec2(7.1 - uTime * 0.19, 3.4 + uTime * 0.21))
    );
    flow = (flow - 0.5) * 0.18;
    vec2 refraction = gradient * 4.8 + height * vec2(0.28, -0.22);
    vec2 waterUv = centeredUv * 1.75 + flow + refraction * 0.035;

    float causticBase = causticField(waterUv, uTime * 0.72);
    const float causticOffset = 0.014;
    float causticDx = causticField(
      waterUv + vec2(causticOffset, 0.0),
      uTime * 0.72
    ) - causticBase;
    float causticDy = causticField(
      waterUv + vec2(0.0, causticOffset),
      uTime * 0.72
    ) - causticBase;
    float causticEdge = clamp(length(vec2(causticDx, causticDy)) * 9.0, 0.0, 1.0);
    float caustic = clamp(pow(causticEdge, 0.78) + causticBase * 0.06, 0.0, 1.0);
    caustic *= 0.88 + sin(uTime * 1.8 + waterUv.x * 1.7 + waterUv.y * 1.1) * 0.12;

    float disturbance = clamp(
      smoothstep(0.008, 0.055, abs(height))
        + smoothstep(0.006, 0.045, length(gradient)),
      0.0,
      1.0
    );

    float spectralPhase = caustic * 0.72 + height * 3.4 + length(gradient) * 2.8 + wake * 0.74;
    vec3 spectrum = 0.5 + 0.5 * cos(
      6.2831853 * (spectralPhase + vec3(0.0, 0.3333, 0.6667))
    );
    vec3 darkWater = vec3(0.64, 0.78, 1.0);
    vec3 lightWater = vec3(0.17, 0.32, 0.49);
    vec3 color = mix(darkWater, lightWater, uLight);
    float trailPrism = clamp(
      max(disturbance * (0.38 + abs(height) * 1.2), wake * 0.78),
      0.0,
      0.62
    );
    color = mix(color, spectrum, trailPrism * 0.72);

    float sampledTrail = 0.0;
    for (int index = 0; index < 12; index++) {
      vec2 trailDelta = (vUv - uTrail[index].xy) * uAspect;
      float trailDistance = length(trailDelta);
      float trailEnvelope = smoothstep(0.105, 0.008, trailDistance);
      float trailRing = (
        0.5 + 0.5 * cos(trailDistance * 112.0 - uTime * 8.5)
      ) * smoothstep(0.115, 0.016, trailDistance);
      float trailEnergy = clamp(
        (trailEnvelope * 0.18 + trailRing * 0.64) * uTrail[index].z,
        0.0,
        1.0
      );
      vec3 trailSpectrum = 0.5 + 0.5 * cos(
        6.2831853 * (
          trailDistance * 8.0
            - uTime * 0.42
            + vec3(0.0, 0.3333, 0.6667)
        )
      );
      color = mix(color, trailSpectrum, min(0.34, trailEnergy * 0.55));
      sampledTrail = max(sampledTrail, trailEnergy);
    }

    vec2 pointerDelta = (vUv - uPointer) * uAspect;
    float pointerDistance = length(pointerDelta);
    float pointerEnvelope = smoothstep(0.20, 0.015, pointerDistance);
    float pointerRing = (
      0.5 + 0.5 * cos(pointerDistance * 92.0 - uTime * 13.0)
    ) * smoothstep(0.22, 0.035, pointerDistance);
    float pointerPrism = clamp(
      (pointerEnvelope * 0.42 + pointerRing * 0.98) * uPointerEnergy,
      0.0,
      1.0
    );
    vec3 pointerSpectrum = 0.5 + 0.5 * cos(
      6.2831853 * (
        pointerDistance * 8.5
          - uTime * 0.68
          + vec3(0.0, 0.3333, 0.6667)
      )
    );
    color = mix(color, pointerSpectrum, pointerPrism * 0.95);

    float softNoise = noise(gl_FragCoord.xy * 0.22 + vec2(uTime * 2.4, -uTime * 1.7)) - 0.5;
    float fineNoise = hash21(gl_FragCoord.xy + floor(uTime * 30.0)) - 0.5;
    float alpha = caustic * mix(0.055, 0.04, uLight)
      + disturbance * mix(0.15, 0.10, uLight)
      + wake * mix(0.28, 0.18, uLight)
      + sampledTrail * mix(0.34, 0.24, uLight)
      + pointerPrism * 0.35
      + softNoise * 0.008
      + fineNoise * 0.003;
    float alphaLimit = mix(0.28, 0.21, uLight)
      + sampledTrail * 0.1
      + pointerPrism * 0.16;
    alpha = clamp(alpha, 0.0, alphaLimit);

    gl_FragColor = vec4(color, alpha);
  }
`;

export function LiquidRippleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => undefined;

    void import("three").then((THREE) => {
      if (disposed) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(0x000000, 0);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const geometry = new THREE.PlaneGeometry(2, 2);
      const simulationScene = new THREE.Scene();
      const displayScene = new THREE.Scene();
      const pointer = new THREE.Vector2(.5, .5);
      const pointerTarget = new THREE.Vector2(.5, .5);
      const previousPointer = new THREE.Vector2(.5, .5);
      const lastTrailPointer = new THREE.Vector2(.5, .5);
      const trailUniforms = Array.from(
        { length: 12 },
        () => new THREE.Vector3(.5, .5, 0),
      );
      const simulationPointer = new THREE.Vector2(.5, .5);
      const simulationSize = new THREE.Vector2(320, 180);
      let impulse = 0;
      let pointerEnergy = 0;
      let trailCursor = 0;
      let frame = 0;
      let lastTime = performance.now();
      let targetA = createTarget(THREE, simulationSize.x, simulationSize.y);
      let targetB = createTarget(THREE, simulationSize.x, simulationSize.y);

      const simulationUniforms = {
        uState: { value: targetA.texture },
        uTexel: { value: new THREE.Vector2(1 / simulationSize.x, 1 / simulationSize.y) },
        uPointer: { value: simulationPointer },
        uAspect: { value: new THREE.Vector2(1, 1) },
        uImpulse: { value: 0 },
        uReset: { value: 1 },
      };
      const displayUniforms = {
        uState: { value: targetA.texture },
        uTexel: { value: simulationUniforms.uTexel.value },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPointer: { value: pointer },
        uAspect: { value: simulationUniforms.uAspect.value },
        uPointerEnergy: { value: 0 },
        uTrail: { value: trailUniforms },
        uTime: { value: 0 },
        uLight: { value: document.documentElement.dataset.theme === "light" ? 1 : 0 },
      };
      const simulationMaterial = new THREE.ShaderMaterial({
        uniforms: simulationUniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: SIMULATION_SHADER,
        depthTest: false,
        depthWrite: false,
      });
      const displayMaterial = new THREE.ShaderMaterial({
        uniforms: displayUniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: DISPLAY_SHADER,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      simulationScene.add(new THREE.Mesh(geometry, simulationMaterial));
      displayScene.add(new THREE.Mesh(geometry, displayMaterial));

      const initializeTargets = () => {
        simulationUniforms.uReset.value = 1;
        renderer.setRenderTarget(targetA);
        renderer.render(simulationScene, camera);
        renderer.setRenderTarget(targetB);
        renderer.render(simulationScene, camera);
        renderer.setRenderTarget(null);
        simulationUniforms.uReset.value = 0;
      };
      const resize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        renderer.setSize(width, height, false);
        displayUniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
        const scale = width < 760 ? .28 : .34;
        const nextWidth = Math.max(220, Math.min(720, Math.round(width * scale)));
        const nextHeight = Math.max(140, Math.min(420, Math.round(height * scale)));
        simulationSize.set(nextWidth, nextHeight);
        targetA.dispose();
        targetB.dispose();
        targetA = createTarget(THREE, nextWidth, nextHeight);
        targetB = createTarget(THREE, nextWidth, nextHeight);
        simulationUniforms.uState.value = targetA.texture;
        simulationUniforms.uTexel.value.set(1 / nextWidth, 1 / nextHeight);
        simulationUniforms.uAspect.value.set(width / Math.max(height, 1), 1);
        initializeTargets();
      };
      const trackPointer = (event: PointerEvent) => {
        const bounds = canvas.getBoundingClientRect();
        pointerTarget.set(
          Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
          1 - Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
        );
        const trailDistance = pointerTarget.distanceTo(lastTrailPointer);
        if (trailDistance > .012) {
          trailUniforms[trailCursor].set(
            pointerTarget.x,
            pointerTarget.y,
            Math.min(1, .45 + trailDistance * 7),
          );
          trailCursor = (trailCursor + 1) % trailUniforms.length;
          lastTrailPointer.copy(pointerTarget);
        }
      };
      const renderFrame = (time: number) => {
        const elapsed = Math.min(34, Math.max(0, time - lastTime));
        lastTime = time;
        previousPointer.copy(pointer);
        pointer.lerp(pointerTarget, 1 - Math.pow(.62, elapsed / 16.67));
        const speed = pointer.distanceTo(previousPointer);
        impulse = Math.min(.55, Math.max(speed * 30, impulse * .82));
        pointerEnergy = Math.min(1, Math.max(speed * 56, pointerEnergy * .975));
        const trailDecay = Math.pow(.99, elapsed / 16.67);
        trailUniforms.forEach((sample) => {
          sample.z *= trailDecay;
        });

        simulationUniforms.uImpulse.value = impulse;
        const simulationSteps = impulse > .025 ? 3 : 1;
        for (let step = 0; step < simulationSteps; step += 1) {
          simulationPointer.lerpVectors(previousPointer, pointer, (step + 1) / simulationSteps);
          simulationUniforms.uState.value = targetA.texture;
          renderer.setRenderTarget(targetB);
          renderer.render(simulationScene, camera);
          [targetA, targetB] = [targetB, targetA];
        }

        displayUniforms.uState.value = targetA.texture;
        displayUniforms.uPointerEnergy.value = pointerEnergy;
        displayUniforms.uTime.value = time * .001;
        displayUniforms.uLight.value += ((document.documentElement.dataset.theme === "light" ? 1 : 0) - displayUniforms.uLight.value) * .09;
        renderer.setRenderTarget(null);
        renderer.render(displayScene, camera);
        if (!reducedMotion) frame = window.requestAnimationFrame(renderFrame);
      };

      resize();
      initializeTargets();
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", trackPointer, { passive: true });
      renderFrame(performance.now());
      cleanup = () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", trackPointer);
        geometry.dispose();
        simulationMaterial.dispose();
        displayMaterial.dispose();
        targetA.dispose();
        targetB.dispose();
        renderer.dispose();
      };
    }).catch(() => canvas.classList.add("is-fallback"));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <canvas ref={canvasRef} className="showcase-liquid-canvas" aria-hidden="true" />;
}

function createTarget(THREE: typeof import("three"), width: number, height: number) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}
