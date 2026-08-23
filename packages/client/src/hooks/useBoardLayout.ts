import { useMemo } from 'react'
import type { Board, HexId, VertexId, EdgeId, HexCoord } from '@catan-online/shared'
import { parseVertexOrEdgeId } from '@catan-online/shared'

export const HEX_SIZE = 60

export interface PixelPoint {
  x: number
  y: number
}

export interface BoardLayout {
  hexCenters: Record<HexId, PixelPoint>
  hexCorners: Record<HexId, PixelPoint[]>
  vertexPoints: Record<VertexId, PixelPoint>
  edgeMidpoints: Record<EdgeId, PixelPoint>
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

function hexCenter(coord: HexCoord): PixelPoint {
  return {
    x: HEX_SIZE * 1.5 * coord.q,
    y: HEX_SIZE * Math.sqrt(3) * (coord.r + coord.q / 2),
  }
}

function hexCornerOffset(i: number): PixelPoint {
  const angleRad = (Math.PI / 180) * (60 * i)
  return { x: HEX_SIZE * Math.cos(angleRad), y: HEX_SIZE * Math.sin(angleRad) }
}

function averagePoint(points: PixelPoint[]): PixelPoint {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return { x, y }
}

export function useBoardLayout(board: Board | null): BoardLayout | null {
  return useMemo(() => {
    if (!board) return null

    const hexCenters: Record<HexId, PixelPoint> = {}
    const hexCorners: Record<HexId, PixelPoint[]> = {}
    for (const tile of Object.values(board.tiles)) {
      const center = hexCenter(tile.coord)
      hexCenters[tile.id] = center
      hexCorners[tile.id] = Array.from({ length: 6 }, (_, i) => {
        const offset = hexCornerOffset(i)
        return { x: center.x + offset.x, y: center.y + offset.y }
      })
    }

    // Every vertex/edge id encodes the (2-3) hex coords touching it, including virtual
    // off-board hexes for coastal ones -- averaging their centers gives the correct pixel
    // position without needing separate coastline geometry.
    const vertexPoints: Record<VertexId, PixelPoint> = {}
    for (const vertexId of Object.keys(board.vertices)) {
      const hexes = parseVertexOrEdgeId(vertexId)
      vertexPoints[vertexId] = averagePoint(hexes.map(hexCenter))
    }

    const edgeMidpoints: Record<EdgeId, PixelPoint> = {}
    for (const edge of Object.values(board.edges)) {
      const [vA, vB] = edge.vertexIds
      edgeMidpoints[edge.id] = averagePoint([vertexPoints[vA], vertexPoints[vB]])
    }

    const allPoints = Object.values(vertexPoints)
    const bounds = {
      minX: Math.min(...allPoints.map((p) => p.x)) - HEX_SIZE,
      minY: Math.min(...allPoints.map((p) => p.y)) - HEX_SIZE,
      maxX: Math.max(...allPoints.map((p) => p.x)) + HEX_SIZE,
      maxY: Math.max(...allPoints.map((p) => p.y)) + HEX_SIZE,
    }

    return { hexCenters, hexCorners, vertexPoints, edgeMidpoints, bounds }
  }, [board])
}
