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

const PAD = { left: 14, right: 8, top: 10, bottom: 14 } // Origin (0,0) at (14, CH - 14)

/* ═══════════════════════════════════════════════════════════════════════════
   BACKGROUND — dark with rotating sunburst rays from origin
   ═══════════════════════════════════════════════════════════════════════════ */

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgAngle: number,
  phase: string,
  multiplier: number = 1
) {
  ctx.fillStyle = '#0e1115'
  ctx.fillRect(0, 0, w, h)

  const ox = PAD.left, oy = h - PAD.bottom
  const maxDist = Math.sqrt(w * w + h * h) * 1.2

  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, 0, w - ox, oy)
  ctx.clip()

  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(bgAngle)

  let rayOpacity = 0.04
  if (multiplier >= 15) {
    rayOpacity = 0.12
  } else if (multiplier >= 5) {
    rayOpacity = 0.08
  }

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
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATED DOTS on the axes (GREEN, moving toward origin 0,0)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawDots(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const ox = PAD.left, oy = h - PAD.bottom
  const bLen = w - PAD.left - PAD.right
  const lLen = h - PAD.top - PAD.bottom

  for (let i = 0; i < 12; i++) {
    const t = (time * 0.00012 + i / 12) % 1
    const pos = 1 - t
    const fade = pos < 0.15 ? pos / 0.15 : 1
    ctx.beginPath()
    ctx.arc(ox + pos * bLen, oy + 7, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,230,120,${0.8 * fade})`
    ctx.fill()
  }

  const dotX = Math.max(5, PAD.left - 8)
  for (let i = 0; i < 6; i++) {
    const t = (time * 0.00010 + i / 6) % 1
    const pos = 1 - t
    const fade = pos < 0.15 ? pos / 0.15 : 1
    ctx.beginPath()
    ctx.arc(dotX, oy - pos * lLen, 3.5, 0, Math.PI * 2)
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
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(ox, PAD.top); ctx.lineTo(ox, oy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(w - PAD.right, oy); ctx.stroke()
  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════════════
   GREEN ASPIREBET-STYLE JET SPRITE (TAIL-TIP ANCHORED AT x=3.5, y=33)
   ═══════════════════════════════════════════════════════════════════════════ */

const PLANE_SVG_STRING = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 46" width="120" height="46" fill="none">
  <defs>
    <linearGradient id="fg" x1="3" y1="20" x2="116" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#19e660"/>
      <stop offset="50%" stop-color="#24eb68"/>
      <stop offset="100%" stop-color="#68ff9c"/>
    </linearGradient>
    <linearGradient id="sh" x1="24" y1="20" x2="112" y2="26" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#a2ffc2" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="bs" x1="3" y1="30" x2="105" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0a7830"/>
      <stop offset="100%" stop-color="#0c943c"/>
    </linearGradient>
  </defs>

  <!-- Far-side wing tip -->
  <path d="M52 25 L40 19 L47 18 L63 24 Z" fill="#08682b"/>

  <!-- Swept Vertical Tail Fin rising directly from the rear tail cone -->
  <path d="M4 11 L16 11 L26 28 L5 32.3 Z" fill="url(#fg)"/>
  <path d="M4 11 L10 11 L21 28 L12 30 Z" fill="#0b963d"/>

  <!-- T-Tail Top Horizontal Stabilizer -->
  <path d="M1 11 C4 9, 15 9, 21 11.5 C15 13, 5 13, 1 11 Z" fill="#4df989"/>

  <!-- Rear Side Engine Pod -->
  <path d="M18 25 L31 24 L29 29.5 L17 29.5 Z" fill="#065c25"/>

  <!-- Underbelly Shadow Hull (Tapers to exact rear tail tip x=3, y=32.2..33.8) -->
  <path d="M3 33.8 C22 36, 74 35, 117 26 C96 33, 46 37, 3 33.8 Z" fill="url(#bs)"/>

  <!-- Main Horizontal Fuselage (Tapers to exact rear tail tip x=3, y=32.2..33.8) -->
  <path d="M3 32.2 C14 27, 46 21, 82 20 C97 20, 109 22.5, 117 26 C103 30.5, 70 34, 3 33.8 Z" fill="url(#fg)"/>

  <!-- Upper Fuselage Highlight -->
  <path d="M20 25 C48 20.5, 82 20.5, 114 25.5 C92 23, 52 23, 20 26 Z" fill="url(#sh)"/>

  <!-- Dark Cockpit Windshield -->
  <path d="M87 21 C93 21, 99 22.4, 103 24.2 C97 25, 90 25, 85 24 Z" fill="#042911"/>

  <!-- 4 Circular Cabin Windows (Aspirebet Style) -->
  <circle cx="76" cy="25.5" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <circle cx="67" cy="26.2" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <circle cx="58" cy="26.8" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>
  <circle cx="49" cy="27.4" r="2" fill="#042911" stroke="#63ff9c" stroke-width="0.6"/>

  <!-- Swept Foreground Wing -->
  <path d="M42 31 L70 28.5 L54 37.5 L31 38 Z" fill="#064e20"/>
  <path d="M44 30 L68 28.5 L51 35.5 L33 36 Z" fill="#14c352"/>
</svg>`

const greenJetImg = new Image()
if (typeof window !== 'undefined') {
  greenJetImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(PLANE_SVG_STRING)
}

// Exact rear tail-cone tip inside the 120x46 SVG is centered at (x=3.5, y=33)
const TAIL_ANCHOR_X = 3.5 / 120
const TAIL_ANCHOR_Y = 33 / 46
const JET_ASPECT = 120 / 46

/**
 * Renders the trajectory curve, rich emerald shade, and horizontal green jet with
 * a tapered trajectory line synced to the exact pixel thickness of the rear tail tip.
 */
function renderFlightAndPlane(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  progress: number,
  timeMs: number
) {
  // 1. Origin (0,0) point at bottom-left axis intersection
  const startX = PAD.left
  const startY = canvasHeight - PAD.bottom

  // 2. Responsive jet dimensions
  const planeWidth = Math.min(Math.max(canvasWidth * 0.125, 66), 112)
  const planeHeight = (planeWidth / JET_ASPECT) * 1.015

  // 3. Max turbulence coordinate — safe on mobile screen edges
  const rightMargin = 10
  const noseExtension = planeWidth * (1 - TAIL_ANCHOR_X)
  const maxTurbulenceX = Math.min(canvasWidth * 0.84, canvasWidth - noseExtension - rightMargin)
  const maxTurbulenceY = Math.max(PAD.top + planeHeight * 0.8, canvasHeight * 0.23)

  // Clamp progress between 0.0 (resting at 0,0) and 1.0 (turbulence cruise)
  const t = Math.max(0, Math.min(1, progress))

  // 4. Smooth runway takeoff & climb
  const easeX = 1 - Math.pow(1 - t, 1.15)
  const easeY = Math.pow(t, 1.35)

  const baseTipX = startX + (maxTurbulenceX - startX) * easeX
  const baseTipY = startY - (startY - maxTurbulenceY) * easeY

  // 5. Smooth, slow, small-height turbulence ONLY when reaching the turbulence area (t > 0.85)
  const rawBlend = Math.max(0, Math.min(1, (t - 0.85) / 0.15))
  const turbulenceBlend = rawBlend * rawBlend * (3 - 2 * rawBlend)

  const slowBobY = Math.sin(timeMs * 0.0018) * 3.5 * turbulenceBlend
  const slowBobX = Math.cos(timeMs * 0.0012) * 0.95 * turbulenceBlend

  // 6. SINGLE LOCKED TAIL-TIP COORDINATE used by BOTH the trajectory line AND the plane tail
  const tipX = baseTipX + slowBobX
  const tipY = baseTipY + slowBobY

  // 7. Draw Rich Green Trajectory Fill & Tapered Line Syncing with Rear Tail Tip Size
  if (t > 0.001) {
    const cpX = startX + (tipX - startX) * 0.52
    const cpY = startY - (startY - tipY) * 0.20

    // A. Rich, Deep Emerald Green Area Under Curve (Aspirebet Style)
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY)
    ctx.lineTo(tipX, startY)
    ctx.closePath()

    const grad = ctx.createLinearGradient(0, tipY, 0, startY)
    grad.addColorStop(0, 'rgba(0, 212, 72, 0.82)')
    grad.addColorStop(0.55, 'rgba(0, 185, 62, 0.62)')
    grad.addColorStop(1, 'rgba(0, 150, 48, 0.38)')
    ctx.fillStyle = grad
    ctx.fill()

    // B. Tapered Trajectory Line — matches the exact pixel thickness of the SVG tail tip (1.6 SVG units)
    const tailHalfThickness = Math.max(0.65, (planeHeight * (1.6 / 46)) / 2)
    const midHalfThickness = Math.max(1.1, tailHalfThickness * 1.45)
    const startHalfThickness = 0.9

    ctx.beginPath()
    // Top edge of trajectory line from origin to top of tail tip
    ctx.moveTo(startX, startY - startHalfThickness)
    ctx.quadraticCurveTo(cpX, cpY - midHalfThickness, tipX, tipY - tailHalfThickness)
    // Right cap tucked inside the tail tip
    ctx.lineTo(tipX, tipY + tailHalfThickness)
    // Bottom edge of trajectory line back to origin
    ctx.quadraticCurveTo(cpX, cpY + midHalfThickness, startX, startY + startHalfThickness)
    ctx.closePath()

    ctx.fillStyle = '#19e660'
    ctx.fill()
  }

  // 8. Draw the Plane Horizontally with Tail Tip Locked to (tipX, tipY)
  const drawX = tipX - planeWidth * TAIL_ANCHOR_X
  const drawY = tipY - planeHeight * TAIL_ANCHOR_Y

  if (greenJetImg.complete) {
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
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export function GameCanvas({
  phase, multiplier, crashPoint, waitProgress, elapsedMs, plane, betMode, onToggleBetMode,
  freebetLocked = true, freebetAmount = 0,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  const propsRef = useRef({ phase, elapsedMs, multiplier, plane })
  propsRef.current = { phase, elapsedMs, multiplier, plane }

  // High-precision local flight clock synced with elapsedMs for 60/120fps smoothness
  const flightClockRef = useRef({
    active: false,
    startTime: 0,
  })

  // Persistent flyaway state across frames
  const flyRef = useRef({
    active: false,
    x: 0,
    y: 0,
    t0: 0,
  })

  const lastPosRef = useRef({ x: 0, y: 0 })

  const bgRotationRef = useRef({
    angle: 0,
    lastTime: 0,
  })

  const render = useCallback((time: number = 0) => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    const { phase, elapsedMs, multiplier } = propsRef.current

    const CW = cvs.clientWidth, CH = cvs.clientHeight
    if (!CW || !CH) {
      rafRef.current = requestAnimationFrame(render)
      return
    }

    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(CW * dpr), ph = Math.round(CH * dpr)
    if (cvs.width !== pw || cvs.height !== ph) {
      cvs.width = pw
      cvs.height = ph
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

    drawBackground(ctx, CW, CH, bgRotationRef.current.angle, phase, multiplier)
    drawAxes(ctx, CW, CH)
    drawDots(ctx, CW, CH, time)

    // ═══════════════ WAITING (Tail touching 0,0 at rest) ═══════════════
    if (phase === 'waiting') {
      flyRef.current.active = false
      flightClockRef.current.active = false

      const info = renderFlightAndPlane(ctx, CW, CH, 0, time)
      lastPosRef.current = { x: info.tipX, y: info.tipY }
    }

    // ═══════════════ FLYING (Smooth takeoff -> Cruise turbulence) ══════
    if (phase === 'flying') {
      flyRef.current.active = false

      if (!flightClockRef.current.active) {
        flightClockRef.current.active = true
        flightClockRef.current.startTime = time - elapsedMs
      } else {
        const expectedStart = time - elapsedMs
        flightClockRef.current.startTime += (expectedStart - flightClockRef.current.startTime) * 0.08
      }

      const smoothElapsedMs = Math.max(0, time - flightClockRef.current.startTime)
      const flightDuration = 7500
      const progress = Math.min(1, smoothElapsedMs / flightDuration)

      const info = renderFlightAndPlane(ctx, CW, CH, progress, time)
      lastPosRef.current = { x: info.tipX, y: info.tipY }
    }

    // ═══════════════ CRASHING / CRASHED ════════════════════════════════
    if (phase === 'crashing' || phase === 'crashed') {
      flightClockRef.current.active = false
      const fa = flyRef.current

      if (!fa.active) {
        fa.active = true
        fa.x = lastPosRef.current.x || (CW * 0.7)
        fa.y = lastPosRef.current.y || (CH * 0.23)
        fa.t0 = time
      }

      const dt = (time - fa.t0) / 16.67
      const speed = 26
      const flyX = fa.x + speed * dt * 1.4
      const flyY = fa.y - speed * dt * 0.55

      if (flyX < CW + 160 && flyY > -160) {
        const planeWidth = Math.min(Math.max(CW * 0.125, 66), 112)
        const planeHeight = (planeWidth / JET_ASPECT) * 1.015
        const drawX = flyX - planeWidth * TAIL_ANCHOR_X
        const drawY = flyY - planeHeight * TAIL_ANCHOR_Y
        if (greenJetImg.complete) {
          ctx.drawImage(greenJetImg, drawX, drawY, planeWidth, planeHeight)
        }
      }
    }

    rafRef.current = requestAnimationFrame(render)
  }, [])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [render])

  const isCrashed = phase === 'crashed' || phase === 'crashing'

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ display: 'block' }} />

      {/* Top bar: wallet toggle bordering vertical Y-axis (x=14px) edge-to-edge, with online status below */}
      <div className="absolute left-[14px] top-2 z-10 flex flex-col items-start gap-1">
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
