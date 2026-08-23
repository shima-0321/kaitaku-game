import type { Board, TerrainType, VertexId, EdgeId, HexId } from '@catan-online/shared'
import { useBoardLayout } from '../../hooks/useBoardLayout'
import mountainsImg from '../../assets/terrain/mountains.jpg'
import fieldsImg from '../../assets/terrain/fields.jpg'
import hillsImg from '../../assets/terrain/hills.jpg'
import forestImg from '../../assets/terrain/forest.jpg'
import desertImg from '../../assets/terrain/desert.jpg'
import pastureImg from '../../assets/terrain/pasture.jpg'

const TERRAIN_IMAGES: Record<TerrainType, string> = {
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
}

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
        {Object.values(board.tiles).map((tile) => {
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
        const selectable = selectableHexIds?.has(tile.id)
        const isRolledNumber = highlightedNumber != null && tile.numberToken === highlightedNumber
        return (
          <g key={tile.id}>
            <polygon
              points={points}
              fill={`url(#terrain-${tile.id})`}
              stroke={isRolledNumber ? '#ffd600' : '#2b2b2b'}
              strokeWidth={isRolledNumber ? 4 : 1.5}
              onClick={selectable ? () => onHexClick?.(tile.id) : undefined}
              style={{ cursor: selectable ? 'pointer' : 'default' }}
              opacity={selectable ? 0.85 : 1}
            />
            {/* lighten the photo so player pieces/roads stay readable on top of it */}
            <polygon points={points} fill="#ffffff" opacity={0.38} style={{ pointerEvents: 'none' }} />
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
            >
              {TERRAIN_LABELS[tile.terrain]}
            </text>
            {tile.numberToken && (
              <g>
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
            {isRobber && <circle cx={center.x} cy={center.y} r={12} fill="#333" stroke="#fff" strokeWidth={2} />}
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
        const color = edge.road ? playerColorById[edge.road.playerId] ?? '#000' : undefined
        return (
          <g key={edge.id}>
            {edge.road && (
              <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
            )}
            <line
              x1={pA.x}
              y1={pA.y}
              x2={pB.x}
              y2={pB.y}
              stroke={edge.road ? color : selectable ? '#ffffffaa' : 'transparent'}
              strokeWidth={edge.road ? 6 : 20}
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
