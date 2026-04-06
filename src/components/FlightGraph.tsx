import { useRef, useEffect, useCallback } from "react";
import { GamePhase, getMultiplierColor } from "@/lib/gameEngine";

interface FlightGraphProps {
  phase: GamePhase;
  multiplier: number;
  countdown: number;
}

export function FlightGraph({ phase, multiplier, countdown }: FlightGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const animRef = useRef<number>(0);
  const prevPhaseRef = useRef<GamePhase>("waiting");

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const padLeft = 50;
    const padBottom = 40;
    const padTop = 30;
    const padRight = 20;

    ctx.clearRect(0, 0, W, H);

    const drawW = W - padLeft - padRight;
    const drawH = H - padBottom - padTop;

    ctx.fillStyle = "rgba(15, 20, 40, 0)";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padTop + (drawH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const x = padLeft + (drawW / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, H - padBottom);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, H - padBottom);
    ctx.lineTo(W - padRight, H - padBottom);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    const maxM = Math.max(multiplier * 1.2, 2.0);
    for (let i = 0; i <= 4; i++) {
      const val = 1 + (maxM - 1) * (i / 4);
      const y = padTop + drawH - (drawH * (val - 1)) / (maxM - 1);
      ctx.fillText(`${val.toFixed(1)}x`, padLeft - 6, y + 4);
    }

    if (phase === "waiting" || pointsRef.current.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "center";
      return;
    }

    if (pointsRef.current.length < 2) return;

    const color = getMultiplierColor(multiplier);

    const gradient = ctx.createLinearGradient(padLeft, padTop, W - padRight, padTop);
    gradient.addColorStop(0, color + "33");
    gradient.addColorStop(1, color + "11");

    const firstPt = pointsRef.current[0];
    const lastPt = pointsRef.current[pointsRef.current.length - 1];

    ctx.beginPath();
    ctx.moveTo(firstPt.x, firstPt.y);
    for (let i = 1; i < pointsRef.current.length; i++) {
      ctx.lineTo(pointsRef.current[i].x, pointsRef.current[i].y);
    }
    ctx.lineTo(lastPt.x, H - padBottom);
    ctx.lineTo(firstPt.x, H - padBottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(firstPt.x, firstPt.y);
    for (let i = 1; i < pointsRef.current.length; i++) {
      ctx.lineTo(pointsRef.current[i].x, pointsRef.current[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.strokeStyle = color + "88";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (phase === "flying") {
      const planeX = lastPt.x;
      const planeY = lastPt.y;

      ctx.save();
      const dx = lastPt.x - (pointsRef.current[Math.max(0, pointsRef.current.length - 3)].x);
      const dy = lastPt.y - (pointsRef.current[Math.max(0, pointsRef.current.length - 3)].y);
      const angle = Math.atan2(dy, dx);

      ctx.translate(planeX, planeY);
      ctx.rotate(angle);

      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✈️", 0, 0);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(planeX, planeY, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (phase === "crashed") {
      const planeX = lastPt.x;
      const planeY = lastPt.y;

      ctx.save();
      ctx.translate(planeX, planeY);
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💥", 0, 0);
      ctx.restore();
    }
  }, [phase, multiplier]);

  useEffect(() => {
    if (phase === "waiting") {
      pointsRef.current = [];
      prevPhaseRef.current = "waiting";
      drawFrame();
    }
  }, [phase, drawFrame]);

  useEffect(() => {
    if (phase !== "flying" && phase !== "crashed") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.width;
    const H = canvas.height;
    const padLeft = 50;
    const padBottom = 40;
    const padTop = 30;
    const padRight = 20;
    const drawW = W - padLeft - padRight;
    const drawH = H - padBottom - padTop;
    const maxM = Math.max(multiplier * 1.2, 2.0);

    const totalPoints = Math.max(2, pointsRef.current.length + 1);
    const maxPoints = 200;

    const progress = Math.min(1, (multiplier - 1) / (maxM - 1));
    const x = padLeft + progress * drawW;
    const y = padTop + drawH - progress * drawH;

    if (pointsRef.current.length === 0) {
      pointsRef.current.push({ x: padLeft, y: padTop + drawH });
    }

    pointsRef.current.push({ x, y });

    if (pointsRef.current.length > maxPoints) {
      pointsRef.current = pointsRef.current.slice(-maxPoints);
    }

    drawFrame();
  }, [multiplier, phase, drawFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        pointsRef.current = [];
        drawFrame();
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawFrame]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />

      {phase === "waiting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-5xl mb-3">✈️</div>
          <div className="text-white/60 text-sm font-medium">Starting in</div>
          <div className="text-5xl font-bold text-white mt-1">{countdown}s</div>
          <div className="text-white/40 text-xs mt-2">Place your bets!</div>
        </div>
      )}

      {phase === "flying" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div
              className="multiplier-display font-black tracking-tight leading-none"
              style={{
                fontSize: "clamp(3rem, 8vw, 6rem)",
                color: getMultiplierColor(multiplier),
                textShadow: `0 0 30px ${getMultiplierColor(multiplier)}88`,
              }}
            >
              {multiplier.toFixed(2)}x
            </div>
          </div>
        </div>
      )}

      {phase === "crashed" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center crashed-flash">
            <div className="text-red-400 text-lg font-bold mb-1">FLEW AWAY!</div>
            <div
              className="font-black tracking-tight leading-none"
              style={{
                fontSize: "clamp(3rem, 8vw, 6rem)",
                color: "#ef4444",
                textShadow: "0 0 30px #ef444488",
              }}
            >
              {multiplier.toFixed(2)}x
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
