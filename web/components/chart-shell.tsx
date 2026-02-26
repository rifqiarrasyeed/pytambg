"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type ChartShellProps = {
  minHeight?: number;
  minWidth?: number;
  className?: string;
  children: (size: { width: number; height: number }) => ReactNode;
};

type BoxSize = {
  width: number;
  height: number;
};

const DEFAULT_MIN_HEIGHT = 260;
const DEFAULT_MIN_WIDTH = 280;

function readSize(element: HTMLElement): BoxSize {
  const width = Math.floor(element.clientWidth);
  const height = Math.floor(element.clientHeight);
  return { width, height };
}

export function ChartShell({
  minHeight = DEFAULT_MIN_HEIGHT,
  minWidth = DEFAULT_MIN_WIDTH,
  className,
  children
}: ChartShellProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => setSize(readSize(host));
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const validSize = size.width >= minWidth && size.height >= minHeight;

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: "100%",
        minWidth,
        minHeight,
        height: "100%"
      }}
    >
      {validSize ? (
        children(size)
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            minHeight,
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "var(--surface-2)"
          }}
        />
      )}
    </div>
  );
}
