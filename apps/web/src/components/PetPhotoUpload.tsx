import { useRef, useState } from "react";

interface Props {
  petId: string;
  /** Called after a successful upload so the parent can refresh the display. */
  onUploaded: () => void;
}

const MAX_DIMENSION = 1200;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Client-side-resize-then-upload component.
 *
 * Flow:
 * 1. User selects a file
 * 2. Component resizes to max 1200px on the longest side (canvas)
 * 3. Requests a presigned PUT URL from the API
 * 4. PUTs the resized blob directly to object storage
 * 5. Confirms upload with the API (records the key in DB)
 */
export function PetPhotoUpload({ petId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "resizing" }
    | { status: "uploading"; progress: number }
    | { status: "confirming" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function resizeImage(file: File): Promise<{ blob: Blob; contentType: string }> {
    // GIFs must bypass canvas resize — canvas destroys animation frames
    if (file.type === "image/gif") {
      return { blob: file, contentType: "image/gif" };
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const { width, height } = img;
        const scale =
          Math.max(width, height) > MAX_DIMENSION
            ? MAX_DIMENSION / Math.max(width, height)
            : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const contentType = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Failed to encode image"));
            resolve({ blob, contentType });
          },
          contentType,
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setState({ status: "error", message: "Please select a JPEG, PNG, WebP, or GIF image." });
      return;
    }

    setState({ status: "resizing" });

    let blob: Blob;
    let contentType: string;
    try {
      ({ blob, contentType } = await resizeImage(file));
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Image resize failed" });
      return;
    }

    // Get presigned upload URL
    setState({ status: "uploading", progress: 0 });
    let uploadUrl: string;
    let key: string;
    try {
      const res = await fetch(`/api/pets/${petId}/photo/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, fileSizeBytes: blob.size }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { uploadUrl: string; key: string };
      uploadUrl = data.uploadUrl;
      key = data.key;
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Failed to get upload URL" });
      return;
    }

    // Upload directly to object storage
    try {
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) {
            setState({ status: "uploading", progress: Math.round((ev.loaded / ev.total) * 100) });
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.send(blob);
      });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Upload failed" });
      return;
    }

    // Confirm with API
    setState({ status: "confirming" });
    try {
      const res = await fetch(`/api/pets/${petId}/photo/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Failed to confirm upload" });
      return;
    }

    setState({ status: "done" });
    onUploaded();

    // Reset after a moment
    setTimeout(() => setState({ status: "idle" }), 2000);
  }

  const busy = state.status === "resizing" || state.status === "uploading" || state.status === "confirming";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // reset so re-selecting same file works
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        style={{
          fontSize: 12,
          padding: "0.2rem 0.55rem",
          borderRadius: 5,
          border: "1px solid #d1d5db",
          background: "#fff",
          cursor: busy ? "not-allowed" : "pointer",
          color: busy ? "#9ca3af" : "#374151",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
        }}
      >
        {state.status === "idle" && "📷 Upload photo"}
        {state.status === "resizing" && "Resizing…"}
        {state.status === "uploading" && `Uploading ${state.progress}%`}
        {state.status === "confirming" && "Saving…"}
        {state.status === "done" && "✓ Uploaded"}
        {state.status === "error" && "📷 Upload photo"}
      </button>
      {state.status === "error" && (
        <div style={{ fontSize: 11, color: "#dc2626", marginTop: "0.2rem" }}>
          {state.message}
        </div>
      )}
    </div>
  );
}
