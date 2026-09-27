import { randomBytes } from "node:crypto";

export interface RoomPlayer {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  players: RoomPlayer[];
}

const rooms = new Map<string, Room>();

export function createRoom(): Room {
  let id: string;
  do {
    id = randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(id));

  const room: Room = { id, players: [] };
  rooms.set(id, room);

  return room;
}

export function findRoom(roomId: string): Room | undefined {
  return rooms.get(roomId.toUpperCase());
}

export function addRoomPlayer(roomId: string, player: RoomPlayer): Room | undefined {
  const room = findRoom(roomId);

  if (!room) return undefined;

  room.players = room.players.filter((existingPlayer) => existingPlayer.id !== player.id);
  room.players.push(player);
  return room;
}

export function removeRoomPlayer(roomId: string, playerId: string): Room | undefined {
  const room = findRoom(roomId);

  if (!room) return undefined;

  room.players = room.players.filter((player) => player.id !== playerId);
  return room;
}
