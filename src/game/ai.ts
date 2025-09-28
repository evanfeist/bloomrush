import { Action, GameState, PlayerState, Species } from "./types";
import { allowedSpeciesFromHand, legalCells, spatiallyAllowed } from "./rules";
import { scoreBoard } from "./scoring";

function valueAfter(me: PlayerState): number {
  return scoreBoard(me.board).points;
}

function pick<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

function bestPlant(me: PlayerState, roll: NonNullable<GameState["currentRoll"]>): Action | null {
  const cells = legalCells(me.board, roll);
  if (cells.length === 0) return null;

  const allowed = allowedSpeciesFromHand(roll.colors, me.hand);
  if (allowed.length === 0) return null;

  let best: { a: Action; score: number } | null = null;

  for (const [r, c] of cells) {
    for (const s of allowed) {
      const cell = me.board.cells[r - 1][c - 1];
      const prev = cell.species;

      const before = valueAfter(me);
      cell.species = s;
      const after = valueAfter(me);
      cell.species = prev;

      const delta = after - before;
      const cand: Action = { type: "Plant", species: s, r, c };
      if (!best || delta > best.score) best = { a: cand, score: delta };
    }
  }
  return best?.a ?? null;
}

function bestWeed(me: PlayerState, g: GameState): Action | null {
  if (me.tokens < 1 || (g.weedsRemaining ?? 0) <= 0) return null;
  const opp = [...g.players].filter(p => p.id !== me.id).sort((a, b) => b.score - a.score)[0];
  if (!opp) return null;

  const weedables = legalCells(opp.board, g.currentRoll!);
  if (weedables.length === 0) return null;

  const [r, c] = pick(weedables)!;
  return { type: "PlantWeed", targetPlayerId: opp.id, r, c };
}

function bestSteal(me: PlayerState, g: GameState): Action | null {
  if (me.tokens < 2) return null;
  const roll = g.currentRoll!;
  const myEmpties = legalCells(me.board, roll);
  if (myEmpties.length === 0) return null;

  const opps = g.players.filter(p => p.id !== me.id);
  let best: { a: Action; gain: number } | null = null;

  for (const op of opps) {
    for (const row of op.board.cells) {
      for (const cell of row) {
        if (!cell.species || cell.weed || cell.flooded) continue;
        const s = cell.species as Species;

        // must match at least one color die (Wild ok)
        const [c1, c2] = roll.colors;
        if (!([c1, c2].includes("Wild") || s === c1 || s === c2)) continue;

        for (const [toR, toC] of myEmpties) {
          const srcPrev = cell.species;
          const dst = me.board.cells[toR - 1][toC - 1];
          const dstPrev = dst.species;

          const before = valueAfter(me);
          cell.species = undefined;
          dst.species = s;
          const after = valueAfter(me);

          dst.species = dstPrev;
          cell.species = srcPrev;

          const gain = after - before;
          if (!best || gain > best.gain) {
            best = {
              a: { type: "Steal", targetPlayerId: op.id, fromR: cell.row, fromC: cell.col, toR, toC, stealSpecies: s },
              gain
            };
          }
        }
      }
    }
  }
  return best?.a ?? null;
}

function bestSwap(me: PlayerState, g: GameState): Action | null {
  if (me.tokens < 3) return null;
  const roll = g.currentRoll!;
  const opps = g.players.filter(p => p.id !== me.id);

  let best: { a: Action; gain: number } | null = null;

  for (const myRow of me.board.cells) for (const myCell of myRow) {
    if (!myCell.species || myCell.weed || myCell.flooded) continue;

    for (const opp of opps) {
      for (const theirRow of opp.board.cells) for (const theirCell of theirRow) {
        if (!theirCell.species || theirCell.weed || theirCell.flooded) continue;

        const myDestOK = spatiallyAllowed(opp.board, roll, theirCell.row, theirCell.col);
        const theirDestOK = spatiallyAllowed(me.board, roll, myCell.row, myCell.col);
        if (!myDestOK || !theirDestOK) continue;

        const before = valueAfter(me);
        const myPrev = myCell.species;
        const theirPrev = theirCell.species;
        myCell.species = theirPrev;
        theirCell.species = myPrev;
        const after = valueAfter(me);
        myCell.species = myPrev;
        theirCell.species = theirPrev;

        const gain = after - before;
        if (!best || gain > best.gain) {
          best = {
            a: { type: "Swap", targetPlayerId: opp.id, myR: myCell.row, myC: myCell.col, theirR: theirCell.row, theirC: theirCell.col },
            gain
          };
        }
      }
    }
  }
  return best?.a ?? null;
}

export function chooseActionAI(g: GameState, pid: number): Action {
  const me = g.players[pid];
  const roll = g.currentRoll!;
  const plant = bestPlant(me, roll);
  if (plant) return plant;
  const steal = bestSteal(me, g);
  if (steal) return steal;
  const swap = bestSwap(me, g);
  if (swap) return swap;
  const weed = bestWeed(me, g);
  if (weed) return weed;
  return { type: "Pass" };
}