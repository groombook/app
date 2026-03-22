import { useEffect, useState } from "react";

interface Props {
  petId: string;
  /** Size of the photo avatar in pixels. Default: 64. */
  size?: number;
  className?: string;
}

type PhotoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; url: string }
  | { status: "none" }
  | { status: "error" };

/**
 * Fetches and displays a pet's photo from the API.
 * Shows a loading skeleton while fetching, a paw-print placeholder when no photo exists,
 * and gracefully falls back to the placeholder on error.
 */
export function PetPhotoDisplay({ petId, size = 64, className }: Props) {
  const [state, setState] = useState<PhotoState>({ status: "idle" });

  useEffect(() => {
    setState({ status: "loading" });
    fetch(`/api/pets/${petId}/photo`)
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: "none" });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { url: string };
        setState({ status: "loaded", url: data.url });
      })
      .catch(() => setState({ status: "error" }));
  }, [petId]);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.2),
    overflow: "hidden",
    background: "#f0ebe4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  if (state.status === "loading") {
    return (
      <div
        className={className}
        style={{
          ...containerStyle,
          background: "linear-gradient(90deg, #f0ebe4 25%, #e8e0d8 50%, #f0ebe4 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
        aria-label="Loading photo…"
      />
    );
  }

  if (state.status === "loaded") {
    return (
      <div className={className} style={containerStyle}>
        <img
          src={state.url}
          alt="Pet photo"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
        />
      </div>
    );
  }

  // no photo / error — paw placeholder
  return (
    <div className={className} style={containerStyle} aria-label="No photo">
      <span style={{ fontSize: Math.round(size * 0.45), userSelect: "none" }}>🐾</span>
    </div>
  );
}
