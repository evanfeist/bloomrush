import {
  setupGame,
  beginSeason,
  takeTurnOnce,
  endSeason,
  finalScoreboard,
} from "./game/engine";
import type { Config, GameState } from "./game/types";

const RUNS = parseInt(process.env.RUNS || "1", 10);
const SHOW_TURNS = process.env.SHOW_TURNS === "1";
const SOLO = process.env.SOLO === "1";
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : undefined;

function everyonePassed(g: GameState): boolean {
  return g.players.every((p) => p.passed);
}

function runOneGame(): GameState {
  const cfg: Config = { soloMode: !!SOLO, seed: SEED };
  const g = setupGame(["You", "Bot1", "Bot2"], cfg);

  for (let step = 1; step <= 8; step++) {
    beginSeason(g);

    let guard = 200;
    while (!everyonePassed(g) && guard-- > 0) {
      takeTurnOnce(g);
      if (SHOW_TURNS) {
        // (Optional) print turn summaries here if you want
      }
    }

    endSeason(g);
  }

  finalScoreboard(g);
  return g;
}

function runBatch(runs: number) {
  const tallies = {
    games: 0,
    scoreSum: [0, 0, 0],
    scoreSqSum: [0, 0, 0],
    wins: [0, 0, 0],
    tokensLeft: [0, 0, 0],
  };

  for (let i = 0; i < runs; i++) {
    const g = runOneGame();
    tallies.games++;

    const ordered = [...g.players].sort((a, b) => b.score - a.score);
    g.players.forEach((p, idx) => {
      tallies.scoreSum[idx] += p.score;
      tallies.scoreSqSum[idx] += p.score * p.score;
      tallies.tokensLeft[idx] += p.tokens;
    });
    const winnerId = ordered[0].id;
    tallies.wins[winnerId]++;
  }

  console.log("\n=== Batch Results ===");
  console.log(`Games: ${tallies.games}`);

  const names = ["You", "Bot1", "Bot2"];
  for (let i = 0; i < 3; i++) {
    const n = tallies.games;
    const mean = tallies.scoreSum[i] / n;
    const variance = Math.max(0, tallies.scoreSqSum[i] / n - mean * mean);
    const sigma = Math.sqrt(variance);
    const winPct = ((tallies.wins[i] / n) * 100).toFixed(1);
    const avgTokens = (tallies.tokensLeft[i] / n).toFixed(2);
    console.log(
      `- ${names[i]} → avg score ${mean.toFixed(2)} (σ ${sigma.toFixed(
        2
      )}), win% ${winPct}%, avg leftover tokens ${avgTokens}`
    );
  }
  const totalWins = tallies.wins.reduce((a, b) => a + b, 0);
  const share = tallies.wins.map((w) => `${Math.round((w / totalWins) * 100)}%`);
  console.log(
    `Win share: ${names.map((n, i) => `${n} ${share[i]}`).join(" • ")}`
  );
}

runBatch(RUNS);