import { Router } from "express";
import { getRoom, postRoom } from "../controllers/rooms.controllers.js";

const roomsRouter = Router();

roomsRouter.post("/", postRoom);
roomsRouter.get("/:roomId", getRoom);

export default roomsRouter;
