import type { Board, TerrainType, VertexId, EdgeId, HexId } from '@catan-online/shared'
import { useBoardLayout } from '../../hooks/useBoardLayout'
import mountainsImg from '../../assets/terrain/mountains.jpg'
import fieldsImg from '../../assets/terrain/fields.jpg'
import hillsImg from '../../assets/terrain/hills.jpg'
import forestImg from '../../assets/terrain/forest.jpg'
import desertImg from '../../assets/terrain/desert.jpg'
import pastureImg from '../../assets/terrain/pasture.jpg'

// SEA/GOLD have no photo asset -- they're rendered as flat fills instead (see SEA_FILL/GOLD_FILL below).
const TERRAIN_IMAGES: Partial<Record<TerrainType, string>> = {
  HILLS: hillsImg,
  PASTURE: pastureImg,
  MOUNTAINS: mountainsImg,
  FOREST: forestImg,
  FIELDS: fieldsImg,
  DESERT: desertImg,
}

const TERRAIN_LABELS: Record<TerrainType, string> = {
  HILLS: 'レンガ',
  PASTURE: '羊',
  MOUNTAINS: '石',
  FOREST: '木',
  FIELDS: '小麦',
  DESERT: '砂漠',
  SEA: '',
  GOLD: '金鉱',
}

/** Same blue as the board's backdrop rect, so a sea tile blends seamlessly into the open water around it. */
const SEA_FILL = '#4a90d9'
const GOLD_FILL = '#e8c547'

/** Standard probability pips: how many ways (out of 36) a 2d6 roll can produce this number. */
const PROBABILITY_DOTS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
}

const PORT_COLORS: Record<string, string> = {
  GENERIC: '#9e9e9e',
  BRICK: '#c1622d',
  LUMBER: '#2e7d32',
  WOOL: '#8bc34a',
  GRAIN: '#f9d94f',
  ORE: '#78909c',
}
const PORT_LABELS: Record<string, string> = {
  GENERIC: '',
  BRICK: 'レンガ',
  LUMBER: '木',
  WOOL: '羊',
  GRAIN: '小麦',
  ORE: '石',
}
const PORT_RATIO_LABELS: Record<string, string> = {
  GENERIC: '3:1',
  BRICK: '2:1',
  LUMBER: '2:1',
  WOOL: '2:1',
  GRAIN: '2:1',
  ORE: '2:1',
}

/** The classic "house" pentagon silhouette (flat base + peaked roof) real Catan settlement pieces
 * use -- reads as a literal little building instead of an abstract token. */
function pentaPoints(cx: number, cy: number, w: number, h: number): string {
  const hw = w / 2
  return [
    [cx - hw, cy + h / 2],
    [cx + hw, cy + h / 2],
    [cx + hw, cy - h / 6],
    [cx, cy - h / 2],
    [cx - hw, cy - h / 6],
  ]
    .map((p) => p.join(','))
    .join(' ')
}

/** A single crenellated tower silhouette for cities -- one coherent shape (not two overlapping
 * houses, which reads as a rendering glitch at this scale). */
function castlePoints(cx: number, cy: number, w: number, h: number): string {
  const seg = w / 5
  const x0 = cx - w / 2
  const x1 = x0 + seg
  const x2 = x1 + seg
  const x3 = x2 + seg
  const x4 = x3 + seg
  const x5 = x4 + seg
  const topY = cy - h / 2
  const baseTopY = topY + h * 0.24
  const bottomY = cy + h / 2
  return [
    [x0, bottomY],
    [x0, topY],
    [x1, topY],
    [x1, baseTopY],
    [x2, baseTopY],
    [x2, topY],
    [x3, topY],
    [x3, baseTopY],
    [x4, baseTopY],
    [x4, topY],
    [x5, topY],
    [x5, bottomY],
  ]
    .map((p) => p.join(','))
    .join(' ')
}

export interface HexBoardProps {
  board: Board
  playerColorById: Record<string, string>
  selectableVertexIds?: Set<VertexId>
  selectableEdgeIds?: Set<EdgeId>
  selectableHexIds?: Set<HexId>
  highlightedNumber?: number | null
  onVertexClick?: (vertexId: VertexId) => void
  onEdgeClick?: (edgeId: EdgeId) => void
  onHexClick?: (hexId: HexId) => void
}

