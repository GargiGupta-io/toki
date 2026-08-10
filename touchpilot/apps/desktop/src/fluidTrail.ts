// Copyright (c) 2026 Gargi Gupta. All rights reserved.
// Source-available for evaluation only; see LICENSE at the repository root.
// Not open source: no redistribution, derivative works, or presenting as your own.

/**
 * The trail, as moving fluid rather than as a drawn line.
 *
 * Every previous attempt drew a *path*: sample the cursor, smooth the points,
 * stroke a curve, fade it. Each one read as an object being dragged, because
 * that is what it was -- a shape, redrawn. Smoothing it more, fading it
 * differently and widening it did not change what it fundamentally was.
 *
 * This does not draw the movement at all. It pushes a small amount of colour
 * and momentum into a fluid at the pointer, and then simulates the fluid. What
 * appears on screen is the *consequence* of the hand having moved through it,
 * which is why it reads as wind: the curl, the spread and the settling are not
 * animated, they fall out of the physics.
 *
 * Velocity and dye are advected through a divergence-free field: curl, then
 * vorticity confinement, then a pressure solve, then advection. Standard
 * incompressible fluid, at low resolution, which is enough because it is being
 * looked at rather than measured.
 *
 * **Focused, not splashy.** The reference this came from throws a lot of paint
 * about, which is the wrong thing over somebody's actual screen -- it obscures
 * the work and reads as decoration. Every parameter below is turned towards a
 * tight ribbon that dies quickly: small splats, low force, little curl, and
 * dissipation high enough that nothing lingers where it is not wanted.
 *
 * **It stops.** Toki runs all day. A full-screen simulation that keeps
 * stepping when nobody is circling would cost battery for nothing, so the loop
 * runs only while there is something to show and parks itself when the fluid
 * has settled.
 */

export type FluidTrailOptions = {
  /** The creature's colour, so the trail is the same thing that drew it. */
  colour: string;
  /** Device pixel ratio to render at. Capped: this is a look, not a texture. */
  pixelRatio?: number;
};

export const fluidTrailPolicy = Object.freeze({
  /**
   * The velocity field's resolution.
   *
   * Low on purpose. The eye reads the *shape* of the motion, not its detail,
   * and this is a full-screen simulation running on somebody's laptop while
   * they are doing something else.
   */
  simResolution: 128,

  /**
   * The dye's resolution -- what is actually seen.
   *
   * Higher than the velocity field, because a soft edge at low resolution
   * looks like a low-resolution soft edge. Still well under the display: the
   * ribbon is blurred by its own physics, so pixels beyond this are spent on
   * detail the simulation never produces.
   */
  dyeResolution: 640,

  /**
   * How quickly the colour fades.
   *
   * The single most important number for staying out of the way. The reference
   * leaves paint hanging for seconds; a trail over somebody's work has to be
   * gone almost as soon as it has been understood.
   *
   * Chosen by measuring a real loop rather than by eye, because "visible" and
   * "obtrusive" are a narrow gap. Peak alpha for one circle drawn at the rate
   * the cursor is actually sampled:
   *
   *     dye    peak alpha   screen
   *     0.22    94 (37%)            too faint at the narrower radius
   *     0.36   188 (74%)     2.2%   <- this
   *     0.45   235 (92%)     2.4%   little headroom left
   *     0.55   255 clipped
   *
   * Clipping is the thing to avoid. Once alpha saturates the ribbon stops
   * being fluid and becomes a solid shape again, which is the failure this
   * whole approach replaced -- and a slow circle overlaps itself more than a
   * quick one, so the fast case has to leave room for the slow one.
   */
  densityDissipation: 2.8,

  /** How quickly the motion stops. Higher means a tighter, less drifting wake. */
  velocityDissipation: 7.0,

  pressure: 0.08,
  pressureIterations: 20,

  /**
   * Swirl.
   *
   * Vorticity confinement is what makes fluid look like fluid rather than like
   * smoke in a tube -- but turned up it produces the spreading curls that make
   * the reference so busy. Low: enough to see it is alive, not enough to
   * wander away from where the hand went.
   */
  curl: 0.35,

  /**
   * How wide each push of colour is.
   *
   * Set so the ribbon comes out the same width as the creature that draws it,
   * which is the only width that does not look arbitrary. Measured on a
   * straight stroke rather than derived, because the visible width depends on
   * where the gaussian's tail crosses the alpha threshold and therefore on the
   * brightness as well as the radius:
   *
   *     radius   drawn width
   *     0.024      34px          too thick; it read as a smear
   *     0.012      26px
   *     0.010      24px   <- this, the creature's diameter while it is active
   *     0.006      14px          thinner than the thing making it
   *
   * The creature is 22px at rest and 24-25px while listening or guiding, which
   * is the whole time this exists.
   */
  splatRadius: 0.010,

  /** How hard each push moves the fluid. Low, for the same reason. */
  splatForce: 350,

  shading: true,

  /**
   * How long the simulation keeps stepping after the last movement.
   *
   * Not a taste decision -- it is how long the dye takes to become invisible,
   * which follows from the fade rate. Colour decays by `1/(1 + fade * dt)` a
   * step, so reaching one part in 255 from full takes `ln(255) / fade` seconds,
   * about two at the rate above.
   *
   * Stopping earlier is what left remnants on screen: the loop simply stopped
   * rendering, so whatever was still visible on the final frame stayed there,
   * frozen, until something else drew. Half a second of margin, and then the
   * canvas is cleared outright -- see `frame`.
   */
  settleMs: 2_500,
});

