import { useEffect, useState } from "react";
import { getRoom, type Room } from "../api/rooms";

export function useRoom(roomId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadRoom() {
      try {
        setLoading(true);
        setError(null);

        const data = await getRoom(roomId);
        setRoom(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error
            : new Error("Failed to fetch room")
        );
      } finally {
        setLoading(false);
      }
    }

    loadRoom();
  }, [roomId]);

  return {
    room,
    loading,
    error,
  };
}