export function HexBoard({
  board,
  playerColorById,
  selectableVertexIds,
  selectableEdgeIds,
  selectableHexIds,
  highlightedNumber,
  onVertexClick,
  onEdgeClick,
  onHexClick,
}: HexBoardProps) {
  const layout = useBoardLayout(board)
  if (!layout) return null

  const { hexCenters, hexCorners, vertexPoints, bounds } = layout
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  return (
    <svg className="hex-board" viewBox={`${bounds.minX} ${bounds.minY} ${width} ${height}`} role="img" aria-label="開拓GAMEの盤面">
      <rect x={bounds.minX} y={bounds.minY} width={width} height={height} fill="#4a90d9" />

      <defs>
        {Object.values(board.tiles)
          .filter((tile) => TERRAIN_IMAGES[tile.terrain])
          .map((tile) => {
            const corners = hexCorners[tile.id]
            const xs = corners.map((c) => c.x)
            const ys = corners.map((c) => c.y)
            const minX = Math.min(...xs)
            const minY = Math.min(...ys)
            const w = Math.max(...xs) - minX
            const h = Math.max(...ys) - minY
            return (
              <pattern key={tile.id} id={`terrain-${tile.id}`} patternUnits="userSpaceOnUse" x={minX} y={minY} width={w} height={h}>
                <image href={TERRAIN_IMAGES[tile.terrain]} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
              </pattern>
            )
          })}
        {/* gentle vignette toward a tile's edge only, so the photo stays vivid at the centre while
            the hex frame still reads as one deliberate edge (replaces the old flat white wash) */}
        <radialGradient id="tileVignette" cx="50%" cy="50%" r="68%">
          <stop offset="68%" stopColor="#000000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.28} />
        </radialGradient>
        <filter id="robberGlowFilter" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={4.5} />
        </filter>
        {/* bright gold, not dark grey -- the pawn needs to pop against the darkened robber tile */}
        <linearGradient id="robberGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f0c56a" />
          <stop offset="100%" stopColor="#b9791f" />
        </linearGradient>
        {/* shared "3D piece" treatment for roads/settlements/cities: a sheen (bright top-left corner
            fading to a dark edge) so a flat colour fill reads as a small domed/beveled object */}
        <radialGradient id="pieceSheen" cx="32%" cy="26%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.6} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.32} />
        </radialGradient>
        <filter id="pieceShadow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx={0} dy={1.4} stdDeviation={1.2} floodColor="#000000" floodOpacity={0.5} />
        </filter>
      </defs>

      {Object.values(board.tiles).map((tile) => {
        const corners = hexCorners[tile.id]
        const points = corners.map((c) => `${c.x},${c.y}`).join(' ')
        const center = hexCenters[tile.id]
        const isRobber = tile.id === board.robberHexId
        const isPirate = tile.id === board.pirateHexId
        const selectable = selectableHexIds?.has(tile.id)
        const isRolledNumber = highlightedNumber != null && tile.numberToken === highlightedNumber
        const hasPhoto = Boolean(TERRAIN_IMAGES[tile.terrain])
        const flatFill = tile.terrain === 'GOLD' ? GOLD_FILL : SEA_FILL
        // the robber pawn sits right beside the number token (not a separate mark elsewhere on the
        // tile) so "which number is blocked" reads in one glance instead of two
        const pairOffset = isRobber && tile.numberToken ? 15 : 0
        const numCx = center.x - pairOffset
        const robberCx = isRobber ? center.x + (tile.numberToken ? 19 : 0) : center.x
        const robberCy = center.y + 6
        return (
          <g key={tile.id}>
            {/* a soft pulsing red halo *behind* everything else on the tile, so the robber's
                location reads instantly even before you spot the pawn or the tile's own border */}
            {isRobber && (
              <circle
                cx={center.x}
                cy={center.y}
                r={44}
                fill="none"
                stroke="var(--gp-danger)"
                strokeWidth={10}
                filter="url(#robberGlowFilter)"
                className="robber-glow"
              />
            )}
            <polygon
              points={points}
              fill={hasPhoto ? `url(#terrain-${tile.id})` : flatFill}
              stroke={isRolledNumber ? '#ffd600' : isRobber ? 'var(--gp-danger)' : '#2b2b2b'}
              strokeWidth={isRolledNumber ? 4 : isRobber ? 4.5 : 1.5}
              onClick={selectable ? () => onHexClick?.(tile.id) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
              opacity={selectable ? 0.85 : 1}
            />
            {/* gentle vignette toward the border only -- keeps the photo vivid at the centre while
                the hex frame still reads as one deliberate edge, and it naturally darkens exactly
                where pieces/roads sit (the corners/edges), helping their contrast for free */}
            <polygon points={points} fill="url(#tileVignette)" style={{ pointerEvents: 'none' }} />
            {isRobber && (
              // darkened + warmed so it reads as "blocked", distinct from a merely-shadowed tile
              <polygon points={points} fill="rgba(30,4,4,0.5)" style={{ pointerEvents: 'none' }} />
            )}
            {/* the pirate ship marker uses a skull, so it's never confused with the robber */}
            {isPirate && (
              <g style={{ pointerEvents: 'none' }}>
                <polygon points={points} fill="#000000" opacity={0.45} />
                <text x={center.x} y={center.y + 8} textAnchor="middle" fontSize={26}>
                  ☠️
                </text>
              </g>
            )}
            {tile.terrain !== 'SEA' && (
              <text
                x={center.x}
                y={center.y - 22}
                textAnchor="middle"
                fontSize={11}
                fontWeight="bold"
                fill="#fff"
                stroke="rgba(0,0,0,0.45)"
                strokeWidth={3}
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {TERRAIN_LABELS[tile.terrain]}
              </text>
            )}
            {isRobber && (
              <g style={{ pointerEvents: 'none' }}>
                <ellipse cx={robberCx} cy={robberCy + 16} rx={8} ry={2.5} fill="rgba(0,0,0,0.5)" />
                {/* a bright gold pawn (not a dark grey one) so it stands out against the darkened
                    tile, plus a thin red rim to tie it back to the glow/border treatment above */}
                <path
                  d={`M ${robberCx - 7} ${robberCy + 13} Q ${robberCx - 7} ${robberCy + 2} ${robberCx} ${robberCy - 4} Q ${robberCx + 7} ${robberCy + 2} ${robberCx + 7} ${robberCy + 13} Z`}
                  fill="url(#robberGrad)"
                  stroke="var(--gp-danger)"
                  strokeWidth={1.6}
                />
                <circle cx={robberCx} cy={robberCy - 9} r={5.5} fill="url(#robberGrad)" stroke="var(--gp-danger)" strokeWidth={1.6} />
              </g>
            )}
            {tile.numberToken && (
              // pointer-events: none so a click aimed at a tile's center (where this badge sits)
              // still reaches the tile polygon underneath instead of being silently swallowed
              <g style={{ pointerEvents: 'none' }}>
                {isRolledNumber && (
                  <circle cx={numCx} cy={center.y} r={20} fill="none" stroke="#ffd600" strokeWidth={3} className="number-token-glow" />
                )}
                <circle cx={numCx} cy={center.y} r={16} fill="#f5ecd7" stroke="#1b1b1b" />
                <circle cx={numCx} cy={center.y} r={16} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} transform="translate(0,-1)" />
                <text
                  x={numCx}
                  y={center.y + 3}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight="bold"
                  fill={tile.numberToken === 6 || tile.numberToken === 8 ? '#c62828' : '#1b1b1b'}
                >
                  {tile.numberToken}
                </text>
                {(() => {
                  const dots = PROBABILITY_DOTS[tile.numberToken] ?? 0
                  const dotSpacing = 4
                  const startX = numCx - ((dots - 1) * dotSpacing) / 2
                  return Array.from({ length: dots }, (_, i) => (
                    <circle
                      key={i}
                      cx={startX + i * dotSpacing}
                      cy={center.y + 11}
                      r={1.2}
                      fill={tile.numberToken === 6 || tile.numberToken === 8 ? '#c62828' : '#1b1b1b'}
                    />
                  ))
                })()}
              </g>
            )}
          </g>
        )
      })}

      {board.ports.map((port) => {
        const [vA, vB] = port.vertexIds
        const pA = vertexPoints[vA]
        const pB = vertexPoints[vB]
        if (!pA || !pB) return null
        const midX = (pA.x + pB.x) / 2
        const midY = (pA.y + pB.y) / 2
        // push the icon outward from the board center so it reads as sitting just offshore
        const dist = Math.hypot(midX, midY) || 1
        const dirX = midX / dist
        const dirY = midY / dist
        const iconX = midX + dirX * 22
        const iconY = midY + dirY * 22
        // keep pushing the label further out along the same outward direction so it never lands back on a tile
        const labelX = midX + dirX * 42
        const labelY = midY + dirY * 42
        return (
          <g key={port.id}>
            <line x1={pA.x} y1={pA.y} x2={iconX} y2={iconY} stroke="#5d4037" strokeWidth={1.5} strokeDasharray="3,2" />
            <line x1={pB.x} y1={pB.y} x2={iconX} y2={iconY} stroke="#5d4037" strokeWidth={1.5} strokeDasharray="3,2" />
            <circle cx={iconX} cy={iconY} r={13} fill={PORT_COLORS[port.type]} stroke="#5d4037" strokeWidth={1.5} />
            {PORT_RATIO_LABELS[port.type] && (
              <text
                x={labelX}
                y={labelY + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight="bold"
                fill="#3e2723"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {PORT_LABELS[port.type] ? `${PORT_LABELS[port.type]} ${PORT_RATIO_LABELS[port.type]}` : PORT_RATIO_LABELS[port.type]}
              </text>
            )}
          </g>
        )
      })}

      {Object.values(board.edges).map((edge) => {
        const [vA, vB] = edge.vertexIds
        const pA = vertexPoints[vA]
        const pB = vertexPoints[vB]
        if (!pA || !pB) return null
        const selectable = selectableEdgeIds?.has(edge.id)
        const piece = edge.road ?? edge.ship
        const color = piece ? playerColorById[piece.playerId] ?? '#000' : undefined
        // Perpendicular unit vector, for a thin highlight offset to one side of the road/ship --
        // suggests light hitting the rounded top of a plank, matching the settlement/city sheen.
        // Canonicalized to always point "up" in screen space (ny <= 0): edge.vertexIds' order is
        // arbitrary per edge, so using the raw perpendicular would flip the highlight to whichever
        // side pA/pB happened to land on, making adjacent roads look like they used different art.
        const dx = pB.x - pA.x
        const dy = pB.y - pA.y
        const len = Math.hypot(dx, dy) || 1
        let nx = -dy / len
        let ny = dx / len
        if (ny > 0 || (ny === 0 && nx < 0)) {
          nx = -nx
          ny = -ny
        }
        return (
          <g key={edge.id}>
            {/* a selectable edge that already carries a piece (e.g. a ship offered up to move) needs
                its own highlight -- the normal white halo below is hidden behind the piece's color */}
            {piece && selectable && (
              <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#ffd600" strokeWidth={16} strokeLinecap="round" opacity={0.75} />
            )}
            {piece && (
              <g filter="url(#pieceShadow)">
                <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
                <line
                  x1={pA.x}
                  y1={pA.y}
                  x2={pB.x}
                  y2={pB.y}
                  stroke={color}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={edge.ship ? '4,4' : undefined}
                />
                <line
                  x1={pA.x + nx * 1.1}
                  y1={pA.y + ny * 1.1}
                  x2={pB.x + nx * 1.1}
                  y2={pB.y + ny * 1.1}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            )}
            {!piece && (
              <line
                x1={pA.x}
                y1={pA.y}
                x2={pB.x}
                y2={pB.y}
                stroke={selectable ? '#ffffffaa' : 'transparent'}
                strokeWidth={20}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* invisible wide hit-target, kept separate from the (thin, piece-colored) visible line
                above so a selectable ship stays comfortably clickable without changing its width */}
            <line
              x1={pA.x}
              y1={pA.y}
              x2={pB.x}
              y2={pB.y}
              stroke="transparent"
              strokeWidth={20}
              strokeLinecap="round"
              onClick={selectable ? () => onEdgeClick?.(edge.id) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
            />
          </g>
        )
      })}

      {Object.values(board.vertices).map((vertex) => {
        const p = vertexPoints[vertex.id]
        if (!p) return null
        const selectable = selectableVertexIds?.has(vertex.id)
        const color = vertex.building ? playerColorById[vertex.building.playerId] ?? '#000' : undefined
        return (
          <g key={vertex.id}>
            {selectable && <circle cx={p.x} cy={p.y} r={14} fill="#ffffffaa" />}
            {vertex.building?.type === 'SETTLEMENT' && (
              <g filter="url(#pieceShadow)">
                <polygon points={pentaPoints(p.x, p.y, 15, 17)} fill="#ffffff" />
                <polygon points={pentaPoints(p.x, p.y, 12, 14)} fill={color} stroke="#1b1b1b" strokeWidth={1.2} />
                <polygon points={pentaPoints(p.x, p.y, 12, 14)} fill="url(#pieceSheen)" style={{ pointerEvents: 'none' }} />
              </g>
            )}
            {vertex.building?.type === 'CITY' && (
              <g filter="url(#pieceShadow)">
                <polygon points={castlePoints(p.x, p.y, 20, 22)} fill="#ffffff" />
                <polygon points={castlePoints(p.x, p.y, 17, 19)} fill={color} stroke="#1b1b1b" strokeWidth={1.3} strokeLinejoin="round" />
                <polygon points={castlePoints(p.x, p.y, 17, 19)} fill="url(#pieceSheen)" style={{ pointerEvents: 'none' }} />
                {/* a small dark doorway/window slit for a bit of character at a glance */}
                <rect x={p.x - 1.6} y={p.y + 1.5} width={3.2} height={6.1} rx={0.6} fill="rgba(0,0,0,0.35)" style={{ pointerEvents: 'none' }} />
                <text
                  x={p.x}
                  y={p.y - 2.5}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="#ffd76b"
                  style={{ pointerEvents: 'none' }}
                >
                  ★
                </text>
              </g>
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={selectable ? 18 : 4}
              fill="transparent"
              onClick={selectable ? () => onVertexClick?.(vertex.id) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
            />
          </g>
        )
      })}
    </svg>
  )
}
