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

// Mobile-optimized plane dimensions
const PLANE_WIDTH = 45   // Smaller plane width for mobile
const PLANE_HEIGHT = 20  // Proportional height

/* ═══════════════════════════════════════════════════════════════════════════
   SMOOTH INTERPOLATION — lerp values for buttery animation
   ═══════════════════════════════════════════════════════════════════════════ */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

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
  ctx.fillStyle = '#0d1117'
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
   FLIGHT PATH — the core math + rendering (Spribe-style)
   
   Shape: Classic Aviator curve - starts steep, gradually flattens out
   Like y = log(x) — rapid initial climb, then levels off horizontally
   
   The plane follows the TANGENT of the curve naturally.
   ═══════════════════════════════════════════════════════════════════════════ */

const CURVE_STEPS = 150

// Target: upper right corner
const TARGET_HEIGHT = 0.85  // 85% up
const TARGET_WIDTH = 0.88   // 88% across

// Waiting angle: 10 degrees RIGHT (nose tilted DOWN with tail as pivot)
// Positive angle = clockwise rotation = nose pointing down-right
const WAITING_ANGLE = 10 * (Math.PI / 180)  // 10 degrees right

/** Convert elapsed ms → pixel coordinates.
 *  Clean smooth 6% convex bulge downward (curve dips below straight line).
 *  Simple and clean - classic Aviator style. */
function flightPos(tMs: number, gw: number, gh: number) {
  // Progress along the path (0 to 1)
  const t = Math.min(1, tMs / 10000)  // 10 seconds for full journey
  
  // X: linear movement to target
  const nx = t * TARGET_WIDTH
  
  // Y: linear rise to target + 6% downward convex bulge
  // Straight line would be: t * TARGET_HEIGHT
  // Convex bulge down: subtract a parabola that peaks at t=0.5
  // Parabola: 4 * t * (1-t) peaks at 0.5 with value 1
  const straightY = t * TARGET_HEIGHT
  const bulge = 4 * t * (1 - t) * 0.06 * TARGET_HEIGHT  // Clean 6% bulge
  const ny = straightY - bulge  // subtract to bulge DOWNWARD
  
  return {
    px: PAD.left + nx * gw,
    py: (gh + PAD.top) - ny * gh,
    nx,
    ny,
    t,  // return progress for angle calculation
  }
}

/** Compute tangent angle at a point on the curve.
 *  Angle gradually transitions from diagonal (~44°) to horizontal (0°) 
 *  as the plane approaches the max point - smooth and unnoticeable. */
function getTangentAngle(tMs: number, gw: number, gh: number): number {
  const delta = 200
  const p1 = flightPos(Math.max(0, tMs - delta), gw, gh)
  const p2 = flightPos(tMs + delta, gw, gh)
  
  const dx = p2.px - p1.px
  const dy = p1.py - p2.py  // inverted because canvas Y is flipped
  
  // Natural angle from the curve tangent
  const rawAngle = Math.atan2(dy, dx)
  
  // Progress (0 to 1) - use for gradual angle reduction
  const t = Math.min(1, tMs / 10000)
  
  // Gradually ease the angle toward horizontal as we approach max point
  // Use smooth easing: angle reduces slowly at first, faster near the end
  // This makes the transition unnoticeable
  const easeOut = 1 - Math.pow(t, 2.5)  // smooth ease-out curve
  const targetAngle = rawAngle * easeOut
  
  return Math.max(0, targetAngle)
}

/** Draw the green luminous flight path + gradient fill (Spribe style) 
 *  globalOffsetY moves the curve for turbulence, but origin stays FIXED */
function drawFlightPath(
  ctx: CanvasRenderingContext2D, w: number, h: number, elMs: number,
  globalOffsetY: number = 0  // vertical offset for turbulence (origin stays fixed)
): { tipX: number; tipY: number; angle: number; progress: number } | null {
  if (elMs < 8) return null

  const gw = w - PAD.left - PAD.right
  const gh = h - PAD.top - PAD.bottom
  const baseY = h - PAD.bottom

  // Build point array - apply turbulence that INCREASES with distance from origin
  // Origin (0,0) stays fixed, turbulence grows toward the tip
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const t = (i / CURVE_STEPS) * elMs
    const { px, py } = flightPos(t, gw, gh)
    // Turbulence scales with progress (0 at origin, full at tip)
    const progress = i / CURVE_STEPS
    const scaledOffset = globalOffsetY * progress
    pts.push({ x: px, y: py + scaledOffset })
  }

  if (pts.length < 2) return null

  const tip = pts[pts.length - 1]
  
  const { nx } = flightPos(elMs, gw, gh)
  
  // Get actual tangent angle from curve derivative
  const angle = getTangentAngle(elMs, gw, gh)

  // Return calculated tip position without drawing
  // (Drawing will be done by drawFlightPathToPoint with actual plane tail position)
  return { tipX: tip.x, tipY: tip.y, angle, progress: nx }
}

