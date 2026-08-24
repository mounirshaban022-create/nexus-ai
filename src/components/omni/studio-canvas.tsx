'use client'

/**
 * STUDIO CANVAS — a lightweight, dependency-free visual canvas built on
 * SVG. Gives NEXUS Studio the Canva-class design surface (shapes, arrows,
 * text, freehand drawing, colors, PNG export) without the multi-megabyte
 * weight of Excalidraw — which OOM-killed the dev server during compile.
 *
 * Inspired by the Excalidraw UX (github.com/excalidraw/excalidraw) but
 * implemented natively: select/move/resize, click-drag shape creation,
 * double-click text editing, freehand pen, and PNG export.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Circle,
  Diamond,
  Eraser,
  ListChecks,
  Minus,
  MousePointer2,
  PenLine,
  Square,
  Trash2,
  Type,
} from 'lucide-react'

export interface CanvasElementSeed {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text'
  text?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

interface CanvasElement {
  id: string
  type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text' | 'draw'
  x: number
  y: number
  width: number
  height: number
  text?: string
  points?: Array<[number, number]> // for draw/arrow
  color: string
  fill: string
  stroke: number
}

export interface StudioCanvasProps {
  /** Called with the SVG root once mounted (parent drives export). */
  onReady?: (api: { getSvg: () => SVGSVGElement | null; loadSeeds: (seeds: CanvasElementSeed[]) => void }) => void
}

const PALETTE = ['#1e1e1e', '#D97706', '#BE123C', '#7C3AED', '#0F766E', '#B45309', '#BE185D', '#57534E']

type Tool = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text' | 'pen' | 'eraser'

const TOOL_META: Array<{ id: Tool; icon: any; label: string }> = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'diamond', icon: Diamond, label: 'Diamond' },
  { id: 'arrow', icon: Minus, label: 'Arrow' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'pen', icon: PenLine, label: 'Draw' },
  { id: 'eraser', icon: Eraser, label: 'Erase' },
]

let uid = 0
const nextId = () => `el-${++uid}-${Date.now().toString(36)}`

