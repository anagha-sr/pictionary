const API_URL = import.meta.env.VITE_API_URL;

export interface RoomPlayer {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  players: RoomPlayer[];
}

export async function createRoom(): Promise<Room> {
  const response = await fetch(`${API_URL}/rooms`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to create room");
  }

  return response.json();
}

export async function getRoom(roomId: string): Promise<Room> {
  const response = await fetch(`${API_URL}/rooms/${roomId}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(response.status === 404 ? "Room not found" : "Failed to fetch room");
  }

  return response.json();
}