/** Draw flight path curve ending EXACTLY at the plane tail position
 *  This ensures the curve is ALWAYS connected to the tail, no matter the clamping */
function drawFlightPathToPoint(
  ctx: CanvasRenderingContext2D, w: number, h: number, elMs: number,
  globalOffsetY: number = 0,
  endX: number,  // Actual plane tail X (after clamping)
  endY: number   // Actual plane tail Y (after clamping)
) {
  if (elMs < 8) return

  const gw = w - PAD.left - PAD.right
  const gh = h - PAD.top - PAD.bottom
  const baseY = h - PAD.bottom

  // Build point array up to the actual end point
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const t = (i / CURVE_STEPS) * elMs
    const { px, py } = flightPos(t, gw, gh)
    const progress = i / CURVE_STEPS
    const scaledOffset = globalOffsetY * progress
    pts.push({ x: px, y: py + scaledOffset })
  }

  // Replace last point with actual plane tail position
  pts[pts.length - 1] = { x: endX, y: endY }

  if (pts.length < 2) return

  // ── Clip to graph area ────────────────────────────────────────────────
  ctx.save()
  ctx.beginPath()
  ctx.rect(PAD.left, PAD.top, gw, gh)
  ctx.clip()

  // ── Build smooth Bézier curve ─────────────────────────────────────────
  const curve = new Path2D()
  curve.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    curve.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  curve.lineTo(endX, endY)

  // ── Gradient fill under the curve (green/cyan like Spribe) ────────────
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    const my = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
  }
  ctx.lineTo(endX, endY)
  ctx.lineTo(endX, baseY)
  ctx.lineTo(pts[0].x, baseY)
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, endY, 0, baseY)
  grad.addColorStop(0,    'rgba(0,199,77,0.90)')    // Electric green #00C74D - very intense at top
  grad.addColorStop(0.2,  'rgba(0,199,77,0.75)')    // Strong green
  grad.addColorStop(0.4,  'rgba(0,199,77,0.55)')    // Medium intensity
  grad.addColorStop(0.7,  'rgba(0,199,77,0.30)')    // Fading
  grad.addColorStop(1,    'rgba(0,199,77,0.08)')    // Subtle at bottom
  ctx.fillStyle = grad
  ctx.fill()

  // ── Crisp green stroke (flat design, no glow) ─────────────────────────
  ctx.strokeStyle = '#00C74D'
  ctx.lineWidth = 4
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke(curve)

  // Brighter inner highlight
  ctx.strokeStyle = 'rgba(100,255,180,0.5)'
  ctx.lineWidth = 2
  ctx.shadowBlur = 0
  ctx.stroke(curve)

  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLANE SPRITE — code-drawn business jet
   
   Local coords: nose at (0,0) pointing right, tail extends left.
   Call with ctx.translate(noseX, noseY) + ctx.rotate(-angle)
   Scale parameter allows for mobile-friendly sizing.
   ═══════════════════════════════════════════════════════════════════════════ */

