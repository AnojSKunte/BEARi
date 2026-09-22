import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { OutfitStyle } from '@shared/types'
import type { Pose } from '../engine/pose'
import { RigController } from './animate'
import type { ReachTarget } from './animate'
import type { Mat, RigData } from './rig'
import { MESH_STRIDE, matApply, matMul } from './rig'
import rigsJson from '../rig-mesh.json'

/**
 * BEARi's real-time renderer.
 *
 * Her painted layers are drawn as skinned triangle meshes on the GPU: the
 * vertex shader blends up to four bone matrices per vertex, so the art bends
 * continuously instead of pivoting as rigid pieces. Her eyelids, mouth,
 * blush and hand props are drawn in an SVG overlay whose transform is taken
 * straight from the skeleton, so they travel exactly with the head and hand.
 */

const RIGS = rigsJson as unknown as Record<string, RigData>
const LAYER_ORDER = ['body', 'hair', 'head', 'arm-l', 'arm-r']

const VERT = `#version 300 es
in vec2 aPos;
in vec2 aUV;
in vec4 aBone;
in vec4 aWeight;
uniform mat3 uBones[24];
uniform vec4 uView;   // scale, centerX, floorY, mirror
uniform vec2 uSize;   // canvas px
uniform vec2 uAnchor; // figure centerX, feetY
out vec2 vUV;
void main() {
  vec3 p = vec3(aPos, 1.0);
  vec3 acc = vec3(0.0);
  acc += aWeight.x * (uBones[int(aBone.x)] * p);
  acc += aWeight.y * (uBones[int(aBone.y)] * p);
  acc += aWeight.z * (uBones[int(aBone.z)] * p);
  acc += aWeight.w * (uBones[int(aBone.w)] * p);
  float sx = (acc.x - uAnchor.x) * uView.x * uView.w + uView.y;
  float sy = (acc.y - uAnchor.y) * uView.x + uView.z;
  gl_Position = vec4((sx / uSize.x) * 2.0 - 1.0, 1.0 - (sy / uSize.y) * 2.0, 0.0, 1.0);
  vUV = aUV;
}`

