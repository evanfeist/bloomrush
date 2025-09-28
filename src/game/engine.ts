import { GameState, Species, PlayerState, Action, Config } from "./types";
import {
  makeEmptyBoard,
  legalCells,
  legalWeedCells,
  allowedSpeciesFromHand,
  rollDice,
  spatiallyAllowed,
} from "./rules";
import { scoreBoard, harvestBonusClusters, countPondTouchers } from "./scoring";
import { chooseActionAI } from "./ai";
import { clearFlood, listPonds, countFloodPotential, applyFlood } from "./flood";
import { makeRng, Rng } from "./rng";

const START_HAND = 5;
const START_TOKENS = 3;
const SPECIES: Species[] = ["Rose", "Lily", "Daisy", "Fern"];

function buildAndShuffleBag(rng: Rng): Species[] {
  const bag: Species[] = [];
  for (let i = 0; i < 30; i++) bag.push(...SPECIES);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function drawTiles(bag: Species[], count: number): Species[] {
  const out: Species[] = [];
  while (out.length < count && bag.length) out.push(bag.pop()!);
  return out;
}

export function setupGame(playerNames: string[], cfg: Config = {}): GameState {
  const rng = makeRng(cfg.seed);
  const bag = buildAndShuffleBag(rng);

  const ponds: [number, number][] = [
    [2, 3],
    [2, 5],
    [5, 2],
    [5, 5],
  ];
  const bees: [number, number][] = [
    [1, 2],
    [2, 5],
    [6, 3],
    [6, 6],
  ];

  const players: PlayerState[] = playerNames.map((name, id) => ({
    id,
    name,
    hand: drawTiles(bag, START_HAND),
    tokens: START_TOKENS,
    score: 0,
    lastPatternPoints: 0,
    lastPatternTokens: 0,
    board: makeEmptyBoard(ponds, bees),
    passed: false,
    floodActive: false,
  }));

  const g: GameState = {
    season: 1,
    waterStep: 1,
    bag,
    players,
    currentRoll: undefined,
    currentPlayerIdx: 0,
    startPlayerIdx: 0,
    weedsRemaining: 10,
    config: cfg,
  };
  return g;
}

/* ------------------------------- Season Flow -------------------------------- */

export function beginSeason(g: GameState) {
  for (const p of g.players) {
    p.passed = false;
    p.floodActive = false;
    clearFlood(p.board);
  }
  const rng = makeRng(g.config?.seed); // stays pseudo-random between games; fine for now
  g.currentRoll = rollDice(rng);
  g.currentPlayerIdx = g.startPlayerIdx ?? 0;
}

function allPassed(g: GameState): boolean {
  return g.players.every((p) => p.passed);
}

function nextPlayer(g: GameState) {
  const n = g.players.length;
  for (let hops = 0; hops < n; hops++) {
    g.currentPlayerIdx = ((g.currentPlayerIdx ?? 0) + 1) % n;
    if (!g.players[g.currentPlayerIdx].passed) return;
  }
}

export function takeTurnOnce(g: GameState) {
  const pid = g.currentPlayerIdx!;
  const p = g.players[pid];
  if (p.passed) {
    nextPlayer(g);
    return;
  }

  const action = chooseActionAI(g, pid);

  try {
    applyAction(g, action);
  } catch {
    p.passed = true;
  }

  if (!allPassed(g)) nextPlayer(g);
}

export function endSeason(g: GameState) {
  for (const p of g.players) {
    while (p.hand.length < START_HAND && g.bag.length) {
      const [t] = drawTiles(g.bag, 1);
      if (t) p.hand.push(t);
    }
  }

  // Solo drought at step 5
  if (g.waterStep === 5) maybeDrought(g);

  resolveWaterEventForCurrentStep(g);

  g.waterStep = Math.min(8, g.waterStep + 1);
  g.startPlayerIdx = ((g.startPlayerIdx ?? 0) + 1) % g.players.length;
  g.season += 1;
}

/* -------------------------- Scoring delta helper --------------------------- */

function addPatternDeltaAndTokens(p: PlayerState) {
  const { points, tokens } = scoreBoard(p.board);
  const dp = Math.max(0, points - p.lastPatternPoints);
  const dt = Math.max(0, tokens - p.lastPatternTokens);
  if (dp > 0) p.score += dp;
  if (dt > 0) p.tokens += dt;
  p.lastPatternPoints = points;
  p.lastPatternTokens = tokens;
}

/* -------------------------------- Actions ---------------------------------- */

export function applyAction(g: GameState, a: Action) {
  const p = g.players[g.currentPlayerIdx!];
  const roll = g.currentRoll!;

  if (a.type === "Pass") {
    p.passed = true;
    return;
  }

  if (a.type === "Plant") {
    if (!p.hand.includes(a.species)) throw new Error("not in hand");
    const allowedSpecies = new Set(allowedSpeciesFromHand(roll.colors, p.hand));
    if (!allowedSpecies.has(a.species)) throw new Error("species not allowed by roll");

    const legals = new Set(legalCells(p.board, roll).map(([r, c]) => `${r},${c}`));
    if (!legals.has(`${a.r},${a.c}`)) throw new Error("dest not legal");

    const cell = p.board.cells[a.r - 1][a.c - 1];
    if (cell.species || cell.weed || cell.flooded) throw new Error("occupied/blocked");

    cell.species = a.species;
    p.hand.splice(p.hand.indexOf(a.species), 1);

    addPatternDeltaAndTokens(p);
    return;
  }

  if (a.type === "PlantWeed") {
    if ((g.weedsRemaining ?? 0) <= 0 || p.tokens < 1) {
      p.passed = true;
      return;
    }
    const victim = g.players[a.targetPlayerId];
    const legals = new Set(legalWeedCells(victim.board, roll).map(([r, c]) => `${r},${c}`));
    if (!legals.has(`${a.r},${a.c}`)) throw new Error("weed dest illegal");

    const cell = victim.board.cells[a.r - 1][a.c - 1];
    if (cell.species || cell.weed || cell.flooded) throw new Error("occupied/blocked");

    cell.weed = true;
    p.tokens -= 1;
    g.weedsRemaining = (g.weedsRemaining ?? 0) - 1;
    return;
  }

  if (a.type === "Shovel") {
    if (p.tokens < 1) { p.passed = true; return; }

    if (a.target === "Weed") {
      const tp = g.players[a.targetPlayerId ?? p.id];
      const cell = tp.board.cells[a.r - 1][a.c - 1];
      if (!cell.weed) throw new Error("no weed");
      cell.weed = false;
      p.tokens -= 1;
      g.weedsRemaining = (g.weedsRemaining ?? 0) + 1;
      return;
    }

    if (a.target === "Flood") {
      const cell = p.board.cells[a.r - 1][a.c - 1];
      if (!cell.flooded) throw new Error("no flood here");
      cell.flooded = false;
      p.tokens -= 1;
      return;
    }

    // Flower: remove own flower to bag
    const cell = p.board.cells[a.r - 1][a.c - 1];
    if (!cell.species) throw new Error("no flower");
    g.bag.push(cell.species);
    cell.species = undefined;
    p.tokens -= 1;
    addPatternDeltaAndTokens(p);
    return;
  }

  if (a.type === "Steal") {
    if (p.tokens < 2) { p.passed = true; return; }
    const victim = g.players[a.targetPlayerId];
    const fromCell = victim.board.cells[a.fromR - 1][a.fromC - 1];
    if (!fromCell.species) throw new Error("no source flower");

    const [c1, c2] = roll.colors;
    const s = fromCell.species;
    const colorOK = c1 === "Wild" || c2 === "Wild" || s === c1 || s === c2;
    if (!colorOK) throw new Error("color mismatch");

    const destCell = p.board.cells[a.toR - 1][a.toC - 1];
    if (destCell.species || destCell.weed || destCell.flooded) throw new Error("dest blocked");
    if (!spatiallyAllowed(p.board, roll, a.toR, a.toC)) throw new Error("dest illegal");

    fromCell.species = undefined;
    destCell.species = s;

    p.tokens -= 2;
    addPatternDeltaAndTokens(p);
    addPatternDeltaAndTokens(victim);
    return;
  }

  if (a.type === "Swap") {
    if (p.tokens < 3) { p.passed = true; return; }
    const opp = g.players[a.targetPlayerId];
    const myCell = p.board.cells[a.myR - 1][a.myC - 1];
    const theirCell = opp.board.cells[a.theirR - 1][a.theirC - 1];

    if (!myCell.species || !theirCell.species) throw new Error("need flowers");

    const myFlowerToTheirSpotOK = spatiallyAllowed(opp.board, roll, a.theirR, a.theirC);
    const theirFlowerToMySpotOK = spatiallyAllowed(p.board, roll, a.myR, a.myC);
    if (!myFlowerToTheirSpotOK || !theirFlowerToMySpotOK) throw new Error("swap illegal");

    const mine = myCell.species;
    const theirs = theirCell.species;
    myCell.species = theirs;
    theirCell.species = mine;

    p.tokens -= 3;

    addPatternDeltaAndTokens(p);
    addPatternDeltaAndTokens(opp);
    return;
  }
}

/* ----------------------------- Water Events -------------------------------- */

export function resolveWaterEventForCurrentStep(g: GameState) {
  const step = g.waterStep;
  if (step <= 3) return;
  if (step === 4) return bonusBloom(g);
  if (step === 5) return; // solo drought handled elsewhere
  if (step === 6) return rainBoostPodium(g);
  if (step === 7) return floodNow(g);
  if (step === 8) return; // harvest awarded in finalScoreboard
}

function bonusBloom(g: GameState) {
  for (const p of g.players) {
    const empties: [number, number][] = [];
    for (const row of p.board.cells)
      for (const cell of row)
        if (!cell.species && !cell.weed && !cell.flooded) empties.push([cell.row, cell.col]);

    if (!empties.length) continue;

    let best: { r: number; c: number; s: Species } | null = null;
    let bestDelta = -Infinity;

    for (const s of new Set(p.hand)) {
      for (const [r, c] of empties) {
        const cell = p.board.cells[r - 1][c - 1];
        const prev = cell.species;
        const before = scoreBoard(p.board).points;
        cell.species = s;
        const after = scoreBoard(p.board).points;
        cell.species = prev;
        const d = after - before;
        if (d > bestDelta) { bestDelta = d; best = { r, c, s }; }
      }
    }

    if (best) {
      const cell = p.board.cells[best.r - 1][best.c - 1];
      cell.species = best.s;
      const idx = p.hand.indexOf(best.s);
      if (idx >= 0) p.hand.splice(idx, 1);
      addPatternDeltaAndTokens(p);
    }
  }
}

function rainBoostPodium(g: GameState) {
  type Entry = { p: PlayerState; count: number };
  const entries: Entry[] = g.players
    .map((p) => ({ p, count: countPondTouchers(p.board) }))
    .sort((a, b) => b.count - a.count);

  const awards = [5, 3, 1];
  let i = 0; let place = 0;
  while (i < entries.length && place < 3) {
    const start = i;
    const score = entries[i].count;
    while (i < entries.length && entries[i].count === score) i++;
    const pts = awards[place] ?? 0;
    if (pts > 0) {
      for (let k = start; k < i; k++) entries[k].p.score += pts;
    }
    place++;
  }
}

function floodNow(g: GameState) {
  const ponds = listPonds(g.players[0].board);
  const n = g.players.length;

  for (const target of g.players) {
    const leftIdx = (target.id + 1) % n;
    let bestPond: [number, number] | null = null;
    let bestCount = -1;

    for (const [pr, pc] of ponds) {
      const count = countFloodPotential(target.board, [pr, pc]);
      if (count > bestCount) { bestCount = count; bestPond = [pr, pc]; }
    }

    if (bestPond) {
      const applied = applyFlood(target.board, bestPond);
      target.floodActive = applied > 0;
    }
  }
}

export function finalScoreboard(g: GameState) {
  if (g.waterStep >= 8) {
    for (const p of g.players) p.score += harvestBonusClusters(p.board);
  }
  for (const p of g.players) p.score += p.tokens * 2;
}

/* --------------------------- Solo Step-5 Drought ---------------------------- */

function maybeDrought(g: GameState) {
  if (!g.config?.soloMode) return;
  for (const p of g.players) if (p.tokens > 0) p.tokens -= 1;
}