function drawPlane(
  ctx: CanvasRenderingContext2D,
  noseX: number, noseY: number,
  angleRad: number,
  crashed = false,
  scale = 0.5  // Default 50% scale for mobile-friendly size
) {
  // Electric green plane to match site theme - flat design
  const body = crashed ? 'rgba(100,100,100,0.82)' : '#00C74D'  // Electric green
  const wing = crashed ? 'rgba(80,80,80,0.75)' : '#00a83d'     // Darker electric green
  const belly = crashed ? 'rgba(90,90,90,0.8)' : '#00e056'     // Light electric green
  const line = crashed ? 'rgba(80,80,80,0.55)' : '#008a32'     // Dark green outline
  const glass = crashed ? 'rgba(60,60,60,0.5)' : 'rgba(255,255,255,0.85)'

  ctx.save()
  ctx.translate(noseX, noseY)
  ctx.rotate(-angleRad)
  ctx.scale(scale, scale)  // Apply scaling for mobile

  // No shadows - flat design
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1 / scale  // Adjust line width for scale

  // Wing (underneath)
  const w = new Path2D()
  w.moveTo(-26, -4.5); w.lineTo(-70, -27); w.lineTo(-75, -22)
  w.bezierCurveTo(-70, -18, -60, -8, -58, -4.5); w.closePath()
  ctx.fillStyle = wing; ctx.strokeStyle = line; ctx.fill(w); ctx.stroke(w)

  // Tail fin
  const tf = new Path2D()
  tf.moveTo(-80, -4.5); tf.bezierCurveTo(-80, -10, -83, -17, -86, -24)
  tf.lineTo(-91, -4.5); tf.closePath()
  ctx.fillStyle = wing; ctx.strokeStyle = line; ctx.fill(tf); ctx.stroke(tf)

  // Horizontal stabilizer
  const hs = new Path2D()
  hs.moveTo(-80, -4.5); hs.lineTo(-94, -15); hs.lineTo(-96, -11)
  hs.bezierCurveTo(-92, -8, -88, -5, -86, -4.5); hs.closePath()
  ctx.fillStyle = wing; ctx.strokeStyle = line; ctx.fill(hs); ctx.stroke(hs)

  // Fuselage (main body)
  const f = new Path2D()
  f.moveTo(0, 0)
  f.bezierCurveTo(-2, -1.5, -6, -4.5, -12, -5.2)
  f.bezierCurveTo(-18, -5.8, -22, -6.2, -28, -6)
  f.bezierCurveTo(-35, -5.8, -55, -5.2, -72, -4.8)
  f.bezierCurveTo(-80, -4.5, -87, -3.5, -92, -1.5)
  f.lineTo(-94, 0)
  f.bezierCurveTo(-88, 2, -75, 3.2, -55, 3.5)
  f.bezierCurveTo(-35, 3.5, -18, 2.8, -6, 1.2)
  f.bezierCurveTo(-3, 0.6, -1, 0.2, 0, 0)
  f.closePath()
  ctx.fillStyle = body; ctx.strokeStyle = line; ctx.fill(f); ctx.stroke(f)

  // Cockpit
  const c = new Path2D()
  c.moveTo(-6, -4.5)
  c.bezierCurveTo(-10, -5.2, -16, -6.5, -24, -6.2)
  c.bezierCurveTo(-27, -6, -30, -5.5, -32, -4.8)
  c.lineTo(-10, -4.8); c.closePath()
  ctx.fillStyle = glass; ctx.strokeStyle = 'transparent'; ctx.fill(c)

  // Three black window panes (business jet style)
  const windowColor = crashed ? 'rgba(30,30,30,0.6)' : 'rgba(10,10,10,0.85)'
  for (const wx of [-38, -48, -58]) {
    ctx.beginPath()
    ctx.ellipse(wx, -4.2, 3.5, 2.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = windowColor
    ctx.fill()
    // Window highlight
    if (!crashed) {
      ctx.beginPath()
      ctx.ellipse(wx - 0.8, -5, 1.2, 0.8, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fill()
    }
  }

  // Engines - no shadow
  for (const [ex, ey, rx, ry] of [[-70, 3.5, 11, 3], [-68, -7.5, 10, 2.8]] as const) {
    const e = new Path2D(); e.ellipse(ex, ey, rx, ry, -0.08, 0, Math.PI * 2)
    ctx.fillStyle = wing; ctx.strokeStyle = line; ctx.fill(e); ctx.stroke(e)
    const intake = new Path2D(); intake.ellipse(ex, ey, rx * 0.45, ry * 0.65, -0.08, Math.PI, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'transparent'; ctx.fill(intake)
  }

  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXHAUST PARTICLES — green smoke trail, stays BELOW curve (drifts down only)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawExhaust(
  ctx: CanvasRenderingContext2D,
  tailX: number, tailY: number, angleRad: number, time: number
) {
  ctx.save()
  ctx.translate(tailX, tailY)
  ctx.rotate(-angleRad)
  
  // Green exhaust smoke particles - drift DOWN and BACK only (never above curve)
  for (let i = 0; i < 16; i++) {
    const off = (time * 0.005 + i * 0.06) % 1
    const sz = (1 - off) * 4 + 1.5
    const al = (1 - off) * 0.45
    
    // Green colors
    const r = 0
    const g = Math.floor(160 + (1 - off) * 40)
    const b = Math.floor(90 + off * 25)
    
    // Particles drift backward and DOWN only (positive Y in rotated space = below curve)
    const yDrift = off * 8 + 2  // always positive = below the plane/curve
    ctx.beginPath()
    ctx.arc(-off * 50 - 8, yDrift, sz, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r},${g},${b},${al})`
    ctx.fill()
  }
  
  // Small bright core near exhaust - also below
  for (let i = 0; i < 4; i++) {
    const off = (time * 0.008 + i * 0.2) % 1
    const sz = (1 - off) * 2 + 1
    const al = (1 - off) * 0.6
    ctx.beginPath()
    ctx.arc(-off * 20 - 5, 3 + off * 2, sz, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,220,150,${al})`
    ctx.fill()
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
  return (
    <div className="flex items-center rounded-full bg-[#0f1318] p-0.5 border border-[#00C74D]/20">
      <button type="button" onClick={() => betMode !== 'money' && onToggle()}
        className={cn('rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold tracking-wide transition-all duration-200',
          betMode === 'money' 
            ? 'bg-[#00C74D] text-black' 
            : 'text-white/50 hover:text-white/80')}>
        Money
      </button>
      <button 
        type="button" 
        onClick={() => !freebetLocked && betMode !== 'freebet' && onToggle()}
        disabled={freebetLocked}
        className={cn('rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-[8px] sm:text-[10px] font-bold tracking-wide transition-all duration-200 relative',
          freebetLocked && 'opacity-50 cursor-not-allowed',
          betMode === 'freebet' 
            ? 'bg-[#00C74D] text-black' 
            : 'text-white/50 hover:text-white/80')}
        title={freebetLocked ? 'Deposit KSH 20+ and place a bet to unlock' : `Freebet: KSH ${freebetAmount.toFixed(0)}`}
      >
        Freebet
        {freebetLocked && <span className="ml-0.5">🔒</span>}
        {!freebetLocked && freebetAmount > 0 && (
          <span className="ml-1 text-[7px] opacity-80">({freebetAmount.toFixed(0)})</span>
        )}
      </button>
    </div>
  )
}

function NetworkStatus() {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1 text-[7px] sm:text-[8px] text-white/40 mt-0.5 ml-0.5 sm:ml-1">
      <span className="relative flex h-1 w-1">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C74D] opacity-75" />
        <span className="relative inline-flex h-1 w-1 rounded-full bg-[#00C74D]" />
      </span>
      <span className="font-medium">Online</span>
    </div>
  )
}

function NautilusSpinner() {
  const blades = 9, cx = 32, cy = 32
  return (
    <svg className="animate-spin" style={{ animationDuration: '1.6s', animationDirection: 'reverse' }}
      width="80" height="80" viewBox="0 0 64 64" fill="none">
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
      <circle cx={cx} cy={cy} r="3" fill="#0b0e11" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — the render loop orchestrating all 4 game states
   
   WAITING  → plane sits at origin, pitched 30° up. No curve.
   FLYING   → curve draws, plane rides the tip following the tangent.
              Subtle turbulence bounce on the plane at high multipliers.
   CRASHING → curve freezes, plane shoots off along its last tangent.
   CRASHED  → frozen curve + "FLEW AWAY!" overlay in pink.
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
    tipX: 0, tipY: 0, angle: 0,
    velX: { v: 0 }, velY: { v: 0 }, velAngle: { v: 0 },
    lastElapsedMs: 0,
    initialized: false,
  })

  // Persistent flyaway state across frames (survives re-renders)
  const flyRef = useRef({
    active: false,
    angle: 0,           // locked tangent angle at moment of crash
    frozenMs: 0,         // elapsedMs frozen at crash
    x: 0, y: 0,         // starting pixel position
    t0: 0,               // timestamp when crash started
  })

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

    const originX = PAD.left
    const originY = CH - PAD.bottom
    const gw = CW - PAD.left - PAD.right
    const gh = CH - PAD.top - PAD.bottom

    // ═══════════════ BACKGROUND ROTATION CALCULATION ═══════════════════
    // Calculate delta time for rotation increment
    const bgDeltaTime = bgRotationRef.current.lastTime > 0 
      ? Math.min((time - bgRotationRef.current.lastTime) / 1000, 0.1) 
      : 0.016
    bgRotationRef.current.lastTime = time

    // Base rotation speed (radians per second) - dynamic based on multiplier
    const BASE_ROTATION_SPEED = 0.162  // 0.15 * 1.08 = ~9.3 degrees per second
    
    // Dynamic rotation speed based on multiplier during flight
    let rotationSpeed = BASE_ROTATION_SPEED
    if (phase === 'flying') {
      if (multiplier >= 15) {
        rotationSpeed = BASE_ROTATION_SPEED * 5  // Max speed for extreme danger
      } else if (multiplier >= 5) {
        rotationSpeed = BASE_ROTATION_SPEED * 3  // 3x speed for high multipliers
      } else {
        rotationSpeed = BASE_ROTATION_SPEED * 2  // 2x speed during normal flight
      }
    }

    // Accumulate rotation angle (POSITIVE for CLOCKWISE rotation)
    bgRotationRef.current.angle += rotationSpeed * bgDeltaTime
    
    // Keep angle within reasonable bounds to prevent floating point issues
    if (bgRotationRef.current.angle > Math.PI * 200) {
      bgRotationRef.current.angle -= Math.PI * 200
    }

    // Draw background with dynamic rotation and multiplier
    drawBackground(ctx, CW, CH, bgRotationRef.current.angle, phase, multiplier)
    drawAxes(ctx, CW, CH)
    drawDots(ctx, CW, CH, time)

    // Scaled plane dimensions for mobile
    const PLANE_SCALE = 0.5  // 50% scale
    const PLANE_LEN = 94 * PLANE_SCALE  // Effective length: 47px (scaled from 94)
    const PLANE_ACTUAL_LEN = 94  // Full unscaled length for coordinate calc

    // ═══════════════ WAITING ═══════════════════════════════════════════
    if (phase === 'waiting') {
      flyRef.current.active = false  // reset for next round
      // Reset smooth interpolation for next flying phase
      smoothRef.current.initialized = false

      // Plane sits at origin, tilted slightly RIGHT (tail is fixed pivot point)
      const angle = WAITING_ANGLE
      // Tail is at origin (curve endpoint), nose extends from there
      const tailX = originX
      const tailY = originY
      // Calculate nose position based on scaled length
      const noseX = Math.min(tailX + PLANE_LEN * Math.cos(angle), CW - PAD.right)
      const noseY = tailY - PLANE_LEN * Math.sin(angle)
      drawExhaust(ctx, tailX, tailY, angle, time)
      drawPlane(ctx, noseX, noseY, angle, false, PLANE_SCALE)
    }

    // ═══════════════ FLYING ════════════════════════════════════════════
    if (phase === 'flying') {
      flyRef.current.active = false

      // Calculate delta time for smooth interpolation
      const deltaTime = lastTimeRef.current > 0 ? Math.min((time - lastTimeRef.current) / 1000, 0.1) : 0.016
      lastTimeRef.current = time

      // Calculate progress for turbulence intensity
      const t = Math.min(1, elapsedMs / 10000)
      const progress = t
      
      // Turbulence: UP and DOWN - moves WHOLE curve (reduced by 1%)
      // Increases as we approach max point (progress -> 1)
      const turbulenceIntensity = Math.pow(progress, 2) * 2.4  // reduced from 2.5
      const turbulenceY = Math.sin(time / 100) * turbulenceIntensity  // vertical only

      // First calculate the TARGET position (with turbulence)
      const pathData = drawFlightPath(ctx, CW, CH, elapsedMs, -turbulenceY)

      if (pathData) {
        const { tipX: targetX, tipY: targetY, angle: targetAngle } = pathData
        const sm = smoothRef.current

        // Initialize smooth values on first frame
        if (!sm.initialized || elapsedMs < 50) {
          sm.tipX = targetX
          sm.tipY = targetY
          sm.angle = targetAngle
          sm.velX = { v: 0 }
          sm.velY = { v: 0 }
          sm.velAngle = { v: 0 }
          sm.initialized = true
        } else {
          // Smooth interpolation using smoothDamp for silky movement
          const smoothTime = 0.06  // Snappy but smooth
          sm.tipX = smoothDamp(sm.tipX, targetX, sm.velX, smoothTime, deltaTime)
          sm.tipY = smoothDamp(sm.tipY, targetY, sm.velY, smoothTime, deltaTime)
          sm.angle = smoothDamp(sm.angle, targetAngle, sm.velAngle, smoothTime * 1.5, deltaTime)
        }

        // STRICT RIGHT BOUNDARY CLAMP
        // maxX = canvas width - plane width - left padding (so plane doesn't overflow)
        const maxX = CW - PLANE_LEN - PAD.left
        
        // Clamp plane position to screen bounds
        // Once at maxX, plane hovers while Y continues animating
        const clampedTipX = Math.min(sm.tipX, maxX)
        const clampedTipY = Math.max(PAD.top, Math.min(sm.tipY, CH - PAD.bottom))
        
        // Tail is at curve endpoint, nose extends forward
        const tailX = clampedTipX
        const tailY = clampedTipY
        const noseX = tailX + PLANE_LEN * Math.cos(sm.angle)
        const noseY = tailY - PLANE_LEN * Math.sin(sm.angle)

        // NOW re-draw the flight path UP TO the actual plane tail position
        // This ensures the curve is ALWAYS connected to the tail
        drawFlightPathToPoint(ctx, CW, CH, elapsedMs, -turbulenceY, tailX, tailY)

        drawExhaust(ctx, tailX, tailY, sm.angle, time)
        drawPlane(ctx, noseX, noseY, sm.angle, false, PLANE_SCALE)
      } else {
        // Frame 0: plane at origin with waiting angle
        const a = WAITING_ANGLE
        drawExhaust(ctx, originX, originY, a, time)
        drawPlane(ctx, originX + PLANE_LEN * Math.cos(a), originY - PLANE_LEN * Math.sin(a), a, false, PLANE_SCALE)
      }
    }

    // ═══════════════ CRASHING / CRASHED ════════════════════════════════
    if (phase === 'crashing' || phase === 'crashed') {
      const fa = flyRef.current

      // First crash frame: lock everything
      if (!fa.active) {
        const lastPath = drawFlightPath(ctx, CW, CH, elapsedMs)
        if (lastPath) {
          fa.active = true
          fa.angle = lastPath.angle
          fa.frozenMs = elapsedMs
          fa.x = lastPath.tipX
          fa.y = lastPath.tipY
          fa.t0 = time
        }
      }

      if (fa.active) {
        // DON'T draw the frozen path - no leftover curve after crash
        // Just fly the plane off-screen quickly
        const dt = (time - fa.t0) / 16.67  // frame count
        const speed = 35  // faster exit
        const flyX = fa.x + Math.cos(fa.angle) * speed * dt
        const flyY = fa.y - Math.sin(fa.angle) * speed * dt

        // Only show plane while still reasonably on screen
        if (flyX < CW + 100 && flyY > -100) {
          const noseX = flyX + PLANE_LEN * Math.cos(fa.angle)
          const noseY = flyY - PLANE_LEN * Math.sin(fa.angle)
          drawPlane(ctx, noseX, noseY, fa.angle, true, PLANE_SCALE)
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
    <div className="relative w-full h-full overflow-hidden rounded-md sm:rounded-lg">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display: 'block' }} />

      {/* Top-left controls */}
      <div className="absolute top-1 sm:top-2 left-1 sm:left-2 z-10 flex flex-col gap-0.5">
        <BetModeToggle 
          betMode={betMode} 
          onToggle={onToggleBetMode} 
          freebetLocked={freebetLocked}
          freebetAmount={freebetAmount}
        />
        <NetworkStatus />
      </div>

      {/* WAITING overlay */}
      {phase === 'waiting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 z-10">
          <NautilusSpinner />
          <div className="text-center">
            <div className="text-white font-bold text-[10px] sm:text-sm tracking-widest uppercase">WAITING FOR NEXT ROUND</div>
            <div className="mt-1.5 sm:mt-2 mx-auto w-28 sm:w-40 h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#00E676] rounded-full transition-all" style={{ width: `${waitProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* FLYING multiplier - large centered display (crisp white, no glow) */}
      {phase === 'flying' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="font-black text-white leading-none"
            style={{ 
              fontSize: 'clamp(2rem, 10vw, 6rem)', 
              letterSpacing: '-0.02em'
            }}>
            {multiplier.toFixed(2)}<span className="text-[0.6em] ml-0.5 sm:ml-1">x</span>
          </div>
        </div>
      )}

      {/* CRASHED overlay — pink/red */}
      {isCrashed && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <div className="text-[#E91E63] text-[10px] sm:text-sm font-bold tracking-widest uppercase mb-1 sm:mb-2">FLEW AWAY!</div>
            <div className="font-black text-[#E91E63] leading-none"
              style={{ 
                fontSize: 'clamp(2rem, 10vw, 6rem)', 
                letterSpacing: '-0.02em'
              }}>
              {crashPoint > 0 ? crashPoint.toFixed(2) : multiplier.toFixed(2)}<span className="text-[0.6em] ml-0.5 sm:ml-1">x</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
