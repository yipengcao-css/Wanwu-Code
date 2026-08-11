import { useCallback, useEffect, useRef } from "react";

export function SplitHandle(props: {
  orientation: "vertical" | "horizontal";
  onDrag: (deltaPx: number) => void;
}) {
  const dragging = useRef(false);
  const last = useRef(0);

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = props.orientation === "vertical" ? e.clientX : e.clientY;
      const delta = pos - last.current;
      last.current = pos;
      if (delta !== 0) props.onDrag(delta);
    },
    [props],
  );

  const onUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onMove, onUp]);

  return (
    <div
      className={`split-handle ${props.orientation}`}
      role="separator"
      aria-orientation={props.orientation}
      onMouseDown={(e) => {
        dragging.current = true;
        last.current = props.orientation === "vertical" ? e.clientX : e.clientY;
        e.preventDefault();
      }}
    />
  );
}
