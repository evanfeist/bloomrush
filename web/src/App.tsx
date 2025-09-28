import React, { useEffect, useMemo, useRef, useState } from "react";
import { Action, Config, GameState, Species } from "@game/types";
import { setupGame, beginSeason, takeTurnOnce, endSeason, finalScoreboard, applyAction } from "@game/engine";
import { chooseActionAI } from "@game/ai";

type Mode = "SoloLocal" | "VsBotLocal" | "Online";

export default function App() {
  const [mode, setMode] = useState<Mode | null>(null);

  return (
    <div className="wrap">
      <h1>🌸 Bloom Rush</h1>
      {!mode && (
        <div className="menu">
          <button onClick={()=>setMode("SoloLocal")}>Solo (local)</button>
          <button onClick={()=>setMode("VsBotLocal")}>P1 vs AI (local)</button>
          <button onClick={()=>setMode("Online")}>Online (room code)</button>
        </div>
      )}
      {mode === "SoloLocal" && <SoloLocal />}
      {mode === "VsBotLocal" && <VsBotLocal />}
      {mode === "Online" && <OnlineClient />}
    </div>
  );
}

/* -------------------------- Local Solo -------------------------- */
function SoloLocal() {
  const [g, setG] = useState<GameState>(() => {
    const cfg: Config = { soloMode: true };
    const st = setupGame(["You"], cfg);
    beginSeason(st);
    return st;
  });

  function doAIUntilPasses() {
    // In solo, there is only one player "You" and AI not used.
  }

  function onAction(a: Action) {
    try { applyAction(g, a); } catch { /* ignore */ }
    const everyonePassed = g.players.every((p)=>p.passed);
    if (everyonePassed) {
      endSeason(g);
      if (g.season <= 8) beginSeason(g);
      else finalScoreboard(g);
    }
    setG(structuredClone(g));
  }

  return <GameUI g={g} me={0} onAction={onAction} localAI={null} />;
}

/* -------------------------- Local Vs Bot -------------------------- */
function VsBotLocal() {
  const [g, setG] = useState<GameState>(() => {
    const cfg: Config = {};
    const st = setupGame(["You", "Bot"], cfg);
    beginSeason(st);
    return st;
  });

  function nextTurnAI() {
    const current = g.players[g.currentPlayerIdx!];
    if (current.name === "Bot" && !current.passed) {
      const a = chooseActionAI(g, g.currentPlayerIdx!);
      try { applyAction(g, a); } catch { current.passed = true; }
      const everyonePassed = g.players.every((p)=>p.passed);
      if (everyonePassed) {
        endSeason(g);
        if (g.season <= 8) beginSeason(g); else finalScoreboard(g);
      } else {
        // rotate to You implicitly via UI (we don't auto-rotate here)
      }
      setG(structuredClone(g));
    }
  }

  useEffect(()=>{ nextTurnAI(); }, [g.currentPlayerIdx, g.players.map(p=>p.passed).join(",")]);

  function onAction(a: Action) {
    try { applyAction(g, a); } catch { g.players[g.currentPlayerIdx!].passed = true; }
    const everyonePassed = g.players.every((p)=>p.passed);
    if (everyonePassed) {
      endSeason(g);
      if (g.season <= 8) beginSeason(g); else finalScoreboard(g);
    } else {
      // after player's move, it's Bot's turn (effect triggers via useEffect)
    }
    setG(structuredClone(g));
  }

  return <GameUI g={g} me={0} onAction={onAction} localAI="Bot" />;
}

/* -------------------------- Online -------------------------- */
function OnlineClient() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("You");
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const sock = new WebSocket("ws://localhost:8080");
    sock.onopen = () => setConnected(true);
    sock.onclose = () => setConnected(false);
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "room_created") setRoomId(msg.roomId);
      if (msg.type === "joined") setJoined(true);
      if (msg.type === "state") setState(msg.game);
      if (msg.type === "error") alert(msg.error);
    };
    setWs(sock);
    return () => sock.close();
  }, []);

  function createRoom() {
    ws?.send(JSON.stringify({ type: "create_room" }));
  }
  function joinRoom() {
    if (!roomId) return;
    ws?.send(JSON.stringify({ type: "join_room", roomId, name }));
  }
  function startGame() {
    ws?.send(JSON.stringify({ type: "start_game", roomId, config: {} }));
  }
  function sendAction(a: Action) {
    ws?.send(JSON.stringify({ type: "action", roomId, action: a }));
  }

  return (
    <div className="online">
      <div className="row">
        <button disabled={!connected} onClick={createRoom}>Create Room</button>
        <input value={roomId} onChange={e=>setRoomId(e.target.value.toUpperCase())} placeholder="ROOM" />
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" />
        <button disabled={!connected || !roomId} onClick={joinRoom}>Join</button>
        <button disabled={!joined} onClick={startGame}>Start</button>
      </div>
      {state ? <GameUI g={state} me={0} onAction={sendAction} /> : <p>Waiting for game…</p>}
    </div>
  );
}

