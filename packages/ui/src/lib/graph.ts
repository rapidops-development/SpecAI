import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import type { IndexedRequirement, SpecIndex } from '../types.ts'

export interface GraphNode {
  id: string
  area: string
  req: IndexedRequirement
}

/** A pair of requirements, `a` before `b` in index order. */
export interface Pair {
  a: string
  b: string
}

export interface SimilarPair extends Pair {
  /** From 0, nothing shared, to 1, the same rare terms and components. */
  weight: number
}

export interface Graph {
  nodes: GraphNode[]
  /** One per pair of requirements joined by a link. */
  edges: Pair[]
  /** Pairs related through the glossary terms and components they share, strongest first per requirement. */
  similar: SimilarPair[]
  /** Requirement ID → the requirements linked to it, in index order. */
  linked: Map<string, string[]>
  /** Requirement ID → the requirements most closely related to it but not linked, strongest first. */
  related: Map<string, string[]>
}

const live = (r: IndexedRequirement) => r.status !== 'deprecated' && r.status !== 'removed'

/** How many weak neighbours each requirement keeps, and the weakest worth keeping. */
const similarPerNode = 5
const similarFloor = 0.15

// SpecAI: UI-025
export function buildGraph(index: SpecIndex): Graph {
  const nodes = index.requirements.filter(live).map((req) => ({ id: req.id, area: req.area, req }))
  const order = new Map(nodes.map((n, i) => [n.id, i]))
  const key = (x: string, y: string) => (order.get(x)! < order.get(y)! ? `${x} ${y}` : `${y} ${x}`)

  const joined = new Set<string>()
  const join = (x: string, y: string) => {
    if (x !== y && order.has(x) && order.has(y)) joined.add(key(x, y))
  }
  for (const [to, froms] of Object.entries(index.backlinks)) for (const from of froms) join(from, to)
  for (const n of nodes) if (n.req.parent) join(n.id, n.req.parent)
  const edges = [...joined].map((k) => {
    const [a, b] = k.split(' ')
    return { a, b }
  })

  const linked = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const { a, b } of edges) {
    linked.get(a)!.push(b)
    linked.get(b)!.push(a)
  }
  for (const list of linked.values()) list.sort((x, y) => order.get(x)! - order.get(y)!)

  const strengths = similarities(index)
  const related = new Map<string, string[]>()
  const kept = new Map<string, number>()
  for (const n of nodes) {
    const best = [...(strengths.get(n.id) ?? [])]
      .filter(([other, w]) => w >= similarFloor && !joined.has(key(n.id, other)))
      .sort((x, y) => y[1] - x[1] || order.get(x[0])! - order.get(y[0])!)
      .slice(0, similarPerNode)
    related.set(n.id, best.map(([other]) => other))
    for (const [other, w] of best) kept.set(key(n.id, other), w)
  }
  const similar = [...kept].map(([k, weight]) => {
    const [a, b] = k.split(' ')
    return { a, b, weight }
  })
  return { nodes, edges, similar, linked, related }
}

/**
 * How strongly each pair of live requirements is related through the glossary terms they link to and
 * the components they list: the cosine of their feature sets, each feature weighted by how rare it is.
 * A feature every requirement has weighs nothing.
 */
// SpecAI: UI-028
export function similarities(index: SpecIndex): Map<string, Map<string, number>> {
  const ids = new Set(index.requirements.filter(live).map((r) => r.id))
  const features = new Map<string, Set<string>>([...ids].map((id) => [id, new Set<string>()]))
  for (const [to, froms] of Object.entries(index.backlinks)) {
    if (!to.startsWith('term:')) continue
    for (const from of froms) features.get(from)?.add(to)
  }
  for (const r of index.requirements) for (const c of r.components ?? []) features.get(r.id)?.add(`component:${c}`)

  const users = new Map<string, string[]>()
  for (const [id, set] of features) for (const f of set) users.set(f, [...(users.get(f) ?? []), id])
  const idf = new Map([...users].map(([f, list]) => [f, Math.log(ids.size / list.length)]))
  const norm = new Map([...features].map(([id, set]) => [id, Math.sqrt([...set].reduce((s, f) => s + idf.get(f)! ** 2, 0))]))

  const dot = new Map<string, Map<string, number>>()
  for (const [f, list] of users) {
    const w = idf.get(f)! ** 2
    if (w === 0) continue
    for (const x of list) for (const y of list) {
      if (x === y) continue
      const row = dot.get(x) ?? dot.set(x, new Map()).get(x)!
      row.set(y, (row.get(y) ?? 0) + w)
    }
  }
  for (const [x, row] of dot) for (const [y, d] of row) row.set(y, d / (norm.get(x)! * norm.get(y)!))
  return dot
}

export interface Point {
  x: number
  y: number
}

