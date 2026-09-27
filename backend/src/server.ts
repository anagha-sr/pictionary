import { createServer } from "http";
import app from "./app.js";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./sockets/index.js";

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