/* -------------------------- Shared UI -------------------------- */
function GameUI({
  g, me, onAction, localAI
}: {
  g: GameState; me: number; onAction: (a: Action)=>void; localAI?: string | null;
}) {
  const meP = g.players[me];
  const roll = g.currentRoll!;
  const canPlay = g.currentPlayerIdx === me && !meP.passed && g.season <= 8;

  function plant(s: Species, r: number, c: number) {
    onAction({ type: "Plant", species: s, r, c });
  }
  function weed(pid: number, r: number, c: number) {
    onAction({ type: "PlantWeed", targetPlayerId: pid, r, c });
  }
  function pass() {
    onAction({ type: "Pass" });
  }

  return (
    <div className="game">
      <div className="hud">
        <div>Season {g.season} • Water {g.waterStep}</div>
        <div>Roll: {roll.colors.join(" & ")} | R{roll.row} C{roll.col} {roll.zone}</div>
      </div>
      <div className="players">
        {g.players.map((p, idx) => (
          <div key={idx} className={"player" + (idx===g.currentPlayerIdx ? " current" : "")}>
            <div className="name">{p.name} {idx===me ? "(You)" : ""}</div>
            <div>Score {p.score} • Tokens {p.tokens} • Hand {p.hand.join(", ")}</div>
            <BoardView board={p.board} />
          </div>
        ))}
      </div>
      {canPlay ? (
        <div className="controls">
          <div className="row">Your hand:
            {meP.hand.map((s, i) => <span key={i} className="chip">{s}</span>)}
          </div>
          <div className="row">
            <button onClick={pass}>Pass</button>
          </div>
          <p>Plant by clicking an empty legal cell (will prompt for species).</p>
        </div>
      ) : <div className="controls"><em>Waiting…</em></div>}
      <ClickLayer g={g} me={me} onPlant={plant} onWeed={weed} canPlay={canPlay}/>
    </div>
  );
}

function BoardView({ board }: { board: GameState["players"][0]["board"] }) {
  return (
    <div className="board">
      {board.cells.map((row, ri) => (
        <div key={ri} className="row">
          {row.map((cell, ci) => (
            <div key={ci} className={
              "cell" +
              (cell.pond ? " pond" : "") +
              (cell.bee ? " bee" : "") +
              (cell.weed ? " weed" : "") +
              (cell.flooded ? " flooded" : "")
            }>
              {cell.species ? icon(cell.species) : ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ClickLayer({
  g, me, onPlant, onWeed, canPlay
}: {
  g: GameState; me: number; onPlant: (s: Species, r: number, c: number)=>void; onWeed:(pid:number,r:number,c:number)=>void; canPlay: boolean;
}) {
  if (!canPlay) return null;
  const p = g.players[me];

  function handleCellClick(r: number, c: number) {
    const cell = p.board.cells[r-1][c-1];
    if (cell.species || cell.weed || cell.flooded) return;
    // choose a species from hand (super-minimal UI)
    const choice = window.prompt(`Plant which species?\nHand: ${p.hand.join(", ")}`);
    if (!choice) return;
    const s = choice as Species;
    onPlant(s, r, c);
  }

  return (
    <div className="overlay">
      {p.board.cells.map((row) =>
        row.map((cell) => (
          <button
            key={`${cell.row},${cell.col}`}
            className="hit"
            onClick={() => handleCellClick(cell.row, cell.col)}
            title={`${cell.row},${cell.col}`}
          />
        ))
      )}
    </div>
  );
}

function icon(s: Species) {
  return s === "Rose" ? "🌹" : s === "Lily" ? "✿" : s === "Daisy" ? "🌼" : "🍃";
}