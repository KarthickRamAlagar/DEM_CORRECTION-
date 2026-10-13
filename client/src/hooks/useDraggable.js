import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Free-drag positioning for a floating panel inside `containerRef` (which
 * must be `position: relative`). Returns pixel coordinates plus pointer
 * handlers to spread onto whatever element should act as the drag handle —
 * the rest of the panel stays perfectly normal/clickable.
 *
 * Position is clamped to the container's bounds on every drag frame and
 * re-clamped on container resize, so a panel can never end up stranded
 * off-screen (e.g. after rotating a phone or shrinking the window).
 *
 * Placement is lazy: some of these panels are wrapped in a `hidden sm:block`
 * (etc) parent for responsive layout, so they can measure as 0×0 at mount
 * time. We watch the panel itself and place it the first moment it actually
 * has real dimensions, rather than assuming mount === visible.
 */
export function useDraggable({ containerRef, initialCorner = "top-right", margin = 16 }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);
  const dragState = useRef(null);
  const placedRef = useRef(false);

  const clamp = useCallback(
    (x, y) => {
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel) return { x, y };
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      return {
        x: Math.min(Math.max(x, margin), Math.max(margin, cw - pw - margin)),
        y: Math.min(Math.max(y, margin), Math.max(margin, ch - ph - margin)),
      };
    },
    [containerRef, margin]
  );

  // Place the panel in its starting corner the first time it has real
  // (nonzero) dimensions — handles both the normal case and the "mounted
  // while hidden by a responsive wrapper" case.
  useEffect(() => {
    const panel = panelRef.current;
    const container = containerRef.current;
    if (!panel || !container || typeof ResizeObserver === "undefined") return;

    function tryPlace() {
      if (placedRef.current) return;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      if (pw === 0 || ph === 0) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      let x;
      let y;
      switch (initialCorner) {
        case "top-left":
          x = margin;
          y = margin;
          break;
        case "bottom-left":
          x = margin;
          y = ch - ph - margin;
          break;
        case "bottom-right":
          x = cw - pw - margin;
          y = ch - ph - margin;
          break;
        default:
          x = cw - pw - margin;
          y = margin;
      }
      placedRef.current = true;
      setPosition(clamp(x, y));
    }

    tryPlace();
    const ro = new ResizeObserver(tryPlace);
    ro.observe(panel);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-clamp (never re-place) on container resize, once placed.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!placedRef.current) return;
      setPosition((pos) => (pos ? clamp(pos.x, pos.y) : pos));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, clamp]);

  const onPointerDown = useCallback(
    (e) => {
      if (!position) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [position]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setPosition(clamp(dragState.current.originX + dx, dragState.current.originY + dy));
    },
    [clamp]
  );

  const onPointerUp = useCallback((e) => {
    dragState.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  return {
    panelRef,
    position,
    isPlaced: position != null,
    dragHandleProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}
