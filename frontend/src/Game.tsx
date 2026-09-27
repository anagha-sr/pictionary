import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { io, type Socket } from "socket.io-client";
import type { RoomPlayer } from "./api/rooms";
import DrawingCanvas, { type DrawingState } from "./DrawingCanvas";
import { useRoom } from "./hooks/useRoom";

interface GameProps {
  roomId: string;
  playerName: string;
}

interface GuessMessage {
  id: number;
  playerName: string;
  text: string;
  correct?: boolean;
}

const SOCKET_URL = import.meta.env.VITE_API_URL;

export default function Game({ roomId, playerName }: GameProps) {
  const { room, loading, error } = useRoom(roomId);
  const [copied, setCopied] = useState(false);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [secretWord, setSecretWord] = useState<string | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [guessText, setGuessText] = useState("");
  const [guessMessages, setGuessMessages] = useState<GuessMessage[]>([]);
  const [celebration, setCelebration] = useState<{ playerName: string; word: string } | null>(null);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    strokes: [],
    currentStroke: null,
  });
  const socketRef = useRef<Socket | null>(null);
  const [gameSocket, setGameSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!celebration) return;

    const timeout = window.setTimeout(() => setCelebration(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

  useEffect(() => {
    if (countdownEndsAt === null) return;

    const updateCountdown = () => {
      setCountdownValue(Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000)));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(interval);
  }, [countdownEndsAt]);

  useEffect(() => {
    if (!room) return;

    setPlayers(room.players);

    const socket = io(SOCKET_URL, { autoConnect: false });
    socketRef.current = socket;
    setGameSocket(socket);
    const joinRoom = () => socket.emit("join-room", { roomId, playerName });
    const handleUserJoined = (update: { player: RoomPlayer }) => {
      setPlayers((currentPlayers) =>
        currentPlayers.some((player) => player.id === update.player.id)
          ? currentPlayers
          : [...currentPlayers, update.player],
      );
    };
    const handleUserLeft = (update: { playerId: string }) => {
      setPlayers((currentPlayers) =>
        currentPlayers.filter((player) => player.id !== update.playerId),
      );
    };
    const handleRoomError = (message: { message: string }) => setSocketError(message.message);
    const handleRoundStarted = (round: { drawerId: string }) => {
      setDrawerId(round.drawerId);
      setSecretWord(null);
      setDrawingState({ strokes: [], currentStroke: null });
      setGuessMessages([]);
      setGuessText("");
      setCountdownEndsAt(null);
      setCountdownValue(null);
      setSocketError(null);
    };
    const handleCountdownStarted = (countdown: { endsAt: number }) => {
      setCountdownEndsAt(countdown.endsAt);
      setCountdownValue(Math.max(0, Math.ceil((countdown.endsAt - Date.now()) / 1000)));
    };
    const handleGuessMessage = (message: { id: number; playerName: string; guess: string }) => {
      setGuessMessages((currentMessages) => [
        ...currentMessages,
        { id: message.id, playerName: message.playerName, text: message.guess },
      ]);
    };
    const handleGuessCorrect = (message: { playerName: string; word: string }) => {
      setCelebration(message);
      setGuessMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now(),
          playerName: message.playerName,
          text: `guessed correctly! The word was “${message.word}”.`,
          correct: true,
        },
      ]);
    };
    const handleDrawingState = (state: DrawingState) => setDrawingState(state);
    const handleStrokesUpdated = (update: { strokes: DrawingState["strokes"] }) => {
      setDrawingState((current) => ({ ...current, strokes: update.strokes }));
    };
    const handleCurrentStrokeUpdated = (update: { currentStroke: DrawingState["currentStroke"] }) => {
      setDrawingState((current) => ({ ...current, currentStroke: update.currentStroke }));
    };

    socket.on("connect", () => {
      setMySocketId(socket.id || null);
      joinRoom();
    });
    socket.on("disconnect", () => {
      setMySocketId(null);
    });
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("room-error", handleRoomError);
    socket.on("round-started", handleRoundStarted);
    socket.on("countdown-started", handleCountdownStarted);
    socket.on("countdown-cancelled", () => {
      setCountdownEndsAt(null);
      setCountdownValue(null);
    });
    socket.on("your-word", (message: { word: string }) => setSecretWord(message.word));
    socket.on("guess-message", handleGuessMessage);
    socket.on("guess-correct", handleGuessCorrect);
    socket.on("guess-error", (message: { message: string }) => setSocketError(message.message));
    socket.on("drawing-state", handleDrawingState);
    socket.on("strokes-updated", handleStrokesUpdated);
    socket.on("current-stroke-updated", handleCurrentStrokeUpdated);
    socket.on("round-ended", () => {
      setDrawerId(null);
      setSecretWord(null);
      setDrawingState({ strokes: [], currentStroke: null });
      setCountdownEndsAt(null);
      setCountdownValue(null);
    });
    socket.on("connect_error", () => setSocketError("Could not connect to the game server"));
    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setGameSocket(null);
      setMySocketId(null);
    };
  }, [room, roomId, playerName]);

  function finishRound() {
    socketRef.current?.emit("finish-round", { roomId });
  }

  function submitGuess(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const guess = guessText.trim();
    if (!guess) return;

    socketRef.current?.emit("submit-guess", { roomId, guess });
    setGuessText("");
  }

  async function copyRoomCode() {
    if (!room) return;

    try {
      await navigator.clipboard.writeText(room.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return <p className="status-card">Loading game…</p>;
  }

  if (error) {
    return <p className="status-card" role="alert">{error.message}</p>;
  }

  if (!room) {
    return <p className="status-card">Room not found.</p>;
  }

  return (
    <div className="game-shell">
      <div className="game-layout">
        <section className="play-area">
          {gameSocket && (
            <DrawingCanvas
              roomId={roomId}
              socket={gameSocket}
              canDraw={drawerId !== null && drawerId === mySocketId}
              drawingState={drawingState}
            />
          )}
        </section>

        <aside className="game-sidebar">
          <div className="room-code-row">
            <div className="room-code-info">
              <span className="eyebrow">ROOM CODE</span>
              <div className="room-code-value">
                <h1>{room.id}</h1>
                <button className="button button-secondary copy-button" onClick={copyRoomCode}>
                  {copied ? "Copied!" : "Copy code"}
                </button>
              </div>
            </div>
          </div>

          <section className="round-controls">
            {drawerId ? (
              <>
                <p>
                  {drawerId === mySocketId
                    ? "You are drawing."
                    : `${players.find((player) => player.id === drawerId)?.name ?? "A player"} is drawing.`}
                </p>
                {secretWord && <p>Your word: <strong>{secretWord}</strong></p>}
                {drawerId === mySocketId && <button onClick={finishRound}>Stop round</button>}
              </>
            ) : countdownValue !== null ? (
              <p>Round starts in {countdownValue}…</p>
            ) : (
              <p>{players.length < 2 ? "Waiting for another player to join." : "Waiting for round to start…"}</p>
            )}
          </section>

          <section className="players-card">
            <h2>Players</h2>
            <ul className="player-list">
              {players.map((player) => (
                <li key={player.id}>
                  <span className="player-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
                  <span>{player.name}</span>
                  {player.id === mySocketId && <span className="you-badge">(You)</span>}
                  {player.id === drawerId && <span className="drawer-badge">DRAWING</span>}
                </li>
              ))}
            </ul>
          </section>

          {(drawerId || guessMessages.length > 0) && (
            <section className="guess-chat">
              <h2>Guesses</h2>
              <ul aria-live="polite">
                {guessMessages.map((message) => (
                  <li key={message.id}>
                    <strong>{message.playerName}</strong> {message.text}
                  </li>
                ))}
              </ul>
              {drawerId && drawerId !== mySocketId && (
                <form onSubmit={submitGuess}>
                  <label className="visually-hidden" htmlFor="guess-input">Your guess</label>
                  <input
                    className="guess-input"
                    id="guess-input"
                    value={guessText}
                    onChange={(event) => setGuessText(event.target.value)}
                    autoComplete="off"
                    maxLength={80}
                  />
                  <button type="submit" disabled={!guessText.trim()}>
                    Send guess
                  </button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>

      {socketError && <p className="socket-error" role="alert">{socketError}</p>}
      {celebration && (
        <div className="guess-celebration" role="status" aria-live="polite">
          <strong>Correct guess!</strong>
          <span>{celebration.playerName} guessed “{celebration.word}”</span>
          <span className="celebration-confetti" aria-hidden="true">✦　✳　✦　✳　✦</span>
        </div>
      )}
    </div>
  );
}
