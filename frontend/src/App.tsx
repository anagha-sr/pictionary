import { useState, type SubmitEvent } from "react";
import Game from "./Game";
import { createRoom, getRoom } from "./api/rooms";
import "./App.css";

function App() {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleCreateRoom() {
    setIsLoading(true);
    setError(null);

    try {
      const room = await createRoom();
      setActiveRoomId(room.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create room");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoinRoom(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const room = await getRoom(roomCode.trim().toUpperCase());
      setActiveRoomId(room.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to join room");
    } finally {
      setIsLoading(false);
    }
  }

  if (activeRoomId) {
    return (
      <main className="game-page">
        <button className="back-button button button-quiet" onClick={() => setActiveRoomId(null)}>
          ← Back to lobby
        </button>
        <Game roomId={activeRoomId} playerName={playerName.trim()} />
      </main>
    );
  }

  return (
    <main className="landing-page">
      <nav className="brand-bar"><span className="brand-mark">✦</span><span>Pictionary</span></nav>
      <section className="lobby-card">
      <div className="lobby-intro">
        <h1>Play Pictionary</h1>
        <p>Create a room or enter a room code to join a game.</p>
      </div>
      <div className="name-field">
        <label htmlFor="player-name">YOUR NAME</label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Enter your name"
          autoComplete="nickname"
          maxLength={24}
        />
      </div>

      <div className="room-actions">
        <button className="button button-primary" onClick={handleCreateRoom} disabled={isLoading || playerName.trim().length === 0}>
          {isLoading ? "Please wait…" : "Create a room  →"}
        </button>

        <span className="or">or</span>

        <form className="join-form" onSubmit={handleJoinRoom}>
          <label htmlFor="room-code">HAVE A ROOM CODE?</label>
          <input
            id="room-code"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value)}
            placeholder="e.g. ABC123"
            autoComplete="off"
          />
          <button
            className="button button-secondary"
            type="submit"
            disabled={isLoading || roomCode.trim().length === 0 || playerName.trim().length === 0}
          >
            Join room  →
          </button>
        </form>
      </div>

      {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}

export default App;
