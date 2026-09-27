import type { Server } from "socket.io";
import { addRoomPlayer, findRoom, removeRoomPlayer } from "../rooms/rooms.store.js";
import { createRound, endRound, getActiveRound } from "../rooms/rounds.store.js";

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
      io.to(round.drawerId).emit("your-word", { word: round.word });
    }, 5000);

    countdowns.set(roomId, { timeout, endsAt });
    io.to(roomId).emit("countdown-started", { endsAt });
  };

  io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

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

      if (guess.toLowerCase() === round.word.toLowerCase()) {
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
