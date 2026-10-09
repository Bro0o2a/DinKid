"use client";

import { Check, Crop, Paintbrush, RotateCw, Sparkles, Trash2, Type, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

// A small photo editor shown before a photo is sent or saved:
// crop, rotate, filters, drawing and text. Everything happens on the phone.

type Rect = { x: number; y: number; w: number; h: number };
type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
type Label = { id: number; text: string; color: string; size: number; x: number; y: number };
type Tool = "crop" | "draw" | "text" | "filter";
type Filter = "none" | "bw" | "warm" | "vivid" | "fade";

const COLORS = ["#ffffff", "#111111", "#7b1e33", "#e11d48", "#f59e0b", "#16a34a", "#2563eb"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "bw", label: "B&W" },
  { id: "warm", label: "Warm" },
  { id: "vivid", label: "Vivid" },
  { id: "fade", label: "Soft" },
];
const MAX_SIDE = 2000;
const MIN_CROP = 40;

type Props = {
  file: File;
  // Profile and family photos are always square.
  square?: boolean;
  onCancel: () => void;
  onDone: (photo: Blob) => void;
};

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Pixel filters (canvas `filter` is not available on every iPhone).
function applyFilter(source: HTMLCanvasElement, filter: Filter) {
  const out = makeCanvas(source.width, source.height);
  const ctx = out.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  if (filter === "none") return out;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    if (filter === "bw") {
      r = g = b = grey;
    } else if (filter === "warm") {
      r = r * 1.08 + 12;
      g = g * 1.02 + 4;
      b = b * 0.88;
    } else if (filter === "vivid") {
      r = grey + (r - grey) * 1.45;
      g = grey + (g - grey) * 1.45;
      b = grey + (b - grey) * 1.45;
      r = (r - 128) * 1.08 + 128;
      g = (g - 128) * 1.08 + 128;
      b = (b - 128) * 1.08 + 128;
    } else if (filter === "fade") {
      r = grey + (r - grey) * 0.75;
      g = grey + (g - grey) * 0.75;
      b = grey + (b - grey) * 0.75;
      r = r * 0.85 + 38;
      g = g * 0.85 + 34;
      b = b * 0.85 + 30;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
    ctx.stroke();
  }
}

function labelFont(l: Label) {
  return `700 ${l.size}px system-ui, -apple-system, sans-serif`;
}

function drawLabels(ctx: CanvasRenderingContext2D, labels: Label[], selected?: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of labels) {
    ctx.font = labelFont(l);
    // Outline keeps text readable on any photo.
    ctx.lineWidth = l.size / 7;
    ctx.strokeStyle = l.color === "#111111" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)";
    ctx.strokeText(l.text, l.x, l.y);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, l.x, l.y);
    if (l.id === selected) {
      const w = ctx.measureText(l.text).width;
      ctx.setLineDash([l.size / 5, l.size / 5]);
      ctx.lineWidth = Math.max(2, l.size / 18);
      ctx.strokeStyle = "#fff";
      ctx.strokeRect(l.x - w / 2 - l.size / 4, l.y - l.size * 0.65, w + l.size / 2, l.size * 1.3);
      ctx.setLineDash([]);
    }
  }
}

function labelAt(ctx: CanvasRenderingContext2D, labels: Label[], x: number, y: number) {
  for (const l of [...labels].reverse()) {
    ctx.font = labelFont(l);
    const w = ctx.measureText(l.text).width;
    if (Math.abs(x - l.x) <= w / 2 + l.size / 3 && Math.abs(y - l.y) <= l.size * 0.75) return l;
  }
  return undefined;
}