export function StudioCanvas({ onReady }: StudioCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [elements, setElements] = useState<CanvasElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState(PALETTE[1])
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 })

  // Drag state refs (pointer math)
  const drag = useRef<
    | { mode: 'create'; startX: number; startY: number; el: CanvasElement }
    | { mode: 'move'; startX: number; startY: number; origX: number; origY: number; id: string }
    | { mode: 'resize'; startX: number; startY: number; origW: number; origH: number; id: string }
    | { mode: 'draw'; points: Array<[number, number]>; id: string }
    | null
  >(null)

  const toSvgPoint = useCallback((e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const loadSeeds = useCallback((seeds: CanvasElementSeed[]) => {
    let mapped: CanvasElement[] = (seeds || [])
      .filter((s) => s && typeof s.type === 'string')
      .map((s, i) => ({
        id: `seed-${Date.now()}-${i}`,
        type: s.type === 'arrow' ? 'arrow' : s.type === 'text' ? 'text' : (s.type as 'rectangle' | 'ellipse' | 'diamond'),
        x: Number(s.x) || 80 + i * 40,
        y: Number(s.y) || 80 + i * 30,
        width: Math.min(500, Math.max(80, Number(s.width) || 180)),
        height: Math.min(400, Math.max(50, Number(s.height) || 90)),
        text: s.text ? String(s.text).slice(0, 80) : undefined,
        color: PALETTE[(i % (PALETTE.length - 2)) + 1],
        fill: 'transparent',
        stroke: 2,
      }))

    // AUTO-FIT: AI designs use desktop-ish coordinates (up to ~1500px wide).
    // Scale + translate the whole scene to fit the actual visible canvas so
    // everything is on-screen even on mobile.
    if (mapped.length > 0 && svgRef.current) {
      const viewW = svgRef.current.clientWidth || 800
      const viewH = svgRef.current.clientHeight || 600
      const xs = mapped.map((el) => el.x + el.width)
      const ys = mapped.map((el) => el.y + el.height)
      const minX = Math.min(...mapped.map((el) => el.x))
      const minY = Math.min(...mapped.map((el) => el.y))
      const maxX = Math.max(...xs)
      const maxY = Math.max(...ys)
      const sceneW = maxX - minX
      const sceneH = maxY - minY
      if (sceneW > 0 && sceneH > 0) {
        const pad = 40
        const scale = Math.min(1, (viewW - pad * 2) / sceneW, (viewH - pad * 2) / sceneH)
        const offX = pad + ((viewW - pad * 2) - sceneW * scale) / 2
        const offY = pad + ((viewH - pad * 2) - sceneH * scale) / 2
        mapped = mapped.map((el) => ({
          ...el,
          x: offX + (el.x - minX) * scale,
          y: offY + (el.y - minY) * scale,
          width: Math.max(24, el.width * scale),
          height: Math.max(24, el.height * scale),
          points: el.points
            ? (el.points.map(([px, py]) => [px * scale, py * scale] as [number, number]))
            : undefined,
        }))
      }
    }
    setElements(mapped)
    setSelectedId(null)
  }, [])

  useEffect(() => {
    onReady?.({ getSvg: () => svgRef.current, loadSeeds })
  }, [onReady])

  /* ---------------- Pointer handlers ---------------- */

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const p = toSvgPoint(e)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)

    if (tool === 'select') {
      // Click on empty canvas → deselect
      if (e.target === svgRef.current || (e.target as Element).getAttribute('data-bg') === '1') {
        setSelectedId(null)
        setEditingTextId(null)
      }
      return
    }

    if (tool === 'eraser') return // handled per-element

    if (tool === 'pen') {
      const el: CanvasElement = {
        id: nextId(),
        type: 'draw',
        x: p.x,
        y: p.y,
        width: 0,
        height: 0,
        points: [[0, 0]],
        color,
        fill: 'transparent',
        stroke: 2,
      }
      setElements((prev) => [...prev, el])
      drag.current = { mode: 'draw', points: [[0, 0]], id: el.id }
      return
    }

    if (tool === 'text') {
      setEditingTextId(null)
      const el: CanvasElement = {
        id: nextId(),
        type: 'text',
        x: p.x,
        y: p.y - 16,
        width: 160,
        height: 36,
        text: '',
        color,
        fill: 'transparent',
        stroke: 1,
      }
      setElements((prev) => [...prev, el])
      setEditingTextId(el.id)
      setTextInput('')
      setTextInputPos({ x: p.x, y: p.y - 16 })
      setTool('select')
      return
    }

    // Shape creation (rectangle / ellipse / diamond / arrow)
    const el: CanvasElement = {
      id: nextId(),
      type: tool === 'arrow' ? 'arrow' : tool,
      x: p.x,
      y: p.y,
      width: 0,
      height: 0,
      points: tool === 'arrow' ? [[0, 0]] : undefined,
      color,
      fill: 'transparent',
      stroke: 2,
    }
    setElements((prev) => [...prev, el])
    drag.current = { mode: 'create', startX: p.x, startY: p.y, el }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toSvgPoint(e)

    if (d.mode === 'create') {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== d.el.id) return el
          if (el.type === 'arrow') {
            return { ...el, width: p.x - el.x, height: p.y - el.y, points: [[0, 0], [p.x - el.x, p.y - el.y]] }
          }
          // Normalize negative drag directions
          const x = Math.min(d.startX, p.x)
          const y = Math.min(d.startY, p.y)
          const w = Math.abs(p.x - d.startX)
          const h = Math.abs(p.y - d.startY)
          return { ...el, x, y, width: w, height: h }
        })
      )
    } else if (d.mode === 'move') {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      setElements((prev) =>
        prev.map((el) => (el.id === d.id ? { ...el, x: d.origX + dx, y: d.origY + dy } : el))
      )
    } else if (d.mode === 'resize') {
      const dx = p.x - d.startX
      const dy = p.y - d.startY
      setElements((prev) =>
        prev.map((el) =>
          el.id === d.id ? { ...el, width: Math.max(24, d.origW + dx), height: Math.max(24, d.origH + dy) } : el
        )
      )
    } else if (d.mode === 'draw') {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const rx = e.clientX - rect.left
      const ry = e.clientY - rect.top
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== d.id) return el
          const points = [...(el.points ?? []), [rx - el.x, ry - el.y] as [number, number]]
          const xs = points.map((pt) => pt[0])
          const ys = points.map((pt) => pt[1])
          return {
            ...el,
            points,
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          }
        })
      )
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    if (d?.mode === 'create') {
      // Tiny accidental shapes (click without drag) get removed
      setElements((prev) => prev.filter((el) => !(el.id === d.el.id && el.width < 6 && el.height < 6)))
      setTool('select')
    }
    drag.current = null
  }

  /* ---------------- Element interactions ---------------- */

  const startMove = (e: React.PointerEvent, el: CanvasElement) => {
    if (tool !== 'select') return
    e.stopPropagation()
    const p = toSvgPoint(e)
    setSelectedId(el.id)
    if (editingTextId && editingTextId !== el.id) commitText()
    drag.current = { mode: 'move', startX: p.x, startY: p.y, origX: el.x, origY: el.y, id: el.id }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const startResize = (e: React.PointerEvent, el: CanvasElement) => {
    e.stopPropagation()
    const p = toSvgPoint(e)
    drag.current = { mode: 'resize', startX: p.x, startY: p.y, origW: el.width, origH: el.height, id: el.id }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const eraseElement = (e: React.MouseEvent, el: CanvasElement) => {
    if (tool !== 'eraser') return
    e.stopPropagation()
    setElements((prev) => prev.filter((x) => x.id !== el.id))
  }

  const commitText = () => {
    const id = editingTextId
    if (!id) return
    const value = textInput.trim()
    setElements((prev) => {
      if (!value) return prev.filter((el) => el.id !== id)
      return prev.map((el) => (el.id === id ? { ...el, text: value } : el))
    })
    setEditingTextId(null)
    setTextInput('')
  }

  const deleteSelected = useCallback(() => {
    if (selectedId) {
      setElements((prev) => prev.filter((el) => el.id !== selectedId))
      setSelectedId(null)
    }
  }, [selectedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTextId) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected, editingTextId, selectedId])

  const selected = elements.find((el) => el.id === selectedId) || null

  /* ---------------- Render ---------------- */

  return (
    <div className="relative h-full w-full overflow-hidden bg-white dark:bg-zinc-900" data-canvas-root>
      {/* Floating toolbar */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur">
        {TOOL_META.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); setSelectedId(null) }}
              aria-pressed={tool === t.id}
              title={t.label}
              aria-label={t.label}
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                tool === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c)
              if (selectedId) {
                setElements((prev) => prev.map((el) => (el.id === selectedId ? { ...el, color: c } : el)))
              }
            }}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            className={`h-6 w-6 rounded-full border-2 transition ${color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'}`}
            style={{ background: c }}
          />
        ))}
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        <button
          onClick={deleteSelected}
          disabled={!selectedId}
          title="Delete selected"
          aria-label="Delete selected element"
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Hint */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background/85 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {tool === 'select'
          ? 'Drag shapes to move · corner handle to resize · double-click text to edit · Del to remove'
          : tool === 'pen'
            ? 'Draw freely with the mouse'
            : tool === 'text'
              ? 'Click where the text should go'
              : tool === 'eraser'
                ? 'Click any element to erase it'
                : 'Drag on the canvas to draw the shape'}
      </div>

      {/* Text input overlay */}
      {editingTextId && (
        <input
          autoFocus
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText()
            if (e.key === 'Escape') {
              setElements((prev) => prev.filter((el) => el.id !== editingTextId))
              setEditingTextId(null)
            }
          }}
          placeholder="Type…"
          aria-label="Text content"
          className="absolute z-20 rounded-lg border-2 border-primary bg-background px-2 py-1 text-sm outline-none"
          style={{ left: textInputPos.x, top: textInputPos.y + 40, minWidth: 140 }}
        />
      )}

      {/* The SVG canvas */}
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <rect data-bg="1" x={0} y={0} width="100%" height="100%" fill="transparent" />
        {elements.map((el) => {
          const isSel = el.id === selectedId
          const common = {
            onPointerDown: (e: React.PointerEvent) => startMove(e, el),
            onClick: (e: React.MouseEvent) => eraseElement(e, el),
            onDoubleClick: () => {
              if (el.type === 'text') {
                setEditingTextId(el.id)
                setTextInput(el.text ?? '')
                setTextInputPos({ x: el.x, y: el.y })
              }
            },
            style: { cursor: tool === 'select' ? 'move' : tool === 'eraser' ? 'not-allowed' : 'crosshair' } as React.CSSProperties,
          }
          return (
            <g key={el.id}>
              {el.type === 'rectangle' && (
                <rect {...common} x={el.x} y={el.y} width={el.width} height={el.height} rx={8}
                  fill={el.fill} stroke={el.color} strokeWidth={el.stroke} />
              )}
              {el.type === 'ellipse' && (
                <ellipse {...common} cx={el.x + el.width / 2} cy={el.y + el.height / 2} rx={el.width / 2} ry={el.height / 2}
                  fill={el.fill} stroke={el.color} strokeWidth={el.stroke} />
              )}
              {el.type === 'diamond' && (
                <polygon {...common}
                  points={`${el.x + el.width / 2},${el.y} ${el.x + el.width},${el.y + el.height / 2} ${el.x + el.width / 2},${el.y + el.height} ${el.x},${el.y + el.height / 2}`}
                  fill={el.fill} stroke={el.color} strokeWidth={el.stroke} />
              )}
              {el.type === 'arrow' && (
                <g {...common}>
                  <line x1={el.x} y1={el.y} x2={el.x + el.width} y2={el.y + el.height}
                    stroke={el.color} strokeWidth={el.stroke} />
                  <polygon
                    points={arrowHead(el.x + el.width, el.y + el.height, el.x, el.y, el.color)}
                    fill={el.color} />
                </g>
              )}
              {el.type === 'draw' && (
                <polyline {...common}
                  points={(el.points ?? []).map(([x, y]) => `${el.x + x},${el.y + y}`).join(' ')}
                  fill="none" stroke={el.color} strokeWidth={el.stroke} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {el.type === 'text' && (
                <text {...common} x={el.x} y={el.y + 24}
                  fill={el.color} fontSize={20} fontFamily="ui-sans-serif, system-ui" fontWeight={600}>
                  {el.text || '…'}
                </text>
              )}
              {/* Selection outline + resize handle */}
              {isSel && (
                <>
                  <rect
                    x={el.x - 6} y={el.y - 6}
                    width={(el.type === 'text' ? 140 : el.width) + 12}
                    height={el.height + 12}
                    fill="none" stroke="#D97706" strokeWidth={1.5} strokeDasharray="6 4" pointerEvents="none"
                  />
                  <rect
                    x={el.x + (el.type === 'text' ? 140 : el.width) - 4} y={el.y + el.height - 4}
                    width={12} height={12} rx={3} fill="#D97706" style={{ cursor: 'nwse-resize' }}
                    onPointerDown={(e) => startResize(e, el)}
                  />
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Arrowhead triangle points pointing from (x2,y2) back toward (x1,y1). */
function arrowHead(x2: number, y2: number, x1: number, y1: number, _color: string): string {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = 12
  const a1 = angle + Math.PI - 0.4
  const a2 = angle + Math.PI + 0.4
  return `${x2},${y2} ${x2 + size * Math.cos(a1)},${y2 + size * Math.sin(a1)} ${x2 + size * Math.cos(a2)},${y2 + size * Math.sin(a2)}`
}

/** Serializes the SVG canvas to a PNG blob (for export). */
export async function exportSvgToPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const bbox = svg.getBBox()
  const pad = 24
  clone.setAttribute('width', String(bbox.width + pad * 2))
  clone.setAttribute('height', String(bbox.height + pad * 2))
  clone.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const data = new XMLSerializer().serializeToString(clone)
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`
  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = (bbox.width + pad * 2) * 2
      canvas.height = (bbox.height + pad * 2) * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable'))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Export failed'))
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Could not render canvas'))
    img.src = svgUrl
  })
}
