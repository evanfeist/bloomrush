import { Board, Species } from "./types";

export interface Score { points: number; tokens: number; }

/** Public scoring function: computes *cumulative* pattern points/tokens for a board state */
export function scoreBoard(board: Board): Score {
  let pts = 0, toks = 0;

  // 1) Line runs (3+ same-species in straight row/col)
  const lineRuns = countSameSpeciesLineRuns(board);
  if (lineRuns > 0) { pts += 3 * lineRuns; toks += 1; }

  // 2) Clusters (4+ orth-connected same-species groups)
  const clusters = countSameSpeciesClusters(board);
  if (clusters > 0) { pts += 4 * clusters; toks += 1; }

  // 3) Mirror (vertical exact, species-wise) for any continuous component >=2 tiles
  if (hasExactMirroredComponent(board)) { pts += 5; toks += 1; }

  // 4) Pollinator path: any-species orth-connected component size >=5 with >=2 bee cells
  if (hasPollinatorPath(board)) { pts += 6; toks += 1; }

  // 5) Pond adjacency: +1 per flower with an orth-adjacent pond
  pts += countOrthAdjacencyToPonds(board);

  return { points: pts, tokens: toks };
}

export function harvestBonusClusters(board: Board): number {
  return countSameSpeciesClusters(board) * 2;
}

export function countPondTouchers(board: Board): number {
  const g = board.cells;
  const inB = (r:number,c:number)=>r>=1&&r<=6&&c>=1&&c<=6;
  let total = 0;
  for (const row of g) for (const cell of row) {
    if (!cell.species) continue;
    let touches = false;
    for (let dr=-1; dr<=1 && !touches; dr++) for (let dc=-1; dc<=1 && !touches; dc++) {
      if (dr===0&&dc===0) continue;
      const nr=cell.row+dr, nc=cell.col+dc;
      if (inB(nr,nc) && g[nr-1][nc-1].pond) touches = true;
    }
    if (touches) total++;
  }
  return total;
}

/* -------------------------- internals -------------------------- */

function sameAt(board: Board, r:number, c:number): Species | undefined {
  return board.cells[r-1][c-1].species;
}

function countSameSpeciesLineRuns(board: Board): number {
  let runs = 0;

  // rows
  for (let r=1; r<=6; r++){
    let cur: Species | undefined = undefined;
    let len = 0;
    for (let c=1; c<=6; c++){
      const s = sameAt(board, r, c);
      if (s && s === cur) {
        len++;
      } else {
        if (cur && len >= 3) runs++;
        cur = s || undefined;
        len = s ? 1 : 0;
      }
    }
    if (cur && len >= 3) runs++;
  }

  // columns
  for (let c=1; c<=6; c++){
    let cur: Species | undefined = undefined;
    let len = 0;
    for (let r=1; r<=6; r++){
      const s = sameAt(board, r, c);
      if (s && s === cur) {
        len++;
      } else {
        if (cur && len >= 3) runs++;
        cur = s || undefined;
        len = s ? 1 : 0;
      }
    }
    if (cur && len >= 3) runs++;
  }

  return runs;
}

function countSameSpeciesClusters(board: Board): number {
  const g = board.cells;
  const seen = new Set<string>();
  const key = (r:number,c:number)=>`${r},${c}`;
  const inB = (r:number,c:number)=>r>=1&&r<=6&&c>=1&&c<=6;

  let clusters = 0;
  for (let r=1;r<=6;r++) for (let c=1;c<=6;c++){
    const s = sameAt(board, r, c); if (!s) continue;
    const start = key(r,c); if (seen.has(start)) continue;

    const comp: [number,number][] = [];
    const q: [number,number][] = [[r,c]];
    while (q.length){
      const [rr,cc] = q.pop()!;
      const k = key(rr,cc); if (seen.has(k)) continue;
      if (sameAt(board, rr, cc) !== s) continue;
      seen.add(k); comp.push([rr,cc]);
      if (inB(rr-1,cc)) q.push([rr-1,cc]);
      if (inB(rr+1,cc)) q.push([rr+1,cc]);
      if (inB(rr,cc-1)) q.push([rr,cc-1]);
      if (inB(rr,cc+1)) q.push([rr,cc+1]);
    }
    if (comp.length >= 4) clusters++;
  }
  return clusters;
}

function countOrthAdjacencyToPonds(board: Board): number {
  const g = board.cells;
  const inB = (r:number,c:number)=>r>=1&&r<=6&&c>=1&&c<=6;
  let pts = 0;
  for (let r=1;r<=6;r++) for (let c=1;c<=6;c++){
    if (!sameAt(board, r, c)) continue;
    const n: [number,number][]= [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
    for (const [nr,nc] of n){
      if (inB(nr,nc) && g[nr-1][nc-1].pond){ pts += 1; break; }
    }
  }
  return pts;
}

function hasExactMirroredComponent(board: Board): boolean {
  const g = board.cells;
  const seen = new Set<string>();
  const key = (r:number,c:number)=>`${r},${c}`;
  const get = (r:number,c:number)=>g[r-1][c-1].species;

  for (let r=1;r<=6;r++) for (let c=1;c<=6;c++){
    if (!get(r,c)) continue;
    const start = key(r,c); if (seen.has(start)) continue;

    // species-agnostic connectivity
    const comp: [number,number][] = [];
    const q: [number,number][] = [[r,c]];
    while (q.length){
      const [rr,cc] = q.pop()!;
      const k = key(rr,cc); if (seen.has(k)) continue;
      if (!get(rr,cc)) continue;
      seen.add(k); comp.push([rr,cc]);
      if (rr>1) q.push([rr-1,cc]);
      if (rr<6) q.push([rr+1,cc]);
      if (cc>1) q.push([rr,cc-1]);
      if (cc<6) q.push([rr,cc+1]);
    }
    if (comp.length < 2) continue;

    // check exact vertical mirror with species match
    const set = new Set(comp.map(([rr,cc])=>key(rr,cc)));
    let ok = true;
    for (const [rr,cc] of comp) {
      const rref = rr, cref = 7-cc;
      const s = get(rr,cc);
      const sref = (cref>=1&&cref<=6) ? get(rref,cref) : undefined;
      if (!s || sref !== s || !set.has(key(rref,cref))) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function hasPollinatorPath(board: Board): boolean {
  const g = board.cells;
  const seen = new Set<string>();
  const key = (r:number,c:number)=>`${r},${c}`;
  const inB = (r:number,c:number)=>r>=1&&r<=6&&c>=1&&c<=6;

  for (let r=1;r<=6;r++) for (let c=1;c<=6;c++){
    if (!g[r-1][c-1].species) continue;
    const start = key(r,c); if (seen.has(start)) continue;

    const comp: [number,number][] = [];
    const q: [number,number][] = [[r,c]];
    let bees = 0;
    while (q.length){
      const [rr,cc] = q.pop()!;
      const k = key(rr,cc); if (seen.has(k)) continue;
      if (!g[rr-1][cc-1].species) continue;
      seen.add(k); comp.push([rr,cc]);
      if (g[rr-1][cc-1].bee) bees++;
      if (inB(rr-1,cc)) q.push([rr-1,cc]);
      if (inB(rr+1,cc)) q.push([rr+1,cc]);
      if (inB(rr,cc-1)) q.push([rr,cc-1]);
      if (inB(rr,cc+1)) q.push([rr,cc+1]);
    }
    if (comp.length >= 5 && bees >= 2) return true;
  }
  return false;
}