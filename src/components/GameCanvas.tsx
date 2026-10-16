import { useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Phase, PlaneTransform } from '../hooks/useGameState'

interface GameCanvasProps {
  phase: Phase
  multiplier: number
  crashPoint: number
  waitProgress: number
  elapsedMs: number
  plane: PlaneTransform
  betMode: 'money' | 'freebet'
  onToggleBetMode: () => void
  freebetLocked?: boolean
  freebetAmount?: number
}

const PAD = { left: 28, right: 16, top: 20, bottom: 24 }  // Origin at (28, CH - 24) matching flight curve origin

/* ═══════════════════════════════════════════════════════════════════════════
   SMOOTH INTERPOLATION — lerp values for buttery animation
   ═══════════════════════════════════════════════════════════════════════════ */

function smoothDamp(current: number, target: number, velocity: { v: number }, smoothTime: number, deltaTime: number): number {
  const omega = 2 / smoothTime
  const x = omega * deltaTime
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (velocity.v + omega * change) * deltaTime
  velocity.v = (velocity.v - omega * temp) * exp
  return target + (change + temp) * exp
}

/* ═══════════════════════════════════════════════════════════════════════════
   BACKGROUND — dark with rotating sunburst rays from origin
   
   Rotation is tied to the game loop and accelerates with the multiplier.
   The bgRotationAngle accumulates each frame for smooth continuous rotation.
   ═══════════════════════════════════════════════════════════════════════════ */

