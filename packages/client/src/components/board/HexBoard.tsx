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
        return (
          <g key={tile.id}>
            <polygon
              points={points}
              fill={hasPhoto ? `url(#terrain-${tile.id})` : flatFill}
              stroke={isRolledNumber ? '#ffd600' : '#2b2b2b'}
              strokeWidth={isRolledNumber ? 4 : 1.5}
              onClick={selectable ? () => onHexClick?.(tile.id) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
              opacity={selectable ? 0.85 : 1}
            />
            {/* lighten the photo so player pieces/roads stay readable on top of it */}
            {hasPhoto && <polygon points={points} fill="#ffffff" opacity={0.38} style={{ pointerEvents: 'none' }} />}
            {/* darken the whole tile to mark the robber's tile, instead of a token that would sit on
                top of the number and hide it -- the terrain name and number stay fully readable */}
            {isRobber && <polygon points={points} fill="#000000" opacity={0.4} style={{ pointerEvents: 'none' }} />}
            {/* red X across the tile, corner-to-corner between the flat top edge and flat bottom edge
                (corners[4]/[5] are the top-left/top-right corners, corners[1]/[2] the bottom-right/bottom-left) */}
            {isRobber && (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={corners[4].x} y1={corners[4].y} x2={corners[1].x} y2={corners[1].y} stroke="#e53935" strokeWidth={5} strokeLinecap="round" />
                <line x1={corners[5].x} y1={corners[5].y} x2={corners[2].x} y2={corners[2].y} stroke="#e53935" strokeWidth={5} strokeLinecap="round" />
              </g>
            )}
            {/* the pirate ship marker uses a skull instead of the robber's X, so the two are never confused */}
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
                fill="#1b1b1b"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {TERRAIN_LABELS[tile.terrain]}
              </text>
            )}
            {tile.numberToken && (
              // pointer-events: none so a click aimed at a tile's center (where this badge sits)
              // still reaches the tile polygon underneath instead of being silently swallowed
              <g style={{ pointerEvents: 'none' }}>
                {isRolledNumber && (
                  <circle cx={center.x} cy={center.y} r={20} fill="none" stroke="#ffd600" strokeWidth={3} className="number-token-glow" />
                )}
                <circle cx={center.x} cy={center.y} r={16} fill="#f5ecd7" stroke="#1b1b1b" />
                <text
                  x={center.x}
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
                  const startX = center.x - ((dots - 1) * dotSpacing) / 2
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
        return (
          <g key={edge.id}>
            {piece && (
              <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
            )}
            <line
              x1={pA.x}
              y1={pA.y}
              x2={pB.x}
              y2={pB.y}
              stroke={piece ? color : selectable ? '#ffffffaa' : 'transparent'}
              strokeWidth={piece ? 6 : 20}
              strokeLinecap="round"
              strokeDasharray={edge.ship ? '4,4' : undefined}
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
              <>
                <circle cx={p.x} cy={p.y} r={9.5} fill="#ffffff" />
                <circle cx={p.x} cy={p.y} r={7} fill={color} stroke="#1b1b1b" strokeWidth={1.5} />
              </>
            )}
            {vertex.building?.type === 'CITY' && (
              <>
                <rect x={p.x - 12.5} y={p.y - 12.5} width={25} height={25} fill="#ffffff" />
                <rect x={p.x - 11} y={p.y - 11} width={22} height={22} fill={color} stroke="#1b1b1b" strokeWidth={1.5} />
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fontSize={15}
                  fill="#ffd700"
                  stroke="#1b1b1b"
                  strokeWidth={1.2}
                  paintOrder="stroke"
                  style={{ pointerEvents: 'none' }}
                >
                  ★
                </text>
              </>
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
