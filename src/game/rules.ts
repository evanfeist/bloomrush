import { Board, Cell, DiceRoll, Species } from "./types";
import { Rng } from "./rng";

/** Build a 6×6 board with all fields initialized, then mark ponds/bees. */
export function makeEmptyBoard(
  ponds: [number, number][],
  bees: [number, number][]
): Board {
  const cells: Cell[][] = [];
  for (let r = 1; r <= 6; r++) {
    const row: Cell[] = [];
    for (let c = 1; c <= 6; c++) {
      row.push({
        row: r,
        col: c,
        species: undefined,
        weed: false,
        flooded: false,
        pond: false,
        bee: false,
      });
    }
    cells.push(row);
  }
  ponds.forEach(([r, c]) => (cells[r - 1][c - 1].pond = true));
  bees.forEach(([r, c]) => (cells[r - 1][c - 1].bee = true));
  return { cells };
}

export function rollDice(rng: Rng = Math.random): DiceRoll {
  const colorFace = (): Species | "Wild" => {
    const faces: (Species | "Wild")[] = [
      "Rose",
      "Lily",
      "Daisy",
      "Fern",
      "Wild",
      "Wild",
    ];
    return faces[Math.floor(rng() * faces.length)];
  };

  type ZoneWithReRoll = DiceRoll["zone"] | "ReRoll";
  const zones: readonly ZoneWithReRoll[] = [
    "Diagonal",
    "Edge",
    "Center",
    "Free",
    "ReRoll",
  ] as const;

  let zone: ZoneWithReRoll = zones[Math.floor(rng() * zones.length)];
  if (zone === "ReRoll") {
    const rerollZones: readonly DiceRoll["zone"][] = [
      "Diagonal",
      "Edge",
      "Center",
      "Free",
    ] as const;
    zone = rerollZones[Math.floor(rng() * rerollZones.length)];
  }

  return {
    colors: [colorFace(), colorFace()],
    row: Math.ceil(rng() * 6),
    col: Math.ceil(rng() * 6),
    zone: zone as DiceRoll["zone"],
  };
}

/** Species from hand allowed by the two Color dice. */
export function allowedSpeciesFromHand(
  colors: [Species | "Wild", Species | "Wild"],
  hand: Species[]
): Species[] {
  if (colors[0] === "Wild" || colors[1] === "Wild") {
    return [...new Set(hand)];
  }
  const set = new Set<Species>();
  for (const s of hand) if (s === colors[0] || s === colors[1]) set.add(s);
  return [...set];
}

/** Legal empty cells under the current roll.
 * Row/Col: OR logic (match either). Zone must also allow.
 * Cell must be empty, not weeded, not flooded.
 */
export function legalCells(board: Board, roll: DiceRoll): [number, number][] {
  const out: [number, number][] = [];
  for (const row of board.cells) {
    for (const cell of row) {
      if (!cellIsEmptyAndUnblocked(cell)) continue;

      const rowOK = roll.row ? cell.row === roll.row : true;
      const colOK = roll.col ? cell.col === roll.col : true;
      if (!(rowOK || colOK)) continue;

      if (!zoneAllowsCell(roll.zone, cell.row, cell.col)) continue;

      out.push([cell.row, cell.col]);
    }
  }
  return out;
}

export function legalWeedCells(board: Board, roll: DiceRoll): [number, number][] {
  return legalCells(board, roll);
}

export function spatiallyAllowed(board: Board, roll: DiceRoll, r: number, c: number): boolean {
  if (roll.row && roll.col) {
    if (!(r === roll.row || c === roll.col)) return false;
  } else if (roll.row) {
    if (r !== roll.row) return false;
  } else if (roll.col) {
    if (c !== roll.col) return false;
  }
  if (roll.zone === "Diagonal") {
    const onDiag = r === c || r + c === 7;
    if (!onDiag) return false;
  } else if (roll.zone === "Edge") {
    const onEdge = r === 1 || r === 6 || c === 1 || c === 6;
    if (!onEdge) return false;
  } else if (roll.zone === "Center") {
    const inCenter = r >= 2 && r <= 5 && c >= 2 && c <= 5;
    if (!inCenter) return false;
  }
  return true;
}

/* -------------------- internal helpers -------------------- */

function cellIsEmptyAndUnblocked(cell: Cell): boolean {
  return !cell.species && !cell.weed && !cell.flooded;
}

function zoneAllowsCell(zone: DiceRoll["zone"], r: number, c: number): boolean {
  switch (zone) {
    case "Free": return true;
    case "Diagonal": return r === c || r + c === 7;
    case "Edge": return r === 1 || r === 6 || c === 1 || c === 6;
    case "Center": return r >= 2 && r <= 5 && c >= 2 && c <= 5;
    default: return true;
  }
}