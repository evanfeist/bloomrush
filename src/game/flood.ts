import { Board } from "./types";

/** Return pond coordinates from board (read-only). */
export function listPonds(board: Board): [number, number][] {
  const out: [number, number][] = [];
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.pond) out.push([cell.row, cell.col]);
    }
  }
  return out;
}

/** How many orth-adjacent empty cells would flood from a pond. */
export function countFloodPotential(board: Board, pond: [number, number]): number {
  const [r, c] = pond;
  const N: [number, number][] = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
  let cnt = 0;
  for (const [nr, nc] of N) {
    if (nr < 1 || nr > 6 || nc < 1 || nc > 6) continue;
    const cell = board.cells[nr-1][nc-1];
    if (!cell.species && !cell.weed && !cell.flooded && !cell.pond) cnt++;
  }
  return cnt;
}

/** Apply flood for this season: mark orth-adjacent empties as flooded. Returns how many cells flooded. */
export function applyFlood(board: Board, pond: [number, number]): number {
  const [r, c] = pond;
  const N: [number, number][] = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
  let applied = 0;
  for (const [nr, nc] of N) {
    if (nr < 1 || nr > 6 || nc < 1 || nc > 6) continue;
    const cell = board.cells[nr-1][nc-1];
    if (!cell.species && !cell.weed && !cell.flooded && !cell.pond) {
      cell.flooded = true;
      applied++;
    }
  }
  return applied;
}

/** Clear all floods (called at start of each Season). */
export function clearFlood(board: Board): void {
  for (const row of board.cells)
    for (const cell of row)
      if (cell.flooded) cell.flooded = false;
}