type Fbo = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach(id: number): number;
};

type DoubleFbo = {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: Fbo;
  write: Fbo;
  swap(): void;
};

export type FluidTrail = {
  /** Push colour and momentum in, at a point in canvas pixels. */
  push(x: number, y: number, dx: number, dy: number, strength?: number): void;
  /**
   * Lay colour continuously from one point to another.
   *
   * The cursor is sampled every fifty milliseconds, which at any real speed is
   * tens of pixels between one position and the next. Pushing only at those
   * positions leaves a row of separate dots -- the fluid used to smear them
   * together, but only because it was being shoved hard enough to billow,
   * which is exactly what made it read as wind rather than as a trail.
   *
   * Filling the gap instead means the ribbon is continuous at any speed, and
   * the fluid no longer has to be violent to look joined up.
   */
  pushSegment(
    from: { x: number; y: number },
    to: { x: number; y: number },
    strength?: number,
  ): void;
  /** Advance and draw. Returns false once the fluid has settled and stopped. */
  frame(nowMs: number): boolean;
  setColour(colour: string): void;
  resize(): void;
  dispose(): void;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.trim().replace(/^#/u, "");
  const full =
    value.length === 3
      ? value[0] + value[0] + value[1] + value[1] + value[2] + value[2]
      : value;

  if (!/^[0-9a-f]{6}$/iu.test(full)) {
    return { r: 0.16, g: 0.61, b: 1 };
  }

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/**
 * How much colour one push carries.
 *
 * The dye accumulates: a slow hand puts many pushes in nearly the same place,
 * and at full strength that saturates into a solid blob -- a shape again,
 * which is the failure this whole approach replaced. Paired with the fade
 * above; see the measurements there.
 */
const DYE_STRENGTH = 0.36;

export function createFluidTrail(
  canvas: HTMLCanvasElement,
  options: FluidTrailOptions,
): FluidTrail | null {
  const params: WebGLContextAttributes = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };

  const gl =
    (canvas.getContext("webgl2", params) as WebGL2RenderingContext | null) ??
    (canvas.getContext("webgl", params) as WebGLRenderingContext | null);

  if (gl == null) {
    // No trail rather than a crash. Toki still works; it just does not draw
    // this, and the region it selected is shown either way.
    return null;
  }

  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext;
  const gl2 = gl as WebGL2RenderingContext;

  let halfFloat: OES_texture_half_float | null = null;
  let supportLinearFiltering: unknown = null;

  if (isWebGL2) {
    gl.getExtension("EXT_color_buffer_float");
    supportLinearFiltering = gl.getExtension("OES_texture_float_linear");
  } else {
    halfFloat = gl.getExtension("OES_texture_half_float");
    supportLinearFiltering = gl.getExtension("OES_texture_half_float_linear");
  }

  // Fully transparent, not black. This is drawn over somebody's screen.
  gl.clearColor(0, 0, 0, 0);

  const halfFloatTexType = isWebGL2
    ? gl2.HALF_FLOAT
    : (halfFloat?.HALF_FLOAT_OES ?? gl.UNSIGNED_BYTE);

  function supportsFormat(internalFormat: number, format: number, type: number) {
    const texture = gl!.createTexture();
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = gl!.createFramebuffer();
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );

    const ok = gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) === gl!.FRAMEBUFFER_COMPLETE;

    gl!.deleteFramebuffer(fbo);
    gl!.deleteTexture(texture);

    return ok;
  }

  function pickFormat(
    internalFormat: number,
    format: number,
    type: number,
  ): { internalFormat: number; format: number } {
    if (supportsFormat(internalFormat, format, type)) {
      return { internalFormat, format };
    }

    if (isWebGL2 && internalFormat === gl2.R16F) {
      return pickFormat(gl2.RG16F, gl2.RG, type);
    }

    if (isWebGL2 && internalFormat === gl2.RG16F) {
      return pickFormat(gl2.RGBA16F, gl!.RGBA, type);
    }

    return { internalFormat: gl!.RGBA, format: gl!.RGBA };
  }

  const formatRGBA = isWebGL2
    ? pickFormat(gl2.RGBA16F, gl.RGBA, halfFloatTexType)
    : { internalFormat: gl.RGBA, format: gl.RGBA };
  const formatRG = isWebGL2
    ? pickFormat(gl2.RG16F, gl2.RG, halfFloatTexType)
    : { internalFormat: gl.RGBA, format: gl.RGBA };
  const formatR = isWebGL2
    ? pickFormat(gl2.R16F, gl2.RED, halfFloatTexType)
    : { internalFormat: gl.RGBA, format: gl.RGBA };

  const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  /*
   * A shader that will not compile must not fail quietly.
   *
   * A failed compile still links into a usable-looking program that draws
   * absolutely nothing, so the symptom is a blank screen with no error --
   * indistinguishable from the simulation running and producing no colour.
   * Failures are collected and turned into "no trail" rather than "a trail
   * that does nothing".
   */
  const failures: string[] = [];

  function compile(type: number, source: string, keywords: string[] = []) {
    const prefix = keywords.map((word) => `#define ${word}\n`).join("");
    const shader = gl!.createShader(type)!;

    gl!.shaderSource(shader, prefix + source);
    gl!.compileShader(shader);

    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      failures.push(gl!.getShaderInfoLog(shader) ?? "shader failed to compile");
    }

    return shader;
  }

  function program(vertex: WebGLShader, fragment: WebGLShader) {
    const created = gl!.createProgram()!;

    gl!.attachShader(created, vertex);
    gl!.attachShader(created, fragment);
    // The quad is bound to attribute zero once, for every program, so each one
    // has to agree that zero is where the position lives. Left to the driver
    // that is usually true and occasionally not, and when it is not, the screen
    // is simply blank.
    gl!.bindAttribLocation(created, 0, "aPosition");
    gl!.linkProgram(created);

    if (!gl!.getProgramParameter(created, gl!.LINK_STATUS)) {
      failures.push(gl!.getProgramInfoLog(created) ?? "program failed to link");
    }

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const count = gl!.getProgramParameter(created, gl!.ACTIVE_UNIFORMS) as number;

    for (let i = 0; i < count; i += 1) {
      const name = gl!.getActiveUniform(created, i)!.name;
      uniforms[name] = gl!.getUniformLocation(created, name);
    }

    return { program: created, uniforms };
  }

  const baseVertex = compile(
    gl.VERTEX_SHADER,
    `precision highp float;
     attribute vec2 aPosition;
     varying vec2 vUv, vL, vR, vT, vB;
     uniform vec2 texelSize;
     void main () {
       vUv = aPosition * 0.5 + 0.5;
       vL = vUv - vec2(texelSize.x, 0.0);
       vR = vUv + vec2(texelSize.x, 0.0);
       vT = vUv + vec2(0.0, texelSize.y);
       vB = vUv - vec2(0.0, texelSize.y);
       gl_Position = vec4(aPosition, 0.0, 1.0);
     }`,
  );

  const clearProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision mediump float; precision mediump sampler2D;
       varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;
       void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
    ),
  );

  const splatProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision highp float; precision highp sampler2D;
       varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;
       uniform vec3 color; uniform vec2 point; uniform float radius;
       void main () {
         vec2 p = vUv - point.xy;
         p.x *= aspectRatio;
         vec3 splat = exp(-dot(p, p) / radius) * color;
         vec3 base = texture2D(uTarget, vUv).xyz;
         gl_FragColor = vec4(base + splat, 1.0);
       }`,
    ),
  );

  const advectionProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision highp float; precision highp sampler2D;
       varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
       uniform vec2 texelSize; uniform vec2 dyeTexelSize;
       uniform float dt; uniform float dissipation;
       vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
         vec2 st = uv / tsize - 0.5;
         vec2 iuv = floor(st); vec2 fuv = fract(st);
         vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
         vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
         vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
         vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
         return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
       }
       void main () {
         #ifdef MANUAL_FILTERING
           vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
           vec4 result = bilerp(uSource, coord, dyeTexelSize);
         #else
           vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
           vec4 result = texture2D(uSource, coord);
         #endif
         float decay = 1.0 + dissipation * dt;
         gl_FragColor = result / decay;
       }`,
      supportLinearFiltering ? [] : ["MANUAL_FILTERING"],
    ),
  );

  const divergenceProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision mediump float; precision mediump sampler2D;
       varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
       void main () {
         float L = texture2D(uVelocity, vL).x;
         float R = texture2D(uVelocity, vR).x;
         float T = texture2D(uVelocity, vT).y;
         float B = texture2D(uVelocity, vB).y;
         vec2 C = texture2D(uVelocity, vUv).xy;
         if (vL.x < 0.0) { L = -C.x; }
         if (vR.x > 1.0) { R = -C.x; }
         if (vT.y > 1.0) { T = -C.y; }
         if (vB.y < 0.0) { B = -C.y; }
         gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
       }`,
    ),
  );

  const curlProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision mediump float; precision mediump sampler2D;
       varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
       void main () {
         float L = texture2D(uVelocity, vL).y;
         float R = texture2D(uVelocity, vR).y;
         float T = texture2D(uVelocity, vT).x;
         float B = texture2D(uVelocity, vB).x;
         gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
       }`,
    ),
  );

  const vorticityProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision highp float; precision highp sampler2D;
       varying vec2 vUv, vL, vR, vT, vB;
       uniform sampler2D uVelocity; uniform sampler2D uCurl;
       uniform float curl; uniform float dt;
       void main () {
         float L = texture2D(uCurl, vL).x;
         float R = texture2D(uCurl, vR).x;
         float T = texture2D(uCurl, vT).x;
         float B = texture2D(uCurl, vB).x;
         float C = texture2D(uCurl, vUv).x;
         vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
         force /= length(force) + 0.0001;
         force *= curl * C;
         force.y *= -1.0;
         vec2 velocity = texture2D(uVelocity, vUv).xy;
         velocity += force * dt;
         velocity = min(max(velocity, -1000.0), 1000.0);
         gl_FragColor = vec4(velocity, 0.0, 1.0);
       }`,
    ),
  );

  const pressureProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision mediump float; precision mediump sampler2D;
       varying highp vec2 vUv, vL, vR, vT, vB;
       uniform sampler2D uPressure; uniform sampler2D uDivergence;
       void main () {
         float L = texture2D(uPressure, vL).x;
         float R = texture2D(uPressure, vR).x;
         float T = texture2D(uPressure, vT).x;
         float B = texture2D(uPressure, vB).x;
         float divergence = texture2D(uDivergence, vUv).x;
         gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
       }`,
    ),
  );

  const gradientProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision mediump float; precision mediump sampler2D;
       varying highp vec2 vUv, vL, vR, vT, vB;
       uniform sampler2D uPressure; uniform sampler2D uVelocity;
       void main () {
         float L = texture2D(uPressure, vL).x;
         float R = texture2D(uPressure, vR).x;
         float T = texture2D(uPressure, vT).x;
         float B = texture2D(uPressure, vB).x;
         vec2 velocity = texture2D(uVelocity, vUv).xy;
         velocity.xy -= vec2(R - L, T - B);
         gl_FragColor = vec4(velocity, 0.0, 1.0);
       }`,
    ),
  );

  /*
   * What is actually seen.
   *
   * Alpha comes from the brightest channel, so the ribbon is opaque where the
   * dye is dense and disappears entirely where it is not -- which is what lets
   * this sit over somebody's screen instead of over a black rectangle.
   */
  const displayProgram = program(
    baseVertex,
    compile(
      gl.FRAGMENT_SHADER,
      `precision highp float; precision highp sampler2D;
       varying vec2 vUv, vL, vR, vT, vB;
       uniform sampler2D uTexture; uniform vec2 texelSize;
       void main () {
         vec3 c = texture2D(uTexture, vUv).rgb;
         #ifdef SHADING
           vec3 lc = texture2D(uTexture, vL).rgb;
           vec3 rc = texture2D(uTexture, vR).rgb;
           vec3 tc = texture2D(uTexture, vT).rgb;
           vec3 bc = texture2D(uTexture, vB).rgb;
           float dx = length(rc) - length(lc);
           float dy = length(tc) - length(bc);
           vec3 n = normalize(vec3(dx, dy, length(texelSize)));
           float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
           c *= diffuse;
         #endif
         gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
       }`,
      fluidTrailPolicy.shading ? ["SHADING"] : [],
    ),
  );

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW,
  );

  const elements = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW,
  );
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target: Fbo | null, clear = false) {
    if (target == null) {
      gl!.viewport(0, 0, gl!.drawingBufferWidth, gl!.drawingBufferHeight);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    } else {
      gl!.viewport(0, 0, target.width, target.height);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.fbo);
    }

    if (clear) {
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
    }

    gl!.drawElements(gl!.TRIANGLES, 6, gl!.UNSIGNED_SHORT, 0);
  }

  const created: Fbo[] = [];

  function createFbo(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ): Fbo {
    gl!.activeTexture(gl!.TEXTURE0);

    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, param);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, param);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );
    gl!.viewport(0, 0, w, h);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    const target: Fbo = {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id: number) {
        gl!.activeTexture(gl!.TEXTURE0 + id);
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
        return id;
      },
    };

    created.push(target);

    return target;
  }

  function createDoubleFbo(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ): DoubleFbo {
    let first = createFbo(w, h, internalFormat, format, type, param);
    let second = createFbo(w, h, internalFormat, format, type, param);

    return {
      width: w,
      height: h,
      texelSizeX: first.texelSizeX,
      texelSizeY: first.texelSizeY,
      get read() {
        return first;
      },
      set read(value: Fbo) {
        first = value;
      },
      get write() {
        return second;
      },
      set write(value: Fbo) {
        second = value;
      },
      swap() {
        const temp = first;
        first = second;
        second = temp;
      },
    };
  }

  function resolutionFor(resolution: number) {
    const width = gl!.drawingBufferWidth;
    const height = gl!.drawingBufferHeight;
    const aspect = width > height ? width / height : height / width;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspect);

    return width > height
      ? { width: max, height: min }
      : { width: min, height: max };
  }

  let dye: DoubleFbo;
  let velocity: DoubleFbo;
  let divergence: Fbo;
  let curlField: Fbo;
  let pressure: DoubleFbo;

  function initFramebuffers() {
    const sim = resolutionFor(fluidTrailPolicy.simResolution);
    const dyeRes = resolutionFor(fluidTrailPolicy.dyeResolution);

    gl!.disable(gl!.BLEND);

    dye = createDoubleFbo(
      dyeRes.width,
      dyeRes.height,
      formatRGBA.internalFormat,
      formatRGBA.format,
      halfFloatTexType,
      filtering,
    );
    velocity = createDoubleFbo(
      sim.width,
      sim.height,
      formatRG.internalFormat,
      formatRG.format,
      halfFloatTexType,
      filtering,
    );
    divergence = createFbo(
      sim.width,
      sim.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      gl!.NEAREST,
    );
    curlField = createFbo(
      sim.width,
      sim.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      gl!.NEAREST,
    );
    pressure = createDoubleFbo(
      sim.width,
      sim.height,
      formatR.internalFormat,
      formatR.format,
      halfFloatTexType,
      gl!.NEAREST,
    );
  }

  let pixelRatio = Math.min(options.pixelRatio ?? window.devicePixelRatio ?? 1, 1.5);

  function sizeCanvas(): boolean {
    const width = Math.floor(canvas.clientWidth * pixelRatio);
    const height = Math.floor(canvas.clientHeight * pixelRatio);

    if (width === 0 || height === 0) {
      return false;
    }

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      return true;
    }

    return false;
  }

  if (failures.length > 0) {
    // No trail rather than a blank canvas pretending to be one. Toki still
    // works; the region it selected is shown either way.
    console.warn("Toki: fluid trail unavailable\n" + failures.join("\n"));
    return null;
  }

  sizeCanvas();
  initFramebuffers();

  let colour = hexToRgb(options.colour);
  let lastFrameMs = 0;
  let lastPushMs = 0;

  function step(dt: number) {
    gl!.disable(gl!.BLEND);

    gl!.useProgram(curlProgram.program);
    gl!.uniform2f(
      curlProgram.uniforms.texelSize!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl!.uniform1i(curlProgram.uniforms.uVelocity!, velocity.read.attach(0));
    blit(curlField);

    gl!.useProgram(vorticityProgram.program);
    gl!.uniform2f(
      vorticityProgram.uniforms.texelSize!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl!.uniform1i(vorticityProgram.uniforms.uVelocity!, velocity.read.attach(0));
    gl!.uniform1i(vorticityProgram.uniforms.uCurl!, curlField.attach(1));
    gl!.uniform1f(vorticityProgram.uniforms.curl!, fluidTrailPolicy.curl);
    gl!.uniform1f(vorticityProgram.uniforms.dt!, dt);
    blit(velocity.write);
    velocity.swap();

    gl!.useProgram(divergenceProgram.program);
    gl!.uniform2f(
      divergenceProgram.uniforms.texelSize!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl!.uniform1i(divergenceProgram.uniforms.uVelocity!, velocity.read.attach(0));
    blit(divergence);

    gl!.useProgram(clearProgram.program);
    gl!.uniform1i(clearProgram.uniforms.uTexture!, pressure.read.attach(0));
    gl!.uniform1f(clearProgram.uniforms.value!, fluidTrailPolicy.pressure);
    blit(pressure.write);
    pressure.swap();

    gl!.useProgram(pressureProgram.program);
    gl!.uniform2f(
      pressureProgram.uniforms.texelSize!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl!.uniform1i(pressureProgram.uniforms.uDivergence!, divergence.attach(0));

    for (let i = 0; i < fluidTrailPolicy.pressureIterations; i += 1) {
      gl!.uniform1i(pressureProgram.uniforms.uPressure!, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gl!.useProgram(gradientProgram.program);
    gl!.uniform2f(
      gradientProgram.uniforms.texelSize!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
    gl!.uniform1i(gradientProgram.uniforms.uPressure!, pressure.read.attach(0));
    gl!.uniform1i(gradientProgram.uniforms.uVelocity!, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    gl!.useProgram(advectionProgram.program);
    gl!.uniform2f(
      advectionProgram.uniforms.texelSize!,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );

    if (!supportLinearFiltering) {
      gl!.uniform2f(
        advectionProgram.uniforms.dyeTexelSize!,
        velocity.texelSizeX,
        velocity.texelSizeY,
      );
    }

    const velocityId = velocity.read.attach(0);
    gl!.uniform1i(advectionProgram.uniforms.uVelocity!, velocityId);
    gl!.uniform1i(advectionProgram.uniforms.uSource!, velocityId);
    gl!.uniform1f(advectionProgram.uniforms.dt!, dt);
    gl!.uniform1f(
      advectionProgram.uniforms.dissipation!,
      fluidTrailPolicy.velocityDissipation,
    );
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering) {
      gl!.uniform2f(
        advectionProgram.uniforms.dyeTexelSize!,
        dye.texelSizeX,
        dye.texelSizeY,
      );
    }

    gl!.uniform1i(advectionProgram.uniforms.uVelocity!, velocity.read.attach(0));
    gl!.uniform1i(advectionProgram.uniforms.uSource!, dye.read.attach(1));
    gl!.uniform1f(
      advectionProgram.uniforms.dissipation!,
      fluidTrailPolicy.densityDissipation,
    );
    blit(dye.write);
    dye.swap();
  }

  function draw() {
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);
    gl!.enable(gl!.BLEND);
    gl!.useProgram(displayProgram.program);
    gl!.uniform2f(
      displayProgram.uniforms.texelSize!,
      1 / gl!.drawingBufferWidth,
      1 / gl!.drawingBufferHeight,
    );
    gl!.uniform1i(displayProgram.uniforms.uTexture!, dye.read.attach(0));
    blit(null, true);
  }

  return {
    push(x, y, dx, dy, strength = 1) {
      const aspect = canvas.width / canvas.height;
      const radius =
        aspect > 1
          ? (fluidTrailPolicy.splatRadius / 100) * aspect
          : fluidTrailPolicy.splatRadius / 100;

      gl.useProgram(splatProgram.program);
      gl.uniform1i(splatProgram.uniforms.uTarget!, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio!, aspect);
      gl.uniform2f(
        splatProgram.uniforms.point!,
        x / canvas.clientWidth,
        // The canvas counts down from the top; the simulation counts up.
        1 - y / canvas.clientHeight,
      );
      gl.uniform3f(
        splatProgram.uniforms.color!,
        dx * fluidTrailPolicy.splatForce,
        dy * fluidTrailPolicy.splatForce,
        0,
      );
      gl.uniform1f(splatProgram.uniforms.radius!, radius);
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(splatProgram.uniforms.uTarget!, dye.read.attach(0));
      gl.uniform3f(
        splatProgram.uniforms.color!,
        colour.r * DYE_STRENGTH * strength,
        colour.g * DYE_STRENGTH * strength,
        colour.b * DYE_STRENGTH * strength,
      );
      blit(dye.write);
      dye.swap();

      lastPushMs = performance.now();
    },

    pushSegment(from, to, strength = 1) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);

      // One push per few pixels. Closer than this is spending fill rate on
      // colour that lands on top of itself.
      const stride = 7;
      const count = Math.max(1, Math.min(48, Math.ceil(distance / stride)));

      for (let i = 1; i <= count; i += 1) {
        const t = i / count;

        this.push(
          from.x + dx * t,
          from.y + dy * t,
          // Momentum is shared out, so the fluid is nudged the same amount
          // however finely the segment is divided.
          dx / Math.max(1, canvas.clientWidth) / count,
          -dy / Math.max(1, canvas.clientHeight) / count,
          // Colour is not. Dye is laid per unit of length, so a fast hand
          // covering more ground leaves the same density of trail as a slow
          // one -- dividing it made a long segment fainter than a short one,
          // which is a trail that dims exactly when it is moving fastest.
          strength,
        );
      }
    },

    frame(nowMs) {
      // Clamped, so a stall in another window does not advance the simulation
      // by a second in one step and blow the fluid across the screen.
      const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.016_666) || 0.016_666;
      lastFrameMs = nowMs;

      if (sizeCanvas()) {
        initFramebuffers();
      }

      step(dt);
      draw();

      // Keep going after the last push so the fluid fades out rather than
      // freezing mid-fade, then stop. This runs all day.
      if (nowMs - lastPushMs < fluidTrailPolicy.settleMs) {
        return true;
      }

      /*
       * Clear before letting go.
       *
       * Stopping the loop stops *rendering*, which is not the same as leaving
       * nothing behind: the last frame drawn stays on the canvas until
       * something draws over it. So a finished selection left a ghost of the
       * fluid sitting over somebody's work indefinitely.
       *
       * By this point the dye is below one part in 255 anyway, so there is
       * nothing visible to remove -- this is about the pixels, not the
       * simulation.
       */
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return false;
    },

    setColour(next) {
      colour = hexToRgb(next);
    },

    resize() {
      if (sizeCanvas()) {
        initFramebuffers();
      }
    },

    dispose() {
      for (const target of created) {
        gl.deleteFramebuffer(target.fbo);
        gl.deleteTexture(target.texture);
      }

      created.length = 0;
      gl.deleteBuffer(quad);
      gl.deleteBuffer(elements);
    },
  };
}
