import { useState, useRef, useEffect } from 'react'
import { getSocket } from '@/lib/socketClient'

export type Phase = 'waiting' | 'flying' | 'crashing' | 'crashed'

export interface PlaneTransform {
  nx: number
  ny: number
  angleDeg: number
  crashOffsetX: number
  crashOffsetY: number
  offScreen: boolean
}

export interface SharedLiveBet {
  id: string
  user: string
  rank?: number
  bet: number
  cashout?: number | null
  won?: number | null
  cashoutTarget?: number
  isUser?: boolean
  avatar?: string
  roundId?: string
  updatedAt?: number
  cashedOut?: boolean
  cashOut?: number
  win?: number
}

export type LiveBet = SharedLiveBet

export interface GameState {
  phase: Phase
  multiplier: number
  crashPoint: number
  waitProgress: number
  roundHistory: number[]
  elapsedMs: number
  plane: PlaneTransform
  serverSeedHash: string
  nonce: number
  revealedSeed: string
  liveBets: SharedLiveBet[]
}

interface ServerSnapshot {
  phase: Phase
  roundId: string
  nonce: number
  multiplier: number
  crashPoint: number
  waitProgress: number
  roundHistory: number[]
  elapsedMs: number
  serverSeedHash: string
  revealedSeed: string
  liveBets?: SharedLiveBet[]
}

export function computeMultiplier(ms: number): number {
  return Math.pow(Math.E, 0.00006 * ms)
}

export const MAX_X = 0.92
export const MAX_Y = 0.85
export const TRAVERSE_MS = 10000

export function mapX(elMs: number): number {
  const t = Math.min(1, elMs / TRAVERSE_MS)
  return Math.min(MAX_X, Math.pow(t, 1.6) * MAX_X)
}

export function mapY(mult: number): number {
  const v = Math.max(0, mult - 1)
  return Math.min(MAX_Y, Math.pow(v, 0.38) * MAX_Y * 0.92)
}

function tiltDeg(ny: number, elapsedMs: number): number {
  const ratio = Math.min(1, ny / MAX_Y)
  const base = 28 * Math.pow(1 - ratio, 1.0) + 2
  const oscStrength = ratio > 0.6 ? (ratio - 0.6) / 0.4 * 1.8 : 0
  const osc = oscStrength * Math.sin(elapsedMs * 0.002)
  return base + osc
}

const DEFAULT_PLANE: PlaneTransform = {
  nx: 0,
  ny: 0,
  angleDeg: 0,
  crashOffsetX: 0,
  crashOffsetY: 0,
  offScreen: false
}

const INITIAL_STATE: GameState = {
  phase: 'waiting',
  multiplier: 1,
  crashPoint: 0,
  waitProgress: 0,
  roundHistory: [],
  elapsedMs: 0,
  plane: DEFAULT_PLANE,
  serverSeedHash: '',
  nonce: 1,
  revealedSeed: '',
  liveBets: []
}
const MAX_SHARED_LIVE_BETS = 10

function derivePlane(snapshot: ServerSnapshot, prevPlane: PlaneTransform): PlaneTransform {
  if (snapshot.phase === 'flying') {
    const nx = mapX(snapshot.elapsedMs)
    const ny = mapY(snapshot.multiplier)
    const ratio = Math.min(1, ny / MAX_Y)
    const bobStrength = ratio > 0.6 ? ((ratio - 0.6) / 0.4) * 0.012 : 0
    const bob = bobStrength * Math.sin(snapshot.elapsedMs * 0.0015)

    return {
      nx,
      ny: ny + bob,
      angleDeg: tiltDeg(ny, snapshot.elapsedMs),
      crashOffsetX: 0,
      crashOffsetY: 0,
      offScreen: false
    }
  }

  if (snapshot.phase === 'crashing') {
    const seconds = snapshot.elapsedMs / 1000
    const angleRad = (prevPlane.angleDeg * Math.PI) / 180
    const speed = 3.5
    const accel = 1 + seconds * 6
    const dist = speed * seconds * accel
    const crashOffsetX = Math.cos(angleRad) * dist
    const crashOffsetY = Math.sin(angleRad) * dist

    return {
      ...prevPlane,
      angleDeg: prevPlane.angleDeg + seconds * 15,
      crashOffsetX,
      crashOffsetY,
      offScreen: prevPlane.nx + crashOffsetX > 1.5 || prevPlane.ny + crashOffsetY > 1.5
    }
  }

  if (snapshot.phase === 'waiting') {
    return DEFAULT_PLANE
  }

  return prevPlane
}

export function useGameState(): GameState {
  const [state, setState] = useState<GameState>(INITIAL_STATE)
  const planeRef = useRef<PlaneTransform>(DEFAULT_PLANE)

  useEffect(() => {
    const socket = getSocket()

    const applySnapshot = (snapshot: ServerSnapshot) => {
      setState(prev => {
        const nextPlane = derivePlane(snapshot, planeRef.current)
        planeRef.current = nextPlane

        return {
          phase: snapshot.phase,
          multiplier: snapshot.multiplier,
          crashPoint: snapshot.crashPoint,
          waitProgress: snapshot.waitProgress,
          roundHistory: snapshot.roundHistory,
          elapsedMs: snapshot.elapsedMs,
          plane: nextPlane,
          serverSeedHash: snapshot.serverSeedHash,
          nonce: snapshot.nonce,
          revealedSeed: snapshot.revealedSeed,
          liveBets: snapshot.liveBets ?? prev.liveBets
        }
      })
    }

    const applyLiveBets = (liveBets: SharedLiveBet[]) => {
      setState(prev => ({ ...prev, liveBets: liveBets.slice(0, MAX_SHARED_LIVE_BETS) }))
    }

    socket.on('GAME_SNAPSHOT', applySnapshot)
    socket.on('LIVE_BETS_SNAPSHOT', applyLiveBets)

    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('GAME_SNAPSHOT', applySnapshot)
      socket.off('LIVE_BETS_SNAPSHOT', applyLiveBets)
    }
  }, [])

  return state
}
