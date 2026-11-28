import { Maximize, Minus, Plus } from 'lucide-react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Box, bounds, fit, type KnowledgeGraph, type View } from '../../lib/graph.ts'
import { smallIcon } from '../forms/controls.ts'

/** The area colour for a cluster's place in the area order: eight validated hues, then grey. */
export const areaColour = (slot: number) => (slot >= 0 && slot < 8 ? `var(--graph-${slot + 1})` : 'var(--graph-other)')

/** Where to look: a selected requirement and its links, an area's cluster, or everything. */
export function target(kg: KnowledgeGraph, selected?: string, area?: string): Box | undefined {
  const at = selected ? kg.positions.get(selected) : undefined
  if (at) {
    const around = [at, ...(kg.linked.get(selected!) ?? []).map((id) => kg.positions.get(id)!)]
    const box = bounds(around)!
    // A requirement with no links still shows a little of its neighbourhood.
    const pad = Math.max(0, 70 - (box.maxX - box.minX) / 2, 70 - (box.maxY - box.minY) / 2)
    return { minX: box.minX - pad, maxX: box.maxX + pad, minY: box.minY - pad, maxY: box.maxY + pad }
  }
  const cluster = area ? kg.clusters.filter((c) => c.area === area) : []
  return bounds([], cluster.length ? cluster : kg.clusters)
}

