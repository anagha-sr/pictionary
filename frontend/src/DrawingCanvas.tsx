import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

const CANVAS_SIZE = 1000;

export type DrawingPoint = {
  x: number;
  y: number;
};

export type DrawingStroke = {
  points: DrawingPoint[];
  color: string;
  size: number;
  eraser: boolean;
};

export interface DrawingState {
  strokes: DrawingStroke[];
  currentStroke: DrawingStroke | null;
}

interface DrawingCanvasProps {
  roomId: string;
  socket: Socket;
  canDraw: boolean;
  drawingState: DrawingState;
}

export default function DrawingCanvas({ roomId, socket, canDraw, drawingState }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([]);
  const [remoteCurrentStroke, setRemoteCurrentStroke] = useState<DrawingStroke | null>(null);

  const [color, setColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(8);
  const [eraser, setEraser] = useState(false);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<DrawingStroke | null>(null);

  /*
   * --------------------------------------------------
   * Draw a stroke
   * --------------------------------------------------
   *
   * All coordinates here are in the fixed
   * 1000 × 1000 logical coordinate system.
   */
  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
      if (stroke.points.length === 0) {
        return;
      }

      ctx.save();

      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.eraser) {
        ctx.globalCompositeOperation = "destination-out";
      } else {
        ctx.globalCompositeOperation = "source-over";

        ctx.strokeStyle = stroke.color;
      }

      /*
       * Single point = dot
       */
      if (stroke.points.length === 1) {
        const point = stroke.points[0];

        ctx.beginPath();

        ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);

        ctx.fillStyle = stroke.eraser ? "#000000" : stroke.color;

        ctx.fill();

        ctx.restore();

        return;
      }

      /*
       * Multiple points = stroke
       */
      ctx.beginPath();

      const firstPoint = stroke.points[0];

      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];

        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();

      ctx.restore();
    },
    [],
  );

  /*
   * --------------------------------------------------
   * Setup canvas
   * --------------------------------------------------
   *
   * The logical canvas is ALWAYS 1000 × 1000.
   *
   * devicePixelRatio only affects the internal bitmap
   * so the canvas remains sharp on Retina displays.
   */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    /*
     * Internal bitmap resolution.
     */
    canvas.width = CANVAS_SIZE * dpr;

    canvas.height = CANVAS_SIZE * dpr;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    /*
     * From this point onwards, drawing coordinates
     * are still 0–1000.
     */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    /*
     * Redraw all saved strokes.
     */
    for (const stroke of strokes) {
      drawStroke(ctx, stroke);
    }
    if (remoteCurrentStroke) drawStroke(ctx, remoteCurrentStroke);
  }, [strokes, remoteCurrentStroke, drawStroke]);

  useEffect(() => {
    if (canDraw) return;

    setStrokes(drawingState.strokes);
    setRemoteCurrentStroke(drawingState.currentStroke);
    setRedoStack([]);
  }, [drawingState, canDraw]);

  useEffect(() => {
    if (canDraw) socket.emit("update-strokes", { roomId, strokes });
  }, [strokes, canDraw, roomId, socket]);

  /*
   * --------------------------------------------------
   * Canvas initialization / redraw
   * --------------------------------------------------
   */
  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  /*
   * --------------------------------------------------
   * Retina / DPR changes
   * --------------------------------------------------
   *
   * For example, if the browser moves from a normal
   * display to a Retina display.
   */
  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );

    const handleChange = () => {
      setupCanvas();
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [setupCanvas]);

  useEffect(() => {
    if (canDraw) {
      socket.emit("update-current-stroke", { roomId, currentStroke: null });
    }
  }, [canDraw, roomId, socket]);

  /*
   * --------------------------------------------------
   * Convert screen coordinates → 1000 × 1000
   * --------------------------------------------------
   */
  const getCanvasPoint = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ): DrawingPoint | null => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    /*
     * Position relative to the displayed canvas.
     */
    const displayX = event.clientX - rect.left;

    const displayY = event.clientY - rect.top;

    /*
     * Convert displayed coordinates into
     * our fixed logical coordinate system.
     */
    const x = (displayX / rect.width) * CANVAS_SIZE;

    const y = (displayY / rect.height) * CANVAS_SIZE;

    /*
     * Keep points inside the canvas.
     */
    return {
      x: Math.max(0, Math.min(CANVAS_SIZE, x)),

      y: Math.max(0, Math.min(CANVAS_SIZE, y)),
    };
  };

  /*
   * --------------------------------------------------
   * Pointer down
   * --------------------------------------------------
   */
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    isDrawingRef.current = true;

    const stroke: DrawingStroke = {
      points: [point],
      color,
      size: brushSize,
      eraser,
    };

    currentStrokeRef.current = stroke;
    socket.emit("update-current-stroke", { roomId, currentStroke: stroke });

    /*
     * Draw the initial point immediately.
     */
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    drawStroke(ctx, stroke);
  };

  /*
   * --------------------------------------------------
   * Pointer move
   * --------------------------------------------------
   */
  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !isDrawingRef.current) {
      return;
    }

    const stroke = currentStrokeRef.current;

    if (!stroke) {
      return;
    }

    const point = getCanvasPoint(event);

    if (!point) {
      return;
    }

    stroke.points.push(point);
    socket.emit("update-current-stroke", { roomId, currentStroke: stroke });

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    /*
     * Draw the current stroke.
     */
    drawStroke(ctx, stroke);
  };

  /*
   * --------------------------------------------------
   * Finish drawing
   * --------------------------------------------------
   */
  const finishDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) {
      return;
    }

    isDrawingRef.current = false;

    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const stroke = currentStrokeRef.current;

    if (!stroke) {
      return;
    }

    socket.emit("update-current-stroke", { roomId, currentStroke: null });

    /*
     * Save completed stroke to history.
     */
    setStrokes((previous) => [...previous, stroke]);

    /*
     * A new drawing invalidates redo history.
     */
    setRedoStack([]);

    currentStrokeRef.current = null;
  };

  /*
   * --------------------------------------------------
   * Undo
   * --------------------------------------------------
   */
  const undo = () => {
    if (!canDraw || strokes.length === 0) return;

    setStrokes((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const lastStroke = previous[previous.length - 1];

      setRedoStack((previousRedo) => [...previousRedo, lastStroke]);

      return previous.slice(0, -1);
    });
  };

  /*
   * --------------------------------------------------
   * Redo
   * --------------------------------------------------
   */
  const redo = () => {
    if (!canDraw || redoStack.length === 0) return;

    setRedoStack((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const lastStroke = previous[previous.length - 1];

      setStrokes((previousStrokes) => [...previousStrokes, lastStroke]);

      return previous.slice(0, -1);
    });
  };

  /*
   * --------------------------------------------------
   * Clear
   * --------------------------------------------------
   */
  const clearCanvas = () => {
    if (!canDraw) return;

    setStrokes([]);
    setRedoStack([]);
  };

  /*
   * --------------------------------------------------
   * Download PNG
   * --------------------------------------------------
   *
   * Exports the actual 1000 × 1000 drawing,
   * independent of how large it appears on screen.
   */
  const downloadCanvas = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const exportCanvas = document.createElement("canvas");

    exportCanvas.width = CANVAS_SIZE;
    exportCanvas.height = CANVAS_SIZE;

    const ctx = exportCanvas.getContext("2d");

    if (!ctx) {
      return;
    }

    /*
     * White background.
     */
    ctx.fillStyle = "#ffffff";

    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    /*
     * Draw all strokes.
     */
    for (const stroke of strokes) {
      drawStroke(ctx, stroke);
    }

    const link = document.createElement("a");

    link.download = "drawing.png";

    link.href = exportCanvas.toDataURL("image/png");

    link.click();
  };

  /*
   * --------------------------------------------------
   * Keyboard shortcuts
   * --------------------------------------------------
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;

      if (!modifier) {
        return;
      }

      /*
       * Ctrl/Cmd + Z
       */
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }

      /*
       * Ctrl/Cmd + Shift + Z
       */
      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      }

      /*
       * Ctrl/Cmd + Y
       */
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Color */}
        <label className="flex items-center gap-2">
          <span className="text-sm">Color</span>

          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            disabled={eraser || !canDraw}
            className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        {/* Brush size */}
        <label className="flex items-center gap-2">
          <span className="text-sm">Size</span>

          <input
            type="range"
            min="1"
            max="50"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            disabled={!canDraw}
            className="w-28 cursor-pointer"
          />

          <span className="w-8 text-sm">{brushSize}</span>
        </label>

        {/* Eraser */}
        <button
          type="button"
          onClick={() => setEraser((previous) => !previous)}
          disabled={!canDraw}
          className={`rounded px-3 py-2 text-sm font-medium transition ${
            eraser
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-800 hover:bg-gray-200"
          }`}
        >
          {eraser ? "Brush" : "Eraser"}
        </button>

        {/* Undo */}
        <button
          type="button"
          onClick={undo}
          disabled={!canDraw || strokes.length === 0}
          className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Undo
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={redo}
          disabled={!canDraw || redoStack.length === 0}
          className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Redo
        </button>

        {/* Clear */}
        <button
          type="button"
          onClick={clearCanvas}
          disabled={!canDraw}
          className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
        >
          Clear
        </button>

        {/* Download */}
        <button
          type="button"
          onClick={downloadCanvas}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Download
        </button>
      </div>

      {/* Canvas */}
      <div className="drawing-canvas-wrapper">
        <canvas
          ref={canvasRef}
          className={`drawing-canvas ${canDraw ? "" : "drawing-canvas-readonly"}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
        />
      </div>
    </div>
  );
}
