import type { Server } from "socket.io";

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket) => {

    console.log("Player connected:", socket.id);

    socket.on("join-room", ({ roomId, playerName }) => {
      socket.join(roomId);

      io.to(roomId).emit("player-joined", {
        playerName
      });
    });

    socket.on("disconnect", () => {
      console.log("Player disconnected:", socket.id);
    });

  });
}