function useSize(ref: React.RefObject<HTMLElement | null>, fallback: { width: number; height: number }) {
  const [size, setSize] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => el.clientWidth > 0 && setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The knowledge graph as an SVG picture. Points keep their size on screen at any zoom. With
 * `interactive`, the user can drag to pan, scroll to zoom, and use the zoom buttons.
 */
export function GraphView(props: {
  kg: KnowledgeGraph
  selected?: string
  area?: string
  interactive?: boolean
  label: string
  onChoose: (id: string) => void
  onChooseArea?: (area: string) => void
  /** Changes whenever the view should jump back to what `selected` and `area` pick. */
  focusKey?: string
}) {
  const { kg, selected, area, interactive = false, label, onChoose, onChooseArea, focusKey } = props
  const box = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(box, { width: 288, height: 240 })
  const goal = useMemo(() => target(kg, selected, area), [kg, selected, area])
  const fitted = useMemo(() => (goal ? fit(goal, width, height) : { k: 1, x: width / 2, y: height / 2 }), [goal, width, height])
  const [view, setView] = useState<View>(fitted)
  const [dragging, setDragging] = useState(false)
  // How the camera moves to the next view: a flight to a new target, a quick follow for zooming.
  const [motion, setMotion] = useState<'fly' | 'quick'>('fly')
  // Points start at their area's centre and spread out once the first frame has drawn.
  const [entered, setEntered] = useState(reducedMotion)
  const [hover, setHover] = useState<string>()
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean }>(undefined)

  // Labels wait until the points have arrived.
  const [settled, setSettled] = useState(reducedMotion)
  useEffect(() => {
    if (entered) return
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setEntered(true))))
    return () => cancelAnimationFrame(frame)
  }, [entered])
  useEffect(() => {
    if (!entered || settled) return
    const timer = setTimeout(() => setSettled(true), 900)
    return () => clearTimeout(timer)
  }, [entered, settled])

  // Fly to the target when it changes, the box resizes, or the caller asks.
  useEffect(() => {
    setMotion('fly')
    setView(fitted)
  }, [fitted, focusKey])

  const zoomAt = (factor: number, px = width / 2, py = height / 2) => {
    setMotion('quick')
    setView((v) => {
      const k = Math.min(8, Math.max(0.05, v.k * factor))
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
    })
  }

  useEffect(() => {
    const el = box.current
    if (!interactive || !el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const pointer = {
    onPointerDown: (e: React.PointerEvent) => {
      if (!interactive || e.button !== 0) return
      drag.current = { x: e.clientX, y: e.clientY, view, moved: false }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current
      if (!d) return
      const [dx, dy] = [e.clientX - d.x, e.clientY - d.y]
      if (!d.moved && Math.hypot(dx, dy) < 4) return
      if (!d.moved) {
        d.moved = true
        setDragging(true)
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      }
      setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy })
    },
    onPointerUp: () => {
      setDragging(false)
      // Leave `moved` for the click that follows, so a drag never chooses a point.
      setTimeout(() => (drag.current = undefined))
    },
  }
  // Stable callbacks, so panning never redraws the picture.
  const latest = useRef({ onChoose, onChooseArea })
  latest.current = { onChoose, onChooseArea }
  const choose = useCallback((id: string) => void (!drag.current?.moved && latest.current.onChoose(id)), [])
  const chooseAreaStable = useCallback((a: string) => void (!drag.current?.moved && latest.current.onChooseArea?.(a)), [])
  const chooseArea = onChooseArea ? chooseAreaStable : undefined

  const hovered = hover ? kg.nodes.find((n) => n.id === hover) : undefined
  const hoverAt = hover ? kg.positions.get(hover) : undefined

  return (
    <div ref={box} data-entered={entered || undefined} data-settled={settled || undefined} className={`graph relative h-full w-full overflow-hidden select-none ${interactive ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`} {...pointer}>
      <svg width={width} height={height} role="group" aria-label={label} className="block">
        <g
          className={dragging ? undefined : motion === 'fly' ? 'graph-fly' : 'graph-quick'}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <Picture kg={kg} k={view.k} entered={entered} small={!interactive} selected={selected} area={area} onChoose={choose} onChooseArea={chooseArea} onHover={setHover} />
        </g>
      </svg>
      {hovered && hoverAt && !dragging && (
        <div
          className="border-rule bg-surface text-ink pointer-events-none absolute z-10 max-w-64 rounded border px-2 py-1 text-xs shadow"
          style={{ left: Math.min(width - 180, Math.max(4, view.x + hoverAt.x * view.k + 10)), top: Math.max(4, view.y + hoverAt.y * view.k - 34) }}
        >
          <span className="font-semibold">{hovered.id}</span> {hovered.req.title}
        </div>
      )}
      {interactive && (
        <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-md border border-rule bg-surface shadow-sm">
          <button type="button" className="text-muted hover:text-ink p-2" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus {...smallIcon} /></button>
          <button type="button" className="text-muted hover:text-ink border-rule border-y p-2" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><Minus {...smallIcon} /></button>
          <button type="button" className="text-muted hover:text-ink p-2" aria-label="Fit to view" onClick={() => { setMotion('fly'); setView(fitted) }}><Maximize {...smallIcon} /></button>
        </div>
      )}
    </div>
  )
}

type State = 'selected' | 'linked' | 'dimmed' | 'normal'

