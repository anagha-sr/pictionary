import type { RoomPlayer } from "./rooms.store.js";

export interface ActiveRound {
  drawerId: string;
  word: string;
}

const words = ["apple", "bicycle", "castle", "guitar", "rainbow", "turtle"];
const activeRounds = new Map<string, ActiveRound>();

export function createRound(roomId: string, players: RoomPlayer[]): ActiveRound {
  const drawer = players[Math.floor(Math.random() * players.length)];
  const word = words[Math.floor(Math.random() * words.length)];
  const round = { drawerId: drawer?.id, word };

  activeRounds.set(roomId, round as ActiveRound);
  return round as ActiveRound;
}

export function getActiveRound(roomId: string): ActiveRound | undefined {
  return activeRounds.get(roomId);
}

export function endRound(roomId: string): void {
  activeRounds.delete(roomId);
}
