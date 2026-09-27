import { useRoom } from "./hooks/useRoom";

interface GameProps {
  roomId: string;
}

export default function Game({ roomId }: GameProps) {
  const { room, loading, error } = useRoom(roomId);

  if (loading) {
    return <p>Loading...</p>;
  }

  if (error) {
    return <p>{error.message}</p>;
  }

  if (!room) {
    return <p>Room not found.</p>;
  }

  return (
    <div>
      <h1>Room {room.id}</h1>

      <h2>Players</h2>

      <ul>
        {room.players.map((player) => (
          <li key={player}>{player}</li>
        ))}
      </ul>
    </div>
  );
}