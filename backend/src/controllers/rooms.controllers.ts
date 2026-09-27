import type { Request, Response } from "express";
import { createRoom, findRoom } from "../rooms/rooms.store.js";

export function postRoom(_req: Request, res: Response) {
  const room = createRoom();

  res.status(201).json(room);
}

export function getRoom(req: Request, res: Response) {
  const { roomId } = req.params as { roomId: string };
  const room = findRoom(roomId);

  if (!room) {
    res.status(404).json({ message: "Room not found" });
    return;
  }
  res.json(room);
}
