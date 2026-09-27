import { Router } from "express";
import { getRoom } from "../controllers/rooms.controllers.js";

const roomsRouter = Router();

roomsRouter.get("/:roomId", getRoom);

export default roomsRouter;