export interface Cluster extends Point {
  area: string
  name: string
  r: number
  /** The area's place in the spec tree's area order, which picks its colour. */
  slot: number
  ids: string[]
}

export interface GraphLayout {
  positions: Map<string, Point>
  clusters: Cluster[]
}

/** Gap between clusters, and how much further apart areas sit that share no links. */
const clusterGap = 40
const areaSpread = 260

/**
 * Places each area's requirements in its own circle, areas that link more nearer each other, and
 * within an area requirements nearer the more strongly they are related. The same graph always gets
 * the same layout.
 */
// SpecAI: UI-027, UI-028
export function layoutGraph(index: SpecIndex, graph: Graph): GraphLayout {
  const areaOf = new Map(graph.nodes.map((n) => [n.id, n.area]))
  const areas = index.areas.filter((a) => graph.nodes.some((n) => n.area === a.folder))
  const size = (folder: string) => graph.nodes.filter((n) => n.area === folder).length
  const radius = (folder: string) => 10 * Math.sqrt(size(folder)) + 20

  // Areas first: every pair is held apart by a distance that shrinks the more their requirements link.
  const between = new Map<string, number>()
  const addBetween = (a: string, b: string, w: number) => {
    const [x, y] = [areaOf.get(a)!, areaOf.get(b)!]
    if (x === y) return
    const k = [x, y].sort().join(' ')
    between.set(k, (between.get(k) ?? 0) + w)
  }
  for (const e of graph.edges) addBetween(e.a, e.b, 1)
  for (const s of graph.similar) addBetween(s.a, s.b, s.weight * 0.35)
  // Relative to the smaller area, so a small area linked to a large one still sits beside it.
  const affinity = (x: string, y: string) => (between.get([x, y].sort().join(' ')) ?? 0) / Math.min(size(x), size(y))
  const maxAffinity = Math.max(1e-9, ...areas.flatMap((a) => areas.map((b) => (a === b ? 0 : affinity(a.folder, b.folder)))))

  type AreaDatum = SimulationNodeDatum & { folder: string; r: number }
  const ring = areas.reduce((s, a) => s + radius(a.folder), 0) / Math.PI
  const areaData: AreaDatum[] = areas.map((a, i) => ({
    folder: a.folder,
    r: radius(a.folder),
    x: ring * Math.cos((2 * Math.PI * i) / areas.length),
    y: ring * Math.sin((2 * Math.PI * i) / areas.length),
  }))
  const areaLinks = areaData.flatMap((s, i) => areaData.slice(i + 1).map((t) => ({ source: s, target: t })))
  forceSimulation(areaData)
    .force(
      'link',
      forceLink<AreaDatum, { source: AreaDatum; target: AreaDatum }>(areaLinks)
        .distance((l) => l.source.r + l.target.r + clusterGap + areaSpread * (1 - affinity(l.source.folder, l.target.folder) / maxAffinity))
        .strength(0.3),
    )
    .force('collide', forceCollide<AreaDatum>((d) => d.r + clusterGap))
    .stop()
    .tick(300)
  const centre = new Map(areaData.map((d) => [d.folder, { x: d.x!, y: d.y! }]))

  // Then requirements, starting on a spiral around their area's centre.
  type NodeDatum = SimulationNodeDatum & { id: string; area: string }
  const seen = new Map<string, number>()
  const nodeData: NodeDatum[] = graph.nodes.map((n) => {
    const i = seen.get(n.area) ?? 0
    seen.set(n.area, i + 1)
    const c = centre.get(n.area)!
    return { id: n.id, area: n.area, x: c.x + 9 * Math.sqrt(i + 0.5) * Math.cos(i * 2.39996), y: c.y + 9 * Math.sqrt(i + 0.5) * Math.sin(i * 2.39996) }
  })
  const byId = new Map(nodeData.map((d) => [d.id, d]))
  const sameArea = (a: string, b: string) => areaOf.get(a) === areaOf.get(b)
  const links = [
    ...graph.edges.map((e) => ({ source: byId.get(e.a)!, target: byId.get(e.b)!, strength: sameArea(e.a, e.b) ? 0.6 : 0.02, distance: 16 })),
    ...graph.similar.map((s) => ({ source: byId.get(s.a)!, target: byId.get(s.b)!, strength: (sameArea(s.a, s.b) ? 0.3 : 0.01) * s.weight, distance: 26 })),
  ]
  // Pulls back any requirement that strays past its area's reach, so a few links elsewhere cannot
  // stretch the cluster, while collisions still keep points apart.
  const reach = (area: string) => radius(area) - 10
  const contain = (alpha: number) => {
    for (const d of nodeData) {
      const c = centre.get(d.area)!
      const [dx, dy] = [d.x! - c.x, d.y! - c.y]
      const dist = Math.hypot(dx, dy)
      const over = dist - reach(d.area)
      if (over <= 0) continue
      d.vx! -= (dx / dist) * over * alpha
      d.vy! -= (dy / dist) * over * alpha
    }
  }
  forceSimulation(nodeData)
    .force('link', forceLink<NodeDatum, (typeof links)[number]>(links).strength((l) => l.strength).distance((l) => l.distance))
    .force('charge', forceManyBody<NodeDatum>().strength(-18).distanceMax(90))
    .force('x', forceX<NodeDatum>((d) => centre.get(d.area)!.x).strength(0.12))
    .force('y', forceY<NodeDatum>((d) => centre.get(d.area)!.y).strength(0.12))
    .force('collide', forceCollide(6))
    .force('contain', contain)
    .stop()
    .tick(300)

  // Wrap each area in a circle around its requirements.
  const clusters: Cluster[] = areas.map((a) => {
    const members = nodeData.filter((d) => d.area === a.folder)
    const { x, y, r: inner } = enclose(members.map((d) => ({ x: d.x!, y: d.y! })))
    const r = inner + 14
    return { area: a.folder, name: a.name, x, y, r, slot: index.areas.indexOf(a), ids: members.map((d) => d.id) }
  })
  const move = (c: Cluster, dx: number, dy: number) => {
    c.x += dx
    c.y += dy
    for (const id of c.ids) {
      const d = byId.get(id)!
      d.x! += dx
      d.y! += dy
    }
  }
  for (let round = 0, moved = true; moved && round < 500; round++) {
    moved = false
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const [p, q] = [clusters[i], clusters[j]]
        let dx = q.x - p.x
        let dy = q.y - p.y
        let d = Math.hypot(dx, dy)
        const overlap = p.r + q.r + clusterGap / 2 - d
        if (overlap <= 0) continue
        if (d < 1e-6) [dx, dy, d] = [1, 0, 1]
        move(p, (-dx / d) * (overlap / 2 + 0.5), (-dy / d) * (overlap / 2 + 0.5))
        move(q, (dx / d) * (overlap / 2 + 0.5), (dy / d) * (overlap / 2 + 0.5))
        moved = true
      }
  }

  return { positions: new Map(nodeData.map((d) => [d.id, { x: d.x!, y: d.y! }])), clusters }
}