export function PhotoEditor({ file, square = false, onCancel, onDone }: Props) {
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [filtered, setFiltered] = useState<HTMLCanvasElement | null>(null);
  const [filter, setFilter] = useState<Filter>("none");
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selected, setSelected] = useState<number | undefined>();
  const [tool, setTool] = useState<Tool>(square ? "crop" : "draw");
  const [color, setColor] = useState(COLORS[3]);
  const [brush, setBrush] = useState(8);
  const [draft, setDraft] = useState("");
  const [box, setBox] = useState({ w: 320, h: 400 });
  const [saving, setSaving] = useState(false);
  const { t } = useT();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: "draw" }
    | { kind: "label"; id: number; dx: number; dy: number }
    | { kind: "crop"; mode: "move" | "nw" | "ne" | "sw" | "se"; start: { x: number; y: number }; rect: Rect }
    | null
  >(null);

  // Load the photo, shrinking very large ones.
  useEffect(() => {
    let live = true;
    createImageBitmap(file).then((bitmap) => {
      if (!live) return;
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const c = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
      c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
      setBase(c);
      const side = Math.min(c.width, c.height);
      setCrop(square ? { x: (c.width - side) / 2, y: (c.height - side) / 2, w: side, h: side } : { x: 0, y: 0, w: c.width, h: c.height });
    });
    return () => {
      live = false;
    };
  }, [file, square]);

  useEffect(() => {
    if (base) setFiltered(applyFilter(base, filter));
  }, [base, filter]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth - 24, h: el.clientHeight - 24 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The part of the photo on screen: all of it while cropping, otherwise the cropped part.
  const region: Rect = tool === "crop" && base ? { x: 0, y: 0, w: base.width, h: base.height } : crop;
  const scale = Math.min(box.w / region.w, box.h / region.h);
  const fontScale = 1 / scale;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !filtered) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = region.w * scale;
    const cssH = region.h * scale;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, -region.x * scale * dpr, -region.y * scale * dpr);
    ctx.drawImage(filtered, 0, 0);
    drawStrokes(ctx, strokes);
    drawLabels(ctx, labels, tool === "text" ? selected : undefined);

    if (tool === "crop") {
      const { x, y, w, h } = crop;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, filtered.width, filtered.height);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(x, y, w, h);
      // Thirds grid and corner handles.
      ctx.lineWidth = 1 / scale;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      for (const t of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(x + w * t, y);
        ctx.lineTo(x + w * t, y + h);
        ctx.moveTo(x, y + h * t);
        ctx.lineTo(x + w, y + h * t);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      const hs = 14 / scale;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
      }
    }
  }, [filtered, region.x, region.y, region.w, region.h, scale, strokes, labels, selected, tool, crop]);

  useEffect(render, [render]);

  function point(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: region.x + (e.clientX - r.left) / scale, y: region.y + (e.clientY - r.top) / scale };
  }

  function onDown(e: React.PointerEvent) {
    if (!base) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "draw") {
      drag.current = { kind: "draw" };
      setStrokes((s) => [...s, { color, width: brush * fontScale, points: [p] }]);
    } else if (tool === "text") {
      const hit = labelAt(canvasRef.current!.getContext("2d")!, labels, p.x, p.y);
      setSelected(hit?.id);
      if (hit) drag.current = { kind: "label", id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
    } else if (tool === "crop") {
      const near = 28 / scale;
      const corners = { nw: [crop.x, crop.y], ne: [crop.x + crop.w, crop.y], sw: [crop.x, crop.y + crop.h], se: [crop.x + crop.w, crop.y + crop.h] } as const;
      const corner = (Object.keys(corners) as (keyof typeof corners)[]).find(
        (k) => Math.abs(p.x - corners[k][0]) < near && Math.abs(p.y - corners[k][1]) < near,
      );
      const inside = p.x > crop.x && p.x < crop.x + crop.w && p.y > crop.y && p.y < crop.y + crop.h;
      if (corner || inside) drag.current = { kind: "crop", mode: corner ?? "move", start: p, rect: crop };
    }
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !base) return;
    const p = point(e);
    if (d.kind === "draw") {
      setStrokes((s) => {
        const last = s[s.length - 1];
        return [...s.slice(0, -1), { ...last, points: [...last.points, p] }];
      });
    } else if (d.kind === "label") {
      setLabels((ls) => ls.map((l) => (l.id === d.id ? { ...l, x: p.x - d.dx, y: p.y - d.dy } : l)));
    } else if (d.kind === "crop") {
      const W = base.width, H = base.height;
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      let { x, y, w, h } = d.rect;
      if (d.mode === "move") {
        x = Math.min(Math.max(0, x + dx), W - w);
        y = Math.min(Math.max(0, y + dy), H - h);
      } else {
        // Move the dragged corner, keeping the opposite one fixed.
        const fx = d.mode.includes("w") ? x + w : x;
        const fy = d.mode.includes("n") ? y + h : y;
        let cx = Math.min(Math.max(0, (d.mode.includes("w") ? x : x + w) + dx), W);
        let cy = Math.min(Math.max(0, (d.mode.includes("n") ? y : y + h) + dy), H);
        let nw = Math.max(MIN_CROP, Math.abs(cx - fx));
        let nh = Math.max(MIN_CROP, Math.abs(cy - fy));
        if (square) {
          const maxSide = Math.min(d.mode.includes("w") ? fx : W - fx, d.mode.includes("n") ? fy : H - fy);
          nw = nh = Math.min(Math.max(nw, nh), maxSide);
        }
        cx = d.mode.includes("w") ? fx - nw : fx + nw;
        cy = d.mode.includes("n") ? fy - nh : fy + nh;
        x = Math.min(cx, fx);
        y = Math.min(cy, fy);
        w = nw;
        h = nh;
      }
      setCrop({ x, y, w, h });
    }
  }

  function onUp() {
    drag.current = null;
  }

  // Turns the photo a quarter turn clockwise, along with everything drawn on it.
  function rotate() {
    if (!base) return;
    const H = base.height;
    const c = makeCanvas(base.height, base.width);
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(base, 0, 0);
    const turn = (p: { x: number; y: number }) => ({ x: H - p.y, y: p.x });
    setStrokes((s) => s.map((st) => ({ ...st, points: st.points.map(turn) })));
    setLabels((ls) => ls.map((l) => ({ ...l, ...turn(l) })));
    setCrop((r) => ({ x: H - r.y - r.h, y: r.x, w: r.h, h: r.w }));
    setBase(c);
  }

  function addLabel() {
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    setLabels((ls) => [...ls, { id, text, color, size: 34 * fontScale, x: crop.x + crop.w / 2, y: crop.y + crop.h / 2 }]);
    setSelected(id);
    setDraft("");
  }

  function updateSelected(change: Partial<Label>) {
    setLabels((ls) => ls.map((l) => (l.id === selected ? { ...l, ...change } : l)));
  }

  async function finish() {
    if (!filtered) return;
    setSaving(true);
    const out = makeCanvas(Math.round(crop.w), Math.round(crop.h));
    const ctx = out.getContext("2d")!;
    ctx.translate(-crop.x, -crop.y);
    ctx.drawImage(filtered, 0, 0);
    drawStrokes(ctx, strokes);
    drawLabels(ctx, labels);
    out.toBlob((b) => (b ? onDone(b) : setSaving(false)), "image/jpeg", 0.9);
  }

  const selectedLabel = labels.find((l) => l.id === selected);
  const tools: { id: Tool; label: string; Icon: typeof Crop }[] = [
    { id: "crop", label: "Crop", Icon: Crop },
    { id: "draw", label: "Draw", Icon: Paintbrush },
    { id: "text", label: "Text", Icon: Type },
    { id: "filter", label: "Filters", Icon: Sparkles },
  ];

  const swatches = (value: string, pick: (c: string) => void) => (
    <div className="flex gap-2 justify-center">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => pick(c)}
          className={`size-8 rounded-full border-2 ${value === c ? "border-white scale-110" : "border-white/30"} transition`}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-[#140a0d] text-white flex flex-col select-none">
      <header className="flex items-center justify-between px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-white/10" aria-label={t("Cancel")}>
          <X size={24} />
        </button>
        <div className="flex items-center gap-1">
          {tool === "draw" && strokes.length > 0 && (
            <button onClick={() => setStrokes((s) => s.slice(0, -1))} className="p-2 rounded-full hover:bg-white/10" aria-label={t("Undo")}>
              <Undo2 size={22} />
            </button>
          )}
          <button onClick={rotate} className="p-2 rounded-full hover:bg-white/10" aria-label={t("Rotate")}>
            <RotateCw size={22} />
          </button>
          <button
            onClick={finish}
            disabled={saving || !filtered}
            className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-semibold disabled:opacity-50"
          >
            <Check size={18} /> {saving ? "…" : t("Done")}
          </button>
        </div>
      </header>

      <div ref={areaRef} className="flex-1 min-h-0 flex items-center justify-center">
        {filtered ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="touch-none rounded-sm shadow-2xl"
          />
        ) : (
          <p className="text-white/60">{t("Opening photo…")}</p>
        )}
      </div>

      <div className="px-4 pt-3 min-h-[92px] flex flex-col justify-center gap-3">
        {tool === "crop" && (
          <p className="text-center text-sm text-white/70">
            {square ? t("Drag the square to choose the part to keep.") : t("Drag the corners to cut the photo.")}
          </p>
        )}
        {tool === "draw" && (
          <>
            {swatches(color, setColor)}
            <div className="flex items-center gap-3 max-w-xs mx-auto w-full text-white/70">
              <span className="size-1.5 rounded-full bg-white/70" />
              <input type="range" min={3} max={24} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="flex-1 accent-white" aria-label={t("Brush size")} />
              <span className="size-4 rounded-full bg-white/70" />
            </div>
          </>
        )}
        {tool === "text" &&
          (selectedLabel ? (
            <>
              {swatches(selectedLabel.color, (c) => updateSelected({ color: c }))}
              <div className="flex items-center gap-3 max-w-xs mx-auto w-full">
                <span className="text-xs text-white/70">A</span>
                <input
                  type="range"
                  min={14}
                  max={90}
                  value={Math.round(selectedLabel.size / fontScale)}
                  onChange={(e) => updateSelected({ size: Number(e.target.value) * fontScale })}
                  className="flex-1 accent-white"
                  aria-label={t("Text size")}
                />
                <span className="text-lg text-white/70">A</span>
                <button onClick={() => { setLabels((ls) => ls.filter((l) => l.id !== selected)); setSelected(undefined); }} className="p-2 rounded-full hover:bg-white/10" aria-label={t("Delete text")}>
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setSelected(undefined)} className="p-2 rounded-full hover:bg-white/10" aria-label={t("Done")}>
                  <Check size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              {swatches(color, setColor)}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addLabel();
                }}
                className="flex gap-2 max-w-sm mx-auto w-full"
              >
                <input
                  dir="auto"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("Write something…")}
                  className="flex-1 rounded-full bg-white/10 px-4 py-2 outline-none placeholder:text-white/50"
                  maxLength={80}
                />
                <button disabled={!draft.trim()} className="rounded-full bg-white text-black px-4 font-semibold disabled:opacity-40">{t("Add")}</button>
              </form>
            </>
          ))}
        {tool === "filter" && (
          <div className="flex gap-2 justify-center overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === f.id ? "bg-white text-black" : "bg-white/10"}`}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="grid grid-cols-4 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {tools.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => {
              setTool(id);
              if (id !== "text") setSelected(undefined);
            }}
            className={`flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium ${tool === id ? "text-white" : "text-white/50"}`}
          >
            <span className={`px-4 py-1 rounded-full ${tool === id ? "bg-white/15" : ""}`}>
              <Icon size={22} />
            </span>
            {t(label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
