const API_URL = import.meta.env.VITE_API_URL;

export interface Room {
  id: string;
  players: string[];
}

export async function getRoom(roomId: string): Promise<Room> {
  const response = await fetch(`${API_URL}/rooms/${roomId}`, {
    method: "GET",
  });

  if (!response.ok) {
    console.error(response);
    throw new Error("Failed to fetch room");
  }

  return response.json();
}