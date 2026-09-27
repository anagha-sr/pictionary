import type { RoomPlayer } from "./rooms.store.js";
import { WORDS } from "./words.js";

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  points: DrawingPoint[];
  color: string;
  size: number;
  eraser: boolean;
}

export interface ActiveRound {
  drawerId: string;
  word: string;
  strokes: DrawingStroke[];
  currentStroke: DrawingStroke | null;
}

const activeRounds = new Map<string, ActiveRound>();

export function createRound(roomId: string, players: RoomPlayer[]): ActiveRound {
  const drawer = players[Math.floor(Math.random() * players.length)];
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const round = { drawerId: drawer?.id, word, strokes: [], currentStroke: null };

  activeRounds.set(roomId, round as ActiveRound);
  return round as ActiveRound;
}

export function getActiveRound(roomId: string): ActiveRound | undefined {
  return activeRounds.get(roomId);
}

export function updateRoundStrokes(
  roomId: string,
  drawerId: string,
  strokes: DrawingStroke[],
): ActiveRound | undefined {
  const round = activeRounds.get(roomId);
  if (!round || round.drawerId !== drawerId) return undefined;

  round.strokes = strokes;
  return round;
}

export function updateCurrentStroke(
  roomId: string,
  drawerId: string,
  currentStroke: DrawingStroke | null,
): ActiveRound | undefined {
  const round = activeRounds.get(roomId);
  if (!round || round.drawerId !== drawerId) return undefined;

  round.currentStroke = currentStroke;
  return round;
}

export function endRound(roomId: string): void {
  activeRounds.delete(roomId);
}
