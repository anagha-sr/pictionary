import type { Request, Response } from "express";

export function getRoom(req: Request, res: Response) {
  const { roomId } = req.params;

  res.json({
    id: roomId,
    players: ["Alice", "Bob"],
  });
}