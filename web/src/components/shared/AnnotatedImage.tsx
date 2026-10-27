import React, { useRef, useState } from "react";

/**
 * One annotation in the component's normalized shape. Callers map their
 * own payloads onto this: MapView detections already match it; TrashLogs
 * maps its `{ xmin.. }` BoundingBox rows; the report detail modal maps the
 * backend's flat `{ bbox_x1.. }` fields.
 */
export interface Annotation {
  label?: string;
  confidence?: number;
  bbox: [number, number, number, number];
}

interface AnnotatedImageProps {
  imageUrl: string;
  alt: string;
  annotations: Annotation[];
  /** MapView's canvas export needs `crossOrigin="anonymous"` on the img. */
  crossOrigin?: boolean;
  /** Extra classes for the relative container wrapping image + overlay. */
  containerClassName?: string;
  /** Sizing classes for the img itself (each page's existing max-height). */
  imageClassName?: string;
  /** Escape hatch for wrappers that re-export the frame via canvas — the
   * component never owns a canvas export itself (design D8). */
  imgRef?: React.MutableRefObject<HTMLImageElement | null>;
  /** Passthrough for callers that gate skeleton overlays on load. */
  onImageLoad?: React.ReactEventHandler<HTMLImageElement>;
  /** Footer slots rendered inside the container (e.g. TrashLogs stats). */
  children?: React.ReactNode;
}

/**
 * The one YOLO overlay renderer for the whole portal (design §6.1): an
 * `object-contain` img with a single SVG stacked on top whose viewBox is the
 * image's NATIVE pixel space — both letterbox identically, so boxes stay
 * glued to objects at any rendered size with no scaling state. Native size is
 * read on load, with an `img.complete` fallback for cache hits that finish
 * before React attaches onLoad (proven twice before this extraction).
 */
export const AnnotatedImage = React.memo(function AnnotatedImage({
  imageUrl,
  alt,
  annotations,
  crossOrigin = false,
  containerClassName = "",
  imageClassName = "",
  imgRef,
  onImageLoad,
  children,
}: AnnotatedImageProps) {
  const innerRef = useRef<HTMLImageElement | null>(null);
  // Native pixel size, read once on load: the SVG viewBox needs it. Purely
  // view state — no scaling math survives.
  const [nativeSize, setNativeSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const setRef = (el: HTMLImageElement | null) => {
    innerRef.current = el;
    if (imgRef) imgRef.current = el;
    // Cached images can finish loading before React attaches onLoad;
    // recover the native size here so boxes never stay hidden.
    if (el?.complete && el.naturalWidth) {
      setNativeSize((prev) => prev ?? { w: el.naturalWidth, h: el.naturalHeight });
    }
  };

  const drawAnnotations = annotations.length > 0 && nativeSize !== null;

  return (
    <div className={`relative w-full ${containerClassName}`.trim()}>
      <img
        ref={setRef}
        src={imageUrl}
        crossOrigin={crossOrigin ? "anonymous" : undefined}
        alt={alt}
        onLoad={(e) => {
          onImageLoad?.(e);
          setNativeSize({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          });
        }}
        className={`w-full h-auto object-contain select-none ${imageClassName}`.trim()}
      />

      {/* Same-letterbox overlay: viewBox = native pixels, so x/y map 1:1 to
          the model's coordinate space at any rendered size, and
          non-scaling-stroke keeps borders 2px on screen.
          Malformed entries (missing bbox / undefined x1) are skipped, not
          thrown — inherited from both predecessors. */}
      {drawAnnotations && (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox={`0 0 ${nativeSize!.w} ${nativeSize!.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {annotations.map((ann, idx) => {
            if (!ann.bbox || ann.bbox[0] === undefined) return null;
            const [x1, y1, x2, y2] = ann.bbox;
            const width = Math.max(0, x2 - x1);
            const height = Math.max(0, y2 - y1);

            const pct =
              ann.confidence != null
                ? Math.round(
                    (ann.confidence > 1 ? ann.confidence / 100 : ann.confidence) *
                      100,
                  )
                : null;

            return (
              <g key={idx}>
                <rect
                  x={x1}
                  y={y1}
                  width={width}
                  height={height}
                  fill="rgba(239, 68, 68, 0.1)"
                  stroke="#EF4444"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={x1 + 5}
                  y={y1 > 14 ? y1 - 4 : y1 + 12}
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="900"
                  className="font-sans uppercase tracking-tight select-none"
                  style={{
                    paintOrder: "stroke",
                    stroke: "#000000",
                    strokeWidth: "2.5px",
                  }}
                >
                  {(ann.label || "waste").replace(/_/g, " ")}
                  {pct !== null ? ` ${pct}%` : ""}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {children}
    </div>
  );
});