const FRAG = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uAlpha;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUV);
  outColor = c * uAlpha;
}`

function compile(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[BEARi] shader:', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

interface GpuLayer {
  name: string
  vao: WebGLVertexArrayObject
  count: number
  tex: WebGLTexture
}

/** Which action wants a hand placed exactly on the face. */
function reachFor(pose: Pose): [ReachTarget, ReachTarget] {
  if (pose.mode === 'think') return ['none', 'chin']
  if (pose.action === 'coffee' && pose.propPhase > 0.6) return ['none', 'none']
  return ['none', 'none']
}

export function MeshBeari({
  pose,
  style,
  onFail
}: {
  pose: Pose
  style: OutfitStyle
  onFail?: () => void
}): JSX.Element | null {
  const rig = RIGS[style] ?? RIGS.kurta
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<SVGGElement>(null)
  const propRef = useRef<SVGGElement>(null)
  const lidLRef = useRef<SVGPathElement>(null)
  const lidRRef = useRef<SVGPathElement>(null)
  const mouthRef = useRef<SVGGElement>(null)
  const blushLRef = useRef<SVGEllipseElement>(null)
  const blushRRef = useRef<SVGEllipseElement>(null)
  const poseRef = useRef(pose)
  poseRef.current = pose
  const [failed, setFailed] = useState(false)
  const [size, setSize] = useState({ w: 220, h: 250 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    let raf = 0
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!gl) {
      setFailed(true)
      onFail?.()
      return
    }

    const vs = compile(gl, VERT, gl.VERTEX_SHADER)
    const fs = compile(gl, FRAG, gl.FRAGMENT_SHADER)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) {
      setFailed(true)
      onFail?.()
      return
    }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.bindAttribLocation(prog, 1, 'aUV')
    gl.bindAttribLocation(prog, 2, 'aBone')
    gl.bindAttribLocation(prog, 3, 'aWeight')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[BEARi] link:', gl.getProgramInfoLog(prog))
      setFailed(true)
      onFail?.()
      return
    }
    gl.useProgram(prog)
    const uBones = gl.getUniformLocation(prog, 'uBones[0]')
    const uView = gl.getUniformLocation(prog, 'uView')
    const uSize = gl.getUniformLocation(prog, 'uSize')
    const uAnchor = gl.getUniformLocation(prog, 'uAnchor')
    const uAlpha = gl.getUniformLocation(prog, 'uAlpha')

    const layers: GpuLayer[] = []
    let pending = 0
    for (const name of LAYER_ORDER) {
      const l = rig.layers.find((x) => x.name === name)
      if (!l) continue
      const vao = gl.createVertexArray()
      const vbo = gl.createBuffer()
      const ibo = gl.createBuffer()
      const tex = gl.createTexture()
      if (!vao || !vbo || !ibo || !tex) continue
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(l.verts), gl.STATIC_DRAW)
      const stride = MESH_STRIDE * 4
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16)
      gl.enableVertexAttribArray(3)
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 32)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(l.indices), gl.STATIC_DRAW)
      gl.bindVertexArray(null)

      // 1×1 placeholder until the art loads, so the first frames are silent
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

      pending++
      const img = new Image()
      img.onload = () => {
        if (disposed) return
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        pending--
      }
      img.onerror = () => {
        pending--
        if (!disposed) {
          setFailed(true)
          onFail?.()
        }
      }
      img.src = `./rig/mesh/${rig.style}/${l.file}`
      layers.push({ name, vao, count: l.indices.length, tex })
    }
    if (!layers.length) {
      setFailed(true)
      onFail?.()
      return
    }

    const ctrl = new RigController(rig)
    const boneBuf = new Float32Array(24 * 9)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    const onLost = (e: Event): void => {
      e.preventDefault()
      setFailed(true)
      onFail?.()
    }
    canvas.addEventListener('webglcontextlost', onLost)

    let last = performance.now()
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      if (disposed) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const p = poseRef.current
      const [rl, rr] = reachFor(p)
      ctrl.update(p, dt, rl, rr)

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cssW = canvas.clientWidth || 220
      const cssH = canvas.clientHeight || 250
      const pxW = Math.round(cssW * dpr)
      const pxH = Math.round(cssH * dpr)
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW
        canvas.height = pxH
      }
      gl.viewport(0, 0, pxW, pxH)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (pending > 0) return

      // ---- figure → canvas mapping (in CSS px, scaled by dpr)
      const f = rig.figure
      const targetH = cssH * 0.94
      const scale = (targetH / (f.feetY - f.headTop)) * dpr
      const mirror = p.facing === -1 ? -1 : 1
      const cx = (cssW / 2) * dpr
      const floor = (cssH - 4) * dpr

      for (let i = 0; i < rig.bones.length && i < 24; i++) {
        const m = ctrl.rt[i].skin
        const o = i * 9
        boneBuf[o] = m[0]
        boneBuf[o + 1] = m[1]
        boneBuf[o + 2] = 0
        boneBuf[o + 3] = m[2]
        boneBuf[o + 4] = m[3]
        boneBuf[o + 5] = 0
        boneBuf[o + 6] = m[4]
        boneBuf[o + 7] = m[5]
        boneBuf[o + 8] = 1
      }
      gl.useProgram(prog)
      gl.uniformMatrix3fv(uBones, false, boneBuf)
      gl.uniform4f(uView, scale, cx, floor, mirror)
      gl.uniform2f(uSize, pxW, pxH)
      gl.uniform2f(uAnchor, f.centerX, f.feetY)
      gl.uniform1f(uAlpha, 1)
      for (const l of layers) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, l.tex)
        gl.bindVertexArray(l.vao)
        gl.drawElements(gl.TRIANGLES, l.count, gl.UNSIGNED_SHORT, 0)
      }
      gl.bindVertexArray(null)

      // ---- SVG overlay: face + props ride the skeleton exactly
      const toCanvas: Mat = [(scale * mirror) / dpr, 0, 0, scale / dpr, cx / dpr - (f.centerX * scale * mirror) / dpr, floor / dpr - (f.feetY * scale) / dpr]
      const head = ctrl.rt[rig.bones.findIndex((b) => b.name === 'head')]
      if (head && overlayRef.current) {
        const m = matMul(toCanvas, head.skin)
        overlayRef.current.setAttribute('transform', `matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]})`)
      }
      const face = rig.face
      const happy = p.emotion === 'happy' || p.emotion === 'excited' || p.emotion === 'celebrating'
      const squint = p.emotion === 'blushing' ? 0.2 : happy ? 0.1 : p.emotion === 'sleepy' ? 0.35 : 0
      const blink = Math.max(0, Math.min(1, 1 - p.eyeOpen + squint))
      const lid = (cxp: number, cyp: number): string => {
        if (blink < 0.03) return ''
        const rx = face.eyeRx
        const ry = face.eyeRy
        const top = -ry
        const coverY = top + blink * ry * 2
        const right: string[] = []
        const left: string[] = []
        for (let s = 0; s <= 10; s++) {
          const yy = top + (coverY - top) * (s / 10)
          const xx = rx * Math.sqrt(Math.max(0, 1 - (yy / ry) ** 2))
          right.push(`${(cxp + xx).toFixed(1)},${(cyp + yy).toFixed(1)}`)
          left.push(`${(cxp - xx).toFixed(1)},${(cyp + yy).toFixed(1)}`)
        }
        return `M ${right.join(' L ')} L ${left.reverse().join(' L ')} Z`
      }
      lidLRef.current?.setAttribute('d', lid(face.eyeL.x, face.eyeL.y))
      lidRRef.current?.setAttribute('d', lid(face.eyeR.x, face.eyeR.y))
      const blushA = p.emotion === 'blushing' ? 0.95 : happy ? 0.5 : 0.12
      blushLRef.current?.setAttribute('opacity', String(blushA))
      blushRRef.current?.setAttribute('opacity', String(blushA))
      const talk = p.talking ? Math.sin(now / 88) * 0.5 + 0.5 : p.mouth === 'openSmile' ? 1 : 0
      const mouthEl = mouthRef.current
      if (mouthEl) {
        const s = f.h * 0.00055
        mouthEl.setAttribute(
          'transform',
          `translate(${face.mouth.x} ${face.mouth.y}) scale(${(s * (0.9 + talk * 0.2)).toFixed(3)} ${(s * Math.max(0.001, talk)).toFixed(3)})`
        )
        mouthEl.setAttribute('opacity', Math.min(1, talk * 2.2).toFixed(2))
      }
      // prop follows the actual hand
      const foreIdx = rig.bones.findIndex((b) => b.name === 'foreArmR')
      const fore = ctrl.rt[foreIdx]
      if (fore && propRef.current) {
        const len = Math.hypot(fore.def.tail.x - fore.def.head.x, fore.def.tail.y - fore.def.head.y)
        const hand = matApply(fore.world, len, 0)
        const hp = matApply(toCanvas, hand.x, hand.y)
        const k = (scale / dpr) * (f.h * 0.0016)
        propRef.current.setAttribute('transform', `translate(${hp.x.toFixed(1)} ${hp.y.toFixed(1)}) scale(${k.toFixed(3)})`)
        propRef.current.setAttribute('opacity', String(p.prop === 'mug' || p.prop === 'wand' ? p.propPhase : 0))
      }
    }
    raf = requestAnimationFrame(loop)

    const onResize = (): void => setSize({ w: canvas.clientWidth, h: canvas.clientHeight })
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('webglcontextlost', onLost)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig])

  if (failed) return null

  const face = rig.face
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <defs>
          <radialGradient id="mblush">
            <stop offset="0%" stopColor="#F49BA5" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F49BA5" stopOpacity="0" />
          </radialGradient>
          <filter id="mlid" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        </defs>
        {/* face parts live in FIGURE coordinates; the group carries the head bone */}
        <g ref={overlayRef}>
          <ellipse ref={blushLRef} cx={face.blushL.x} cy={face.blushL.y} rx={face.eyeRx * 0.85} ry={face.eyeRx * 0.5} fill="url(#mblush)" opacity="0.12" />
          <ellipse ref={blushRRef} cx={face.blushR.x} cy={face.blushR.y} rx={face.eyeRx * 0.85} ry={face.eyeRx * 0.5} fill="url(#mblush)" opacity="0.12" />
          <g filter="url(#mlid)">
            <path ref={lidLRef} d="" fill={rig.skin} />
            <path ref={lidRRef} d="" fill={rig.skin} />
          </g>
          <g ref={mouthRef} opacity="0">
            <path d="M-7.5,-2.6 Q0,0 7.5,-2.6 C8,5.5 4.4,9.5 0,9.5 C-4.4,9.5 -8,5.5 -7.5,-2.6 Z" fill="#7E3D46" />
            <path d="M-6.6,-1.6 Q0,0.4 6.6,-1.6 L6.2,1.4 Q0,3 -6.2,1.4 Z" fill="#FFFFFF" />
            <ellipse cx="0" cy="6.3" rx="3.6" ry="2.3" fill="#E4707F" />
          </g>
        </g>
        <g ref={propRef} opacity="0">
          <g transform="translate(0 2)">
            <path d="M-6.5,-9 L6.5,-9 L5.6,3.5 Q0,5.5 -5.6,3.5 Z" fill="#C9A2E0" />
            <ellipse cx="0" cy="-9" rx="6.5" ry="2.2" fill="#8A6A52" />
            <path d="M6,-6.5 Q11,-6 10,-1.5 Q9.4,1.5 5.4,1.5" fill="none" stroke="#C9A2E0" strokeWidth="2.4" />
          </g>
        </g>
      </svg>
    </div>
  )
}
