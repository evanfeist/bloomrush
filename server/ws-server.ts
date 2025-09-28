import { WebSocketServer, WebSocket } from "ws";
import {
  GameState,
  Action,
  Config
} from "../src/game/types";
import {
  setupGame, beginSeason, takeTurnOnce, endSeason, finalScoreboard, applyAction
} from "../src/game/engine";

type Client = WebSocket & { roomId?: string; name?: string; pid?: number };

type Room = {
  id: string;
  clients: Client[];
  game?: GameState;
  started?: boolean;
};

const rooms = new Map<string, Room>();

function broadcast(room: Room, msg: any) {
  const text = JSON.stringify(msg);
  for (const c of room.clients) if (c.readyState === c.OPEN) c.send(text);
}

function send(client: Client, msg: any) {
  if (client.readyState === client.OPEN) client.send(JSON.stringify(msg));
}

function createRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const wss = new WebSocketServer({ port: 8080 });
console.log("WS server on ws://localhost:8080");

wss.on("connection", (ws: WebSocket) => {
  const client = ws as Client;

  ws.on("message", (data) => {
    let msg: any;
    try { msg = JSON.parse(String(data)); }
    catch { return; }

    if (msg.type === "create_room") {
      const id = createRoomId();
      const room: Room = { id, clients: [] };
      rooms.set(id, room);
      send(client, { type: "room_created", roomId: id });
      return;
    }

    if (msg.type === "join_room") {
      const { roomId, name } = msg;
      const room = rooms.get(roomId);
      if (!room) return send(client, { type: "error", error: "No such room" });
      client.roomId = roomId;
      client.name = name || "Player";
      room.clients.push(client);
      send(client, { type: "joined", roomId, seat: room.clients.length - 1 });
      broadcast(room, { type: "roster", players: room.clients.map((c) => c.name) });
      return;
    }

    if (msg.type === "start_game") {
      const { roomId, config, players } = msg as { roomId: string; config?: Config; players?: string[] };
      const room = rooms.get(roomId);
      if (!room) return;
      const names = players && players.length ? players : room.clients.map((c,i)=> c.name || `P${i+1}`);
      room.game = setupGame(names, config);
      room.started = true;
      beginSeason(room.game);
      broadcast(room, { type: "state", game: room.game });
      return;
    }

    if (msg.type === "action") {
      const { roomId, action } = msg as { roomId: string; action: Action };
      const room = rooms.get(roomId);
      if (!room || !room.game) return;
      try {
        applyAction(room.game, action);
      } catch {
        // ignore illegal from client (server authoritative)
      }

      // advance player or end season if everyone passed
      const allPassed = room.game.players.every((p) => p.passed);
      if (allPassed) {
        endSeason(room.game);
        // auto-start next season until 8
        if (room.game.season <= 8) beginSeason(room.game);
      } else {
        // simple rotation is managed inside client by re-sending "Pass" if stuck; we keep it simple
      }

      // final scoreboard if finished
      if (room.game.season > 8) {
        finalScoreboard(room.game);
      }
      broadcast(room, { type: "state", game: room.game });
      return;
    }
  });

  ws.on("close", () => {
    const roomId = (client as Client).roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.clients = room.clients.filter((c) => c !== client);
    if (room.clients.length === 0) rooms.delete(roomId);
    else broadcast(room, { type: "roster", players: room.clients.map((c) => c.name) });
  });
});