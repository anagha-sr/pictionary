import { createServer } from "http";
import app from "./app.ts";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./sockets/index.ts";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL
  }
});

setupSocketHandlers(io);

httpServer.listen(3000, () => {
  console.log("Server running on port 3000");
});