/** A circle around every point: Ritter's method, close to the smallest such circle. */
function enclose(points: Point[]): Point & { r: number } {
  const far = (from: Point) => points.reduce((best, p) => (Math.hypot(p.x - from.x, p.y - from.y) > Math.hypot(best.x - from.x, best.y - from.y) ? p : best))
  const a = far(points[0])
  const b = far(a)
  let [x, y, r] = [(a.x + b.x) / 2, (a.y + b.y) / 2, Math.hypot(a.x - b.x, a.y - b.y) / 2]
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= r) continue
    const grown = (r + d) / 2
    x += ((p.x - x) * (grown - r)) / d
    y += ((p.y - y) * (grown - r)) / d
    r = grown
  }
  return { x, y, r }
}

export interface KnowledgeGraph extends Graph, GraphLayout {}

const built = new WeakMap<SpecIndex, KnowledgeGraph>()

/** The graph and its layout for an index, worked out once per index. */
export function knowledgeGraph(index: SpecIndex): KnowledgeGraph {
  let result = built.get(index)
  if (!result) {
    const graph = buildGraph(index)
    result = { ...graph, ...layoutGraph(index, graph) }
    built.set(index, result)
  }
  return result
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The box around some points, or around whole clusters. */
export function bounds(points: Point[], clusters: Cluster[] = []): Box | undefined {
  const xs = [...points.map((p) => [p.x, p.x]), ...clusters.map((c) => [c.x - c.r, c.x + c.r])]
  const ys = [...points.map((p) => [p.y, p.y]), ...clusters.map((c) => [c.y - c.r, c.y + c.r])]
  if (xs.length === 0) return undefined
  return { minX: Math.min(...xs.map((v) => v[0])), maxX: Math.max(...xs.map((v) => v[1])), minY: Math.min(...ys.map((v) => v[0])), maxY: Math.max(...ys.map((v) => v[1])) }
}

export interface View {
  /** Pixels per layout unit. */
  k: number
  /** Where the layout's origin lands, in pixels. */
  x: number
  y: number
}

/** The view that fits a box into a width and height, no closer than `maxK`. */
export function fit(box: Box, width: number, height: number, padding = 24, maxK = 2.5): View {
  const k = Math.min(maxK, (width - 2 * padding) / Math.max(1, box.maxX - box.minX), (height - 2 * padding) / Math.max(1, box.maxY - box.minY))
  return { k, x: width / 2 - k * (box.minX + box.maxX) / 2, y: height / 2 - k * (box.minY + box.maxY) / 2 }
}
