// ----- Core domain -----
export type Species = "Rose" | "Lily" | "Daisy" | "Fern";

export interface Cell {
  row: number;           // 1..6
  col: number;           // 1..6
  species?: Species;     // empty if undefined
  weed: boolean;
  flooded: boolean;
  pond: boolean;
  bee: boolean;
}

export interface Board {
  cells: Cell[][];
}

export type Zone = "Diagonal" | "Edge" | "Center" | "Free";

export interface DiceRoll {
  colors: [Species | "Wild", Species | "Wild"];
  row: number;   // 1..6
  col: number;   // 1..6
  zone: Zone;    // never "ReRoll" (filtered out in rollDice)
}

// ----- Players & Game -----
export interface PlayerState {
  id: number;
  name: string;
  hand: Species[];
  tokens: number;
  score: number;
  lastPatternPoints: number;
  lastPatternTokens: number;
  board: Board;
  passed: boolean;
  floodActive: boolean;
}

export interface Config {
  soloMode?: boolean;
  seed?: number; // for deterministic runs
}

export interface GameState {
  season: number;
  waterStep: number;
  bag: Species[];
  players: PlayerState[];
  currentRoll?: DiceRoll;
  currentPlayerIdx?: number;
  startPlayerIdx?: number;
  weedsRemaining?: number;
  config?: Config;
}

// ----- Actions -----
export type Action =
  | { type: "Plant"; species: Species; r: number; c: number }
  | { type: "PlantWeed"; targetPlayerId: number; r: number; c: number }
  | {
      type: "Shovel";
      target: "Weed" | "Flood" | "Flower";
      r: number;
      c: number;
      targetPlayerId?: number;
    }
  | {
      type: "Steal";
      targetPlayerId: number;
      fromR: number;
      fromC: number;
      toR: number;
      toC: number;
      stealSpecies: Species;
    }
  | {
      type: "Swap";
      targetPlayerId: number;
      myR: number;
      myC: number;
      theirR: number;
      theirC: number;
    }
  | { type: "Pass" };