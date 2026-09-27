import type { Server } from "socket.io";
import { addRoomPlayer, findRoom, removeRoomPlayer } from "../rooms/rooms.store.js";
import {
  createRound,
  endRound,
  getActiveRound,
  updateCurrentStroke,
  updateRoundStrokes,
} from "../rooms/rounds.store.js";
import type { DrawingPoint, DrawingStroke } from "../rooms/rounds.store.js";
import { isAcceptedAnswer } from "../rooms/words.js";

function isDrawingPoint(value: unknown): value is DrawingPoint {
  if (typeof value !== "object" || value === null) return false;

  const point = value as Record<string, unknown>;
  return (
    typeof point.x === "number" && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1000 &&
    typeof point.y === "number" && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1000
  );
}

function isDrawingStroke(value: unknown): value is DrawingStroke {
  if (typeof value !== "object" || value === null) return false;

  const stroke = value as Record<string, unknown>;
  return (
    Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.length <= 5000 &&
    stroke.points.every(isDrawingPoint) &&
    typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color) &&
    typeof stroke.size === "number" && Number.isFinite(stroke.size) && stroke.size >= 1 && stroke.size <= 50 &&
    typeof stroke.eraser === "boolean"
  );
}

function isDrawingStrokes(value: unknown): value is DrawingStroke[] {
  return Array.isArray(value) && value.length <= 2000 && value.every(isDrawingStroke);
}

export function setupSocketHandlers(io: Server) {
  let nextGuessMessageId = 0;
  const countdowns = new Map<string, { timeout: ReturnType<typeof setTimeout>; endsAt: number }>(); // roomId -> timeout

  const cancelCountdown = (roomId: string) => {
    const countdown = countdowns.get(roomId);
    if (!countdown) return;

    clearTimeout(countdown.timeout);
    countdowns.delete(roomId);
    io.to(roomId).emit("countdown-cancelled");
  };

  const startCountdown = (roomId: string) => {
    const room = findRoom(roomId);
    if (!room || room.players.length < 2 || countdowns.has(roomId) || getActiveRound(roomId)) return;

    const endsAt = Date.now() + 5000;
    const timeout = setTimeout(() => {
      countdowns.delete(roomId);
      const currentRoom = findRoom(roomId);

      if (!currentRoom || currentRoom.players.length < 2) {
        io.to(roomId).emit("countdown-cancelled");
        return;
      }

      const round = createRound(roomId, currentRoom.players);
      io.to(roomId).emit("round-started", { drawerId: round.drawerId });
      io.to(roomId).emit("drawing-state", {
        strokes: round.strokes,
        currentStroke: round.currentStroke,
      });
      io.to(round.drawerId).emit("your-word", { word: round.word });
    }, 5000);

    countdowns.set(roomId, { timeout, endsAt });
    io.to(roomId).emit("countdown-started", { endsAt });
  };

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    const getDrawableRoomId = (roomId: unknown): string | null => {
      if (typeof roomId !== "string") return null;

      const room = findRoom(roomId.trim());
      const round = room && getActiveRound(room.id);
      if (!room || !socket.rooms.has(room.id) || round?.drawerId !== socket.id) return null;

      return room.id;
    };

    socket.on("join-room", (payload: { roomId?: unknown; playerName?: unknown }) => {
      if (typeof payload?.roomId !== "string" || typeof payload.playerName !== "string") {
        socket.emit("room-error", { message: "A room code and player name are required" });
        return;
      }

      const roomId = payload.roomId.trim().toUpperCase();
      const playerName = payload.playerName.trim();

      if (!playerName || playerName.length > 24 || !findRoom(roomId)) {
        socket.emit("room-error", { message: "Room not found or player name is invalid" });
        return;
      }

      socket.join(roomId);
      const room = addRoomPlayer(roomId, { id: socket.id, name: playerName });

      if (room) {
        io.to(roomId).emit("user-joined", {
          player: { id: socket.id, name: playerName },
        });

        const activeRound = getActiveRound(roomId);
        if (activeRound) {
          socket.emit("round-started", { drawerId: activeRound.drawerId });
          socket.emit("drawing-state", {
            strokes: activeRound.strokes,
            currentStroke: activeRound.currentStroke,
          });
          if (activeRound.drawerId === socket.id) {
            socket.emit("your-word", { word: activeRound.word });
          }
        } else {
          const countdown = countdowns.get(roomId);
          if (countdown) {
            socket.emit("countdown-started", { endsAt: countdown.endsAt });
          } else {
            startCountdown(roomId);
          }
        }
      }
    });

    socket.on("finish-round", (payload: { roomId?: unknown }) => {
      if (typeof payload?.roomId !== "string") return;

      const room = findRoom(payload.roomId.trim());
      const round = room && getActiveRound(room.id);
      if (!room || !round || round.drawerId !== socket.id) return;

      endRound(room.id);
      io.to(room.id).emit("round-ended");
      startCountdown(room.id);
    });

    socket.on("submit-guess", (payload: { roomId?: unknown; guess?: unknown }) => {
      if (typeof payload?.roomId !== "string" || typeof payload.guess !== "string") return;

      const room = findRoom(payload.roomId.trim());
      const round = room && getActiveRound(room.id);
      const player = room?.players.find((roomPlayer) => roomPlayer.id === socket.id);

      if (!room || !round || !player || round.drawerId === socket.id) {
        socket.emit("guess-error", { message: "Only players who are guessing can submit a guess" });
        return;
      }

      const guess = payload.guess.trim();
      if (!guess) return;

      if (isAcceptedAnswer(round.word, guess)) {
        io.to(room.id).emit("guess-correct", {
          playerName: player.name,
          word: round.word,
        });
        endRound(room.id);
        io.to(room.id).emit("round-ended");
        startCountdown(room.id);
        return;
      }

      io.to(room.id).emit("guess-message", {
        id: ++nextGuessMessageId,
        playerName: player.name,
        guess,
      });
    });

    socket.on("update-strokes", (payload: { roomId?: unknown; strokes?: unknown }) => {
      const roomId = getDrawableRoomId(payload?.roomId);
      if (!roomId || !isDrawingStrokes(payload.strokes)) return;

      const round = updateRoundStrokes(roomId, socket.id, payload.strokes);
      if (round) socket.to(roomId).emit("strokes-updated", { strokes: round.strokes });
    });

    socket.on("update-current-stroke", (payload: { roomId?: unknown; currentStroke?: unknown }) => {
      const roomId = getDrawableRoomId(payload?.roomId);
      const currentStroke = payload?.currentStroke;
      if (!roomId || (currentStroke !== null && !isDrawingStroke(currentStroke))) return;

      const round = updateCurrentStroke(roomId, socket.id, currentStroke);
      if (round) socket.to(roomId).emit("current-stroke-updated", { currentStroke: round.currentStroke });
    });

    socket.on("disconnecting", () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue;

        const room = removeRoomPlayer(roomId, socket.id);
        if (room) {
          io.to(roomId).emit("user-left", { playerId: socket.id });

          const round = getActiveRound(roomId);
          if (round && (round.drawerId === socket.id || room.players.length < 2)) {
            endRound(roomId);
            io.to(roomId).emit("round-ended");
            startCountdown(roomId);
          }

          if (room.players.length < 2) {
            cancelCountdown(roomId);
          }
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
    });
  });
}
