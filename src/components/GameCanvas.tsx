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

const PAD = { left: 18, right: 16, top: 20, bottom: 20 }  // Increased left padding to 18 for Y-axis visibility

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
   JET SPRITE & TRAJECTORY CURVE
   Anchored at rear engine (32% from tail, 66% from top) wired to neon curve
   ═══════════════════════════════════════════════════════════════════════════ */

const jetImg = new Image()
if (typeof window !== 'undefined') {
  jetImg.src = '/assets/jet.svg'
}

/**
 * Draws the quadratic flight curve and translucent green shade under it.
 * Directly wired to the rear tip of the jet.
 */
function drawFlightCurve(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number
) {
  // Control point pulls the middle of the line slightly downward and right
  const cpX = startX + (endX - startX) * 0.55
  const cpY = startY - (startY - endY) * 0.18

  // 1. Draw the translucent green fill area under the curve
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.quadraticCurveTo(cpX, cpY, endX, endY)
  ctx.lineTo(endX, startY)
  ctx.closePath()

  const fillGrad = ctx.createLinearGradient(0, endY, 0, startY)
  fillGrad.addColorStop(0, 'rgba(0, 231, 84, 0.42)')
  fillGrad.addColorStop(1, 'rgba(0, 231, 84, 0.08)')
  ctx.fillStyle = fillGrad
  ctx.fill()

  // 2. Draw the bright neon top stroke
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.quadraticCurveTo(cpX, cpY, endX, endY)
  ctx.strokeStyle = '#00ff5e'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

/**
 * Draws the jet anchored at (anchorXRatio: 0.32, anchorYRatio: 0.66)
 * with mobile edge protection and subtle turbulence oscillation.
 */
function drawPlane(
  ctx: CanvasRenderingContext2D,
  endX: number,
  endY: number,
  canvasWidth: number,
  isTurbulence: boolean,
  timeMs: number
) {
  // 1. Base desired width
  const aspect = 120 / 52 // 2.307
  let desiredWidth = Math.min(Math.max(canvasWidth * 0.13, 68), 115)

  // 2. Anchor point inside the jet sprite (32% from tail, 66% from top)
  // This puts the green line tip right under the rear wing/engine
  const anchorXRatio = 0.32
  const anchorYRatio = 0.66

  // 3. Mobile Right-Edge Protection:
  // Ensure the nose (which extends (1 - anchorXRatio) to the right of endX)
  // always stops at least 6px inside the right canvas border.
  const rightPadding = 6
  const availableRightSpace = canvasWidth - endX - rightPadding
  const maxSafeWidth = availableRightSpace / (1 - anchorXRatio)

  const planeWidth = Math.max(16, Math.min(desiredWidth, maxSafeWidth))
  const planeHeight = planeWidth / aspect

  // 4. Subtle turbulence oscillation at max height
  const pitchShake = isTurbulence ? Math.sin(timeMs * 0.012) * 0.04 : 0
  const basePitchRad = (-11 * Math.PI) / 180 // -11 deg nose-up angle

  ctx.save()
  // Move origin to the exact tip of the green trajectory line
  ctx.translate(endX, endY)
  ctx.rotate(basePitchRad + pitchShake)

  // Draw jet anchored at (anchorXRatio, anchorYRatio)
  if (jetImg.complete && jetImg.naturalWidth > 0) {
    ctx.drawImage(
      jetImg,
      -planeWidth * anchorXRatio,
      -planeHeight * anchorYRatio,
      planeWidth,
      planeHeight
    )
  }
  ctx.restore()
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

  // Smooth interpolation state for buttery plane movement
  const smoothRef = useRef({
    tipX: 0, tipY: 0,
    velX: { v: 0 }, velY: { v: 0 },
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

    const startX = PAD.left
    const startY = CH - PAD.bottom

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

      // Plane sits resting near origin on the runway
      const restX = startX + 22
      const restY = startY - 8
      lastPosRef.current = { x: restX, y: restY }
      drawPlane(ctx, restX, restY, CW, false, time)
    }

    // ═══════════════ FLYING ════════════════════════════════════════════
    if (phase === 'flying') {
      flyRef.current.active = false

      const deltaTime = lastTimeRef.current > 0 ? Math.min((time - lastTimeRef.current) / 1000, 0.1) : 0.016
      lastTimeRef.current = time

      // Calculate desired plane sizing for safe margins
      const aspect = 120 / 52
      const desiredWidth = Math.min(Math.max(CW * 0.13, 68), 115)
      const anchorXRatio = 0.32
      const rightPadding = 8
      const maxSafeWidth = (CW - startX - rightPadding) / (1 - anchorXRatio)
      const planeWidth = Math.min(desiredWidth, maxSafeWidth)

      // Clamping limits: nose stops inside right border, plane stays below top bar
      const maxEndX = CW - rightPadding - planeWidth * (1 - anchorXRatio) - 8
      const minEndY = PAD.top + Math.max(28, CH * 0.12)
      const distanceX = maxEndX - startX
      const distanceY = startY - minEndY

      // Progress calculation
      const flightDuration = 8500
      const rawT = Math.min(1, elapsedMs / flightDuration)
      const tX = Math.min(1, Math.pow(rawT, 0.95))
      const tY = Math.min(1, Math.pow(rawT, 0.85))

      const targetX = startX + distanceX * tX
      const targetY = startY - distanceY * tY

      const isTurbulence = rawT >= 0.85 || multiplier >= 5

      const sm = smoothRef.current
      if (!sm.initialized || elapsedMs < 50) {
        sm.tipX = targetX
        sm.tipY = targetY
        sm.velX = { v: 0 }
        sm.velY = { v: 0 }
        sm.initialized = true
      } else {
        const smoothTime = 0.05
        sm.tipX = smoothDamp(sm.tipX, targetX, sm.velX, smoothTime, deltaTime)
        sm.tipY = smoothDamp(sm.tipY, targetY, sm.velY, smoothTime, deltaTime)
      }

      const clampedEndX = Math.min(sm.tipX, maxEndX)
      const clampedEndY = Math.max(minEndY, sm.tipY)

      // Subtle turbulence oscillation at max height
      const bobOffsetY = isTurbulence ? Math.sin(time * 0.008) * 3.5 : 0
      const wiredEndY = clampedEndY + bobOffsetY

      lastPosRef.current = { x: clampedEndX, y: wiredEndY }

      // 1. Draw trajectory curve wired directly to the plane anchor
      if (clampedEndX - startX > 2) {
        drawFlightCurve(ctx, startX, startY, clampedEndX, wiredEndY)
      }

      // 2. Draw plane anchored at the exact tip of the trajectory line
      drawPlane(ctx, clampedEndX, wiredEndY, CW, isTurbulence, time)
    }

    // ═══════════════ CRASHING / CRASHED ════════════════════════════════
    if (phase === 'crashing' || phase === 'crashed') {
      const fa = flyRef.current

      if (!fa.active) {
        fa.active = true
        fa.x = lastPosRef.current.x
        fa.y = lastPosRef.current.y
        fa.t0 = time
      }

      const dt = (time - fa.t0) / 16.67
      const speed = 32
      const flyX = fa.x + speed * dt * 1.5
      const flyY = fa.y - speed * dt * 0.75

      if (flyX < CW + 150 && flyY > -150) {
        drawPlane(ctx, flyX, flyY, CW, false, time)
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

      {/* Top bar: wallet toggle bordering vertical Y-axis (x=18px) edge-to-edge, with online status below */}
      <div className="absolute left-[18px] top-2 z-10 flex flex-col items-start gap-1">
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