/** Everything inside the moving group. Redrawn on zoom and selection, never on pan. */
// SpecAI: UI-033
const Picture = memo(function Picture(props: {
  kg: KnowledgeGraph
  k: number
  entered: boolean
  small: boolean
  selected?: string
  area?: string
  onChoose: (id: string) => void
  onChooseArea?: (area: string) => void
  onHover: (id: string | undefined) => void
}) {
  const { kg, k, entered, small, selected, area, onChoose, onChooseArea, onHover } = props
  const linked = new Set(selected ? kg.linked.get(selected) ?? [] : [])
  const areaOf = new Map(kg.nodes.map((n) => [n.id, n.area]))
  const cluster = new Map(kg.clusters.map((c) => [c.area, c]))
  const has = (id?: string) => !!id && kg.positions.has(id)
  const state = (id: string): State =>
    has(selected) ? (id === selected ? 'selected' : linked.has(id) ? 'linked' : 'dimmed')
    : area ? (areaOf.get(id) === area ? 'normal' : 'dimmed')
    : 'normal'
  const labelled = has(selected) && !small && linked.size <= 16 ? [selected!, ...linked] : has(selected) ? [selected!] : []
  const px = (n: number) => n / k
  const halo = { stroke: 'var(--paper)', strokeWidth: px(3), paintOrder: 'stroke', strokeLinejoin: 'round' } as const
  // Where a point is drawn: its place, or before the entrance its area's centre.
  const at = (id: string) => {
    const p = entered ? kg.positions.get(id)! : cluster.get(areaOf.get(id)!)!
    return { transform: `translate(${p.x}px, ${p.y}px)` }
  }
  // Areas spread out one after another, in area order.
  const delay = (id: string) => ({ transitionDelay: entered ? `${(cluster.get(areaOf.get(id)!)!.slot % 8) * 45}ms` : '0ms' })

  return (
    <>
      {kg.clusters.map((c) => {
        const dim = area && c.area !== area
        return (
          <g key={c.area} className="graph-cluster" opacity={dim ? 0.45 : 1}>
            <circle cx={c.x} cy={c.y} r={c.r} fill={areaColour(c.slot)} fillOpacity={0.06} stroke={areaColour(c.slot)} strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text
              x={c.x}
              y={c.y - c.r - px(6)}
              textAnchor="middle"
              fontSize={px(small ? 10 : 12)}
              fontWeight={700}
              fill="var(--ink)"
              {...halo}
              className={onChooseArea ? 'cursor-pointer hover:underline' : undefined}
              onClick={onChooseArea && (() => onChooseArea(c.area))}
            >
              {c.name}
            </text>
          </g>
        )
      })}
      <g className="graph-edges">
        {kg.edges.map((e) => {
          const [a, b] = [kg.positions.get(e.a)!, kg.positions.get(e.b)!]
          const touches = has(selected) && (e.a === selected || e.b === selected)
          if (touches) {
            // Drawn out from the selected requirement; keyed by it, so each selection draws afresh.
            const [from, to] = e.a === selected ? [a, b] : [b, a]
            return (
              <line
                key={`${e.a} ${e.b} ${selected}`}
                className="graph-draw"
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                pathLength={1}
                strokeDasharray={1}
                stroke="var(--ink)"
                strokeOpacity={0.85}
                strokeWidth={px(1.5)}
              />
            )
          }
          return (
            <line
              key={`${e.a} ${e.b}`}
              className="graph-edge"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--muted)"
              strokeOpacity={has(selected) ? 0.1 : 0.3}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </g>
      {kg.nodes.map((n) => {
        const s = state(n.id)
        const r = s === 'selected' ? 7 : s === 'linked' ? 5.5 : 4.5
        const colour = areaColour(cluster.get(n.area)?.slot ?? -1)
        return (
          <g
            key={n.id}
            data-id={n.id}
            data-state={s}
            className="graph-node cursor-pointer"
            opacity={s === 'dimmed' ? 0.3 : 1}
            style={{ ...at(n.id), ...delay(n.id) }}
            onClick={() => onChoose(n.id)}
            onPointerEnter={() => onHover(n.id)}
            onPointerLeave={() => onHover(undefined)}
          >
            <circle r={px(10)} fill="transparent" />
            {s === 'selected' && <circle className="graph-pulse" r={px(r)} fill="none" stroke={colour} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            <circle
              className="graph-dot"
              style={{ r: px(r) } as React.CSSProperties}
              r={px(r)}
              fill={colour}
              stroke={s === 'selected' ? 'var(--ink)' : 'var(--surface)'}
              strokeWidth={s === 'selected' ? 2 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
      {labelled.map((id) => (
        <text
          key={`${id} ${selected}`}
          className="graph-label"
          style={at(id)}
          x={px(9)}
          y={px(4)}
          fontSize={px(id === selected ? 12 : 10.5)}
          fontWeight={id === selected ? 700 : 400}
          fill="var(--ink)"
          {...halo}
          pointerEvents="none"
        >
          {id}
        </text>
      ))}
    </>
  )
})
