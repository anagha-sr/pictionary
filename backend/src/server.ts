import { createServer } from "http";
import app from "./app.js";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./sockets/index.js";
const PORT = process.env.PORT || 4000 

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL
  }
});

setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log("Server running on port 3000");
});