function drawBackground(
  ctx: CanvasRenderingContext2D, 
  w: number, 
  h: number, 
  bgAngle: number,  // accumulated rotation angle in radians
  phase: string,
  multiplier: number = 1
) {
  // Dark background
  ctx.fillStyle = '#0e1115'
  ctx.fillRect(0, 0, w, h)

  const ox = PAD.left, oy = h - PAD.bottom
  const maxDist = Math.sqrt(w * w + h * h) * 1.2

  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, 0, w - ox, oy)
  ctx.clip()

  // Transform: translate to origin, rotate CLOCKWISE, then draw rays
  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(bgAngle)  // Positive angle = clockwise rotation
  
  // Dynamic ray intensity based on multiplier
  let rayOpacity = 0.04
  if (multiplier >= 15) {
    rayOpacity = 0.12  // 3x intensity for extreme danger
  } else if (multiplier >= 5) {
    rayOpacity = 0.08  // 2x intensity
  }
  
  // Draw rays from the rotated origin point - DYNAMIC INTENSITY
  for (let i = 0; i < 24; i++) {
    const a1 = (i / 24) * Math.PI * 2
    const a2 = ((i + 0.35) / 24) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a1) * maxDist, Math.sin(a1) * maxDist)
    ctx.lineTo(Math.cos(a2) * maxDist, Math.sin(a2) * maxDist)
    ctx.closePath()
    ctx.fillStyle = `rgba(255,255,255,${rayOpacity})`
    ctx.fill()
  }
  ctx.restore()
  
  ctx.restore()

  // Removed ambient glow for clean appearance
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATED DOTS on the axes (GREEN, moving toward origin 0,0)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawDots(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const ox = PAD.left, oy = h - PAD.bottom
  const bLen = w - PAD.left - PAD.right
  const lLen = h - PAD.top - PAD.bottom

  // Bottom axis dots (moving RIGHT to LEFT toward origin) - GREEN
  for (let i = 0; i < 12; i++) {
    const t = ((time * 0.00012 + i / 12) % 1)
    const pos = 1 - t  // reverse direction: move toward origin
    const fade = pos < 0.15 ? pos / 0.15 : 1  // fade as approaching origin
    ctx.beginPath()
    ctx.arc(ox + pos * bLen, oy + 8, 4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,230,120,${0.8 * fade})`
    ctx.fill()
  }
  
  // Left axis dots (moving TOP to BOTTOM toward origin) - GREEN
  // Position dots at PAD.left - 8 to keep them visible within the left margin
  const dotX = Math.max(6, PAD.left - 10)  // Ensure dots stay visible
  for (let i = 0; i < 6; i++) {
    const t = ((time * 0.00010 + i / 6) % 1)
    const pos = 1 - t  // reverse direction: move toward origin
    const fade = pos < 0.15 ? pos / 0.15 : 1  // fade as approaching origin
    ctx.beginPath()
    ctx.arc(dotX, oy - pos * lLen, 4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,230,120,${0.8 * fade})`
    ctx.fill()
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   AXES — subtle dark lines (Spribe style)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawAxes(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const ox = PAD.left, oy = h - PAD.bottom
  ctx.save()
  // Subtle dark axes
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(ox, PAD.top); ctx.lineTo(ox, oy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(w - PAD.right, oy); ctx.stroke()
  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════════════
   GREEN ASPIREBET-STYLE JET SPRITE & TRAJECTORY LINE
   ═══════════════════════════════════════════════════════════════════════════ */

// 1. Load the Green Aspirebet-style SVG as a ready-to-draw Image
const PLANE_SVG_STRING = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 50" width="110" height="50" fill="none">
  <defs>
    <linearGradient id="fg" x1="10" y1="18" x2="106" y2="34" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#14c953"/><stop offset="55%" stop-color="#26ef6d"/><stop offset="100%" stop-color="#6effa1"/>
    </linearGradient>
    <linearGradient id="sh" x1="28" y1="20" x2="102" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#9effbf" stop-opacity="0.9"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="bs" x1="12" y1="31" x2="92" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#055421"/><stop offset="100%" stop-color="#0b8f3a"/>
    </linearGradient>
  </defs>
  <path d="M46 26 L34 20 L41 19 L57 25 Z" fill="#08682b"/>
  <path d="M6 12 L19 12 L28 29 L11 31 Z" fill="url(#fg)"/>
  <path d="M6 12 L12 12 L23 29 L16 30 Z" fill="#0b963d"/>
  <path d="M1 12 C5 10, 17 10, 23 13 C17 14.5, 6 14.5, 1 12 Z" fill="#4df989"/>
  <path d="M12 26 L24 25 L22 31 L11 31 Z" fill="#065c25"/>
  <path d="M4 34 C22 38, 68 37, 106 28 C88 36, 40 40, 10 35 Z" fill="url(#bs)"/>
  <path d="M4 34 C16 27, 44 22, 76 21 C90 21, 100 24, 108 27 C96 32, 66 36, 10 35 Z" fill="url(#fg)"/>
  <path d="M22 25 C46 21, 76 21, 106 27 C86 24, 50 24, 22 26 Z" fill="url(#sh)"/>
  <path d="M80 22.3 C86 22.3, 92 23.8, 95 25.5 C90 26.2, 83 26.2, 78 25.2 Z" fill="#042911"/>
  <circle cx="70" cy="26.5" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <circle cx="62" cy="27.2" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <circle cx="54" cy="27.8" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <circle cx="46" cy="28.4" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <path d="M36 33 L64 30 L49 41 L26 42 Z" fill="#064e20"/>
  <path d="M38 32 L62 30 L46 38 L28 39 Z" fill="#14c352"/>
</svg>`

const greenJetImg = new Image()
if (typeof window !== 'undefined') {
  greenJetImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(PLANE_SVG_STRING)
}

// Exact tail-tip coordinates inside the 110x50 SVG (x=4, y=34)
const TAIL_ANCHOR_X = 4 / 110 // 0.0363
const TAIL_ANCHOR_Y = 34 / 50 // 0.6800
const JET_ASPECT = 110 / 50   // 2.2

/**
 * Call this inside requestAnimationFrame loop to render trajectory curve, shade, and locked jet.
 */
function renderFlightAndPlane(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  progress: number,
  timeMs: number,
  domPlaneEl: HTMLElement | null = null
) {
  // 1. Origin (0,0) point at bottom-left axis
  const startX = PAD.left
  const startY = canvasHeight - PAD.bottom

  // 2. Responsive plane size (longer than old plane, shorter than Aspirebet, safe on mobile)
  const planeWidth = Math.min(Math.max(canvasWidth * 0.115, 62), 104)
  const planeHeight = planeWidth / JET_ASPECT

  // 3. Max turbulence position (keeps turbulence at proper spot while guaranteeing
  //    the nose tip never crops on mobile edges)
  const rightMargin = 8
  const noseExtension = planeWidth * (1 - TAIL_ANCHOR_X)
  const maxTurbulenceX = Math.min(canvasWidth * 0.86, canvasWidth - noseExtension - rightMargin)
  const maxTurbulenceY = canvasHeight * 0.22

  // Clamp progress between 0 (at 0,0 rest) and 1 (turbulence cruise)
  const t = Math.max(0, Math.min(1, progress))

  // Smooth ease-out climb from (0,0) to the turbulence point
  const baseTipX = startX + (maxTurbulenceX - startX) * t
  const baseTipY = startY - (startY - maxTurbulenceY) * Math.pow(t, 0.85)

  // 4. Smooth, slow, small-height turbulence ONLY when reaching max height (t > 0.85)
  //    Blends in smoothly from 0 to 1 between t=0.85 and t=1.0 so there is zero sudden jump
  const turbulenceBlend = Math.max(0, Math.min(1, (t - 0.85) / 0.15))
  const slowBobY = Math.sin(timeMs * 0.0022) * 3.5 * turbulenceBlend
  const slowBobX = Math.cos(timeMs * 0.0016) * 1.5 * turbulenceBlend

  // 5. LOCKED TAIL TIP COORDINATE: Used by BOTH the trajectory line AND the plane tail
  const tipX = baseTipX + slowBobX
  const tipY = baseTipY + slowBobY

  // 6. Draw Trajectory Fill & Line (Only when t > 0 so at rest only the plane sits at 0,0)
  if (t > 0.001) {
    // Subtle Aspirebet upward curve control point
    const cpX = startX + (tipX - startX) * 0.54
    const cpY = startY - (startY - tipY) * 0.22

    // A. Translucent Green Area Under Curve
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY)
    ctx.lineTo(tipX, startY)
    ctx.closePath()

    const grad = ctx.createLinearGradient(0, tipY, 0, startY)
    grad.addColorStop(0, 'rgba(0, 231, 84, 0.38)')
    grad.addColorStop(1, 'rgba(0, 231, 84, 0.05)')
    ctx.fillStyle = grad
    ctx.fill()

    // B. Bright Green Trajectory Line Ending Exactly at (tipX, tipY)
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY)
    ctx.strokeStyle = '#19e660'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // 7. Draw the Plane with Tail Tip Locked to (tipX, tipY) and ZERO Angle Twisting
  const drawX = tipX - planeWidth * TAIL_ANCHOR_X
  const drawY = tipY - planeHeight * TAIL_ANCHOR_Y

  if (domPlaneEl) {
    domPlaneEl.style.width = `${planeWidth}px`
    domPlaneEl.style.height = `${planeHeight}px`
    domPlaneEl.style.left = `${drawX}px`
    domPlaneEl.style.top = `${drawY}px`
    domPlaneEl.style.transform = 'none'
  } else if (greenJetImg.complete) {
    ctx.drawImage(greenJetImg, drawX, drawY, planeWidth, planeHeight)
  }

  return { tipX, tipY, planeWidth, planeHeight, drawX, drawY }
}


/* ═══════════════════════════════════════════════════════════════════════════
   JSX OVERLAYS — bet toggle, network status, spinner
   ═══════════════════════════════════════════════════════════════════════════ */

function BetModeToggle({
  betMode,
  onToggle,
  freebetLocked = true,
  freebetAmount = 0
}: {
  betMode: 'money' | 'freebet'
  onToggle: () => void
  freebetLocked?: boolean
  freebetAmount?: number
}) {
  const base = 'h-7 rounded px-2.5 text-[11px] font-semibold transition-colors'
  return (
    <div
      role="group"
      aria-label="Bet wallet"
      className="flex origin-top-left scale-[0.833] rounded-md border border-line bg-page p-0.5 shadow-sm"
    >
      <button
        type="button"
        aria-pressed={betMode === 'money'}
        onClick={() => betMode !== 'money' && onToggle()}
        className={cn(base, betMode === 'money' ? 'bg-brand text-brand-ink' : 'text-ink-2 hover:text-ink')}
      >
        Money
      </button>
      <button
        type="button"
        aria-pressed={betMode === 'freebet'}
        onClick={() => betMode !== 'freebet' && onToggle()}
        className={cn(base, betMode === 'freebet' ? 'bg-brand text-brand-ink' : 'text-ink-2 hover:text-ink')}
        title={freebetLocked ? 'Deposit KSH 20+ to unlock bonus' : `Freebet: KSH ${freebetAmount > 0 ? freebetAmount.toFixed(0) : '0'}`}
      >
        Freebet
        {!freebetLocked && freebetAmount > 0 && (
          <span className="ml-1 tabular-nums opacity-80">({freebetAmount.toFixed(0)})</span>
        )}
      </button>
    </div>
  )
}

function NetworkStatus() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-2">
      <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
      <span>Online</span>
    </div>
  )
}

function NautilusSpinner() {
  const blades = 9, cx = 32, cy = 32
  return (
    <svg style={{ animationDuration: '1.6s', animationDirection: 'reverse' }}
      className="animate-spin size-14 sm:size-20" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {Array.from({ length: blades }, (_, i) => {
        const step = (Math.PI * 2) / blades
        const a0 = step * i, a1 = step * i + step * 0.88
        const [iR, oR, omR, imR] = [5, 28, 22, 10]
        const la = a1 - a0 > Math.PI ? 1 : 0
        const al = 0.6 + (i / blades) * 0.4
        return (
          <path key={i} fill="#00C74D" opacity={al}
            d={[
              `M ${(cx+iR*Math.cos(a0)).toFixed(2)} ${(cy+iR*Math.sin(a0)).toFixed(2)}`,
              `L ${(cx+oR*Math.cos(a0)).toFixed(2)} ${(cy+oR*Math.sin(a0)).toFixed(2)}`,
              `A ${oR} ${oR} 0 ${la} 1 ${(cx+oR*Math.cos(a1)).toFixed(2)} ${(cy+oR*Math.sin(a1)).toFixed(2)}`,
              `Q ${(cx+omR*Math.cos(a0+step*0.6)).toFixed(2)} ${(cy+omR*Math.sin(a0+step*0.6)).toFixed(2)} ${(cx+imR*Math.cos(a0+step*0.2)).toFixed(2)} ${(cy+imR*Math.sin(a0+step*0.2)).toFixed(2)}`,
              `L ${(cx+iR*Math.cos(a1)).toFixed(2)} ${(cy+iR*Math.sin(a1)).toFixed(2)}`,
              `A ${iR} ${iR} 0 ${la} 0 ${(cx+iR*Math.cos(a0)).toFixed(2)} ${(cy+iR*Math.sin(a0)).toFixed(2)}`,
              'Z',
            ].join(' ')} />
        )
      })}
      <circle cx={cx} cy={cy} r="5.5" fill="#00C74D" />
      <circle cx={cx} cy={cy} r="3" fill="#0e1115" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — the render loop orchestrating all 4 game states
   
   WAITING  → plane sits at origin, pitched 30° up. No curve.
   FLYING   → curve draws, plane rides the tip following the tangent.
              Subtle turbulence bounce on the plane at high multipliers.
   CRASHING → curve freezes, plane shoots off along its last tangent.
   CRASHED  → frozen curve + "Flew away" overlay in red.
   ═══════════════════════════════════════════════════════════════════════════ */

export function GameCanvas({
  phase, multiplier, crashPoint, waitProgress, elapsedMs, plane, betMode, onToggleBetMode,
  freebetLocked = true, freebetAmount = 0,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)

  // Store props in refs for stable render callback (avoids recreating on every prop change)
  const propsRef = useRef({ phase, elapsedMs, multiplier, plane })
  propsRef.current = { phase, elapsedMs, multiplier, plane }

  // Smooth progress state for buttery plane movement
  const smoothRef = useRef({
    progress: 0,
    initialized: false,
  })

  // Persistent flyaway state across frames (survives re-renders)
  const flyRef = useRef({
    active: false,
    x: 0, y: 0,         // starting pixel position
    t0: 0,               // timestamp when crash started
  })

  // Last valid flight position to start flyaway accurately
  const lastPosRef = useRef({ x: 0, y: 0 })

  // Background rotation state - accumulates angle each frame
  // Tied to the same RAF loop as the plane for perfect sync
  const bgRotationRef = useRef({
    angle: 0,           // accumulated rotation angle (radians)
    lastTime: 0,        // last frame timestamp for delta calculation
  })

  const render = useCallback((time: number = 0) => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    // Read current props from ref (stable reference)
    const { phase, elapsedMs, multiplier } = propsRef.current

    const CW = cvs.clientWidth, CH = cvs.clientHeight
    if (!CW || !CH) { rafRef.current = requestAnimationFrame(render); return }

    // HiDPI
    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(CW * dpr), ph = Math.round(CH * dpr)
    if (cvs.width !== pw || cvs.height !== ph) {
      cvs.width = pw; cvs.height = ph
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    ctx.clearRect(0, 0, CW, CH)

    // ═══════════════ BACKGROUND ROTATION CALCULATION ═══════════════════
    const bgDeltaTime = bgRotationRef.current.lastTime > 0 
      ? Math.min((time - bgRotationRef.current.lastTime) / 1000, 0.1) 
      : 0.016
    bgRotationRef.current.lastTime = time

    const BASE_ROTATION_SPEED = 0.162
    let rotationSpeed = BASE_ROTATION_SPEED
    if (phase === 'flying') {
      if (multiplier >= 15) {
        rotationSpeed = BASE_ROTATION_SPEED * 5
      } else if (multiplier >= 5) {
        rotationSpeed = BASE_ROTATION_SPEED * 3
      } else {
        rotationSpeed = BASE_ROTATION_SPEED * 2
      }
    }

    bgRotationRef.current.angle += rotationSpeed * bgDeltaTime
    if (bgRotationRef.current.angle > Math.PI * 200) {
      bgRotationRef.current.angle -= Math.PI * 200
    }

    // Draw background with dynamic rotation and multiplier
    drawBackground(ctx, CW, CH, bgRotationRef.current.angle, phase, multiplier)
    drawAxes(ctx, CW, CH)
    drawDots(ctx, CW, CH, time)

    // ═══════════════ WAITING ═══════════════════════════════════════════
    if (phase === 'waiting') {
      flyRef.current.active = false
      smoothRef.current.initialized = false
      smoothRef.current.progress = 0

      // Plane sits resting near origin (0,0) on the runway
      const info = renderFlightAndPlane(ctx, CW, CH, 0, time)
      lastPosRef.current = { x: info.tipX, y: info.tipY }
    }

    // ═══════════════ FLYING ════════════════════════════════════════════
    if (phase === 'flying') {
      flyRef.current.active = false

      const deltaTime = lastTimeRef.current > 0 ? Math.min((time - lastTimeRef.current) / 1000, 0.1) : 0.016
      lastTimeRef.current = time

      // Flight progress from 0.0 (takeoff) to 1.0 (max turbulence cruise point)
      const flightDuration = 8000
      const targetProgress = Math.min(1, elapsedMs / flightDuration)

      const sm = smoothRef.current
      if (!sm.initialized || elapsedMs < 50) {
        sm.progress = targetProgress
        sm.initialized = true
      } else {
        const smoothFactor = Math.min(1, deltaTime * 12)
        sm.progress += (targetProgress - sm.progress) * smoothFactor
      }

      const info = renderFlightAndPlane(ctx, CW, CH, sm.progress, time)
      lastPosRef.current = { x: info.tipX, y: info.tipY }
    }

    // ═══════════════ CRASHING / CRASHED ════════════════════════════════
    if (phase === 'crashing' || phase === 'crashed') {
      const fa = flyRef.current

      if (!fa.active) {
        fa.active = true
        fa.x = lastPosRef.current.x || (CW * 0.7)
        fa.y = lastPosRef.current.y || (CH * 0.22)
        fa.t0 = time
      }

      const dt = (time - fa.t0) / 16.67
      const speed = 32
      const flyX = fa.x + speed * dt * 1.5
      const flyY = fa.y - speed * dt * 0.75

      if (flyX < CW + 150 && flyY > -150) {
        const planeWidth = Math.min(Math.max(CW * 0.115, 62), 104)
        const planeHeight = planeWidth / JET_ASPECT
        const drawX = flyX - planeWidth * TAIL_ANCHOR_X
        const drawY = flyY - planeHeight * TAIL_ANCHOR_Y
        if (greenJetImg.complete) {
          ctx.drawImage(greenJetImg, drawX, drawY, planeWidth, planeHeight)
        }
      }
    }

    rafRef.current = requestAnimationFrame(render)
  }, [])  // Empty deps - render reads from refs, runs continuously

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [render])

  const isCrashed = phase === 'crashed' || phase === 'crashing'

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ display: 'block' }} />

      {/* Top bar: wallet toggle bordering vertical Y-axis (x=28px) edge-to-edge, with online status below */}
      <div className="absolute left-[28px] top-2 z-10 flex flex-col items-start gap-1">
        <BetModeToggle
          betMode={betMode}
          onToggle={onToggleBetMode}
          freebetLocked={freebetLocked}
          freebetAmount={freebetAmount}
        />
        <NetworkStatus />
      </div>

      {/* Waiting for the next round */}
      {phase === 'waiting' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" role="status">
          <NautilusSpinner />
          <div className="text-center">
            <div className="text-sm font-medium text-ink">Waiting for next round</div>
            <div className="mx-auto mt-2 h-1 w-36 overflow-hidden rounded-full bg-raised sm:w-44">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${waitProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Live multiplier */}
      {phase === 'flying' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="font-bold leading-none tabular-nums text-ink"
            style={{ fontSize: 'clamp(3rem, 16vw, 6.5rem)', letterSpacing: '-0.02em' }}
          >
            {multiplier.toFixed(2)}<span className="ml-0.5 text-[0.6em] sm:ml-1">x</span>
          </div>
        </div>
      )}

      {/* Crashed */}
      {isCrashed && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-1 text-sm font-medium text-loss sm:mb-2">Flew away</div>
            <div
              className="font-bold leading-none tabular-nums text-loss"
              style={{ fontSize: 'clamp(3rem, 16vw, 6.5rem)', letterSpacing: '-0.02em' }}
            >
              {crashPoint > 0 ? crashPoint.toFixed(2) : multiplier.toFixed(2)}<span className="ml-0.5 text-[0.6em] sm:ml-1">x</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
