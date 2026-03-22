import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PetPhotoUpload } from "../components/PetPhotoUpload.js";

// ── XHR mock ─────────────────────────────────────────────────────────────────

interface XhrMock {
  upload: { addEventListener: ReturnType<typeof vi.fn> };
  addEventListener: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  status: number;
  // Callbacks stored by the mock so tests can trigger them
  _triggerLoad: () => void;
  _triggerError: () => void;
  _triggerProgress: (loaded: number, total: number) => void;
}

function makeXhrMock(status = 200): XhrMock {
  const uploadListeners: Record<string, (ev: ProgressEvent) => void> = {};
  const listeners: Record<string, () => void> = {};

  const mock: XhrMock = {
    upload: {
      addEventListener: vi.fn((event: string, cb: (ev: ProgressEvent) => void) => {
        uploadListeners[event] = cb;
      }),
    },
    addEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    status,
    _triggerLoad: () => listeners["load"]?.(),
    _triggerError: () => listeners["error"]?.(),
    _triggerProgress: (loaded, total) =>
      uploadListeners["progress"]?.({ lengthComputable: true, loaded, total } as ProgressEvent),
  };
  return mock;
}

// ── Canvas mock ───────────────────────────────────────────────────────────────

// jsdom doesn't implement canvas — provide a minimal stub
function mockCanvas(blob: Blob) {
  const ctx = { drawImage: vi.fn() };
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toBlob: (cb: (b: Blob | null) => void) => cb(blob),
      };
      return canvas as unknown as HTMLCanvasElement;
    }
    return originalCreateElement(tag);
  });
}

// ── Image mock ────────────────────────────────────────────────────────────────

function mockImage(width = 800, height = 600) {
  const originalImage = globalThis.Image;
  const ImageMock = vi.fn().mockImplementation(() => {
    const img = {
      width,
      height,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      set src(_v: string) {
        // trigger onload asynchronously
        setTimeout(() => img.onload?.(), 0);
      },
    };
    return img;
  });
  globalThis.Image = ImageMock as unknown as typeof Image;
  return () => {
    globalThis.Image = originalImage;
  };
}

// ── URL mock ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(type = "image/jpeg", name = "photo.jpg", sizeBytes = 1024): File {
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type });
}

function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PetPhotoUpload", () => {
  it("renders the upload button in idle state", () => {
    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("shows an error for an unsupported file type", async () => {
    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    selectFile(makeFile("text/plain", "doc.txt"));

    await waitFor(() => {
      expect(screen.getByText(/JPEG, PNG, WebP, or GIF/i)).toBeInTheDocument();
    });
  });

  it("disables the button while uploading", async () => {
    const restoreImage = mockImage();
    const resizedBlob = new Blob(["x"], { type: "image/jpeg" });
    mockCanvas(resizedBlob);

    let xhrInstance: XhrMock;
    const XHRMock = vi.fn().mockImplementation(() => {
      xhrInstance = makeXhrMock(200);
      return xhrInstance;
    });
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ uploadUrl: "https://storage.test/put", key: "pets/pet-1/123.jpg" }),
      } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    selectFile(makeFile("image/jpeg"));

    // Button should become disabled during upload
    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
    });

    restoreImage();
  });

  it("calls onUploaded and resets after successful upload", async () => {
    const restoreImage = mockImage();
    const resizedBlob = new Blob(["x"], { type: "image/jpeg" });
    mockCanvas(resizedBlob);

    let xhrInstance!: XhrMock;
    const XHRMock = vi.fn().mockImplementation(() => {
      xhrInstance = makeXhrMock(200);
      return xhrInstance;
    });
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest;

    const onUploaded = vi.fn();
    global.fetch = vi.fn((url: string) => {
      if ((url as string).includes("upload-url")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ uploadUrl: "https://storage.test/put", key: "pets/pet-1/123.jpg" }),
        } as Response);
      }
      // confirm
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
    }) as unknown as typeof fetch;

    render(<PetPhotoUpload petId="pet-1" onUploaded={onUploaded} />);
    selectFile(makeFile("image/jpeg"));

    // Wait for XHR to be set up, then trigger load
    await waitFor(() => expect(xhrInstance).toBeDefined());
    xhrInstance._triggerLoad();

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledTimes(1);
    });

    restoreImage();
  });

  it("shows error message when upload-url request fails", async () => {
    const restoreImage = mockImage();
    const resizedBlob = new Blob(["x"], { type: "image/jpeg" });
    mockCanvas(resizedBlob);

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ error: "Pet not found" }),
      } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    selectFile(makeFile("image/jpeg"));

    await waitFor(() => {
      expect(screen.getByText(/Pet not found/)).toBeInTheDocument();
    });

    restoreImage();
  });

  it("shows error message when XHR upload fails", async () => {
    const restoreImage = mockImage();
    const resizedBlob = new Blob(["x"], { type: "image/jpeg" });
    mockCanvas(resizedBlob);

    let xhrInstance!: XhrMock;
    const XHRMock = vi.fn().mockImplementation(() => {
      xhrInstance = makeXhrMock(0);
      return xhrInstance;
    });
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ uploadUrl: "https://storage.test/put", key: "pets/pet-1/123.jpg" }),
      } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    selectFile(makeFile("image/jpeg"));

    await waitFor(() => expect(xhrInstance).toBeDefined());
    xhrInstance._triggerError();

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    restoreImage();
  });

  it("shows upload progress percentage", async () => {
    const restoreImage = mockImage();
    const resizedBlob = new Blob(["x"], { type: "image/jpeg" });
    mockCanvas(resizedBlob);

    let xhrInstance!: XhrMock;
    const XHRMock = vi.fn().mockImplementation(() => {
      xhrInstance = makeXhrMock(200);
      return xhrInstance;
    });
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest;

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ uploadUrl: "https://storage.test/put", key: "pets/pet-1/123.jpg" }),
      } as Response)
    ) as unknown as typeof fetch;

    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    selectFile(makeFile("image/jpeg"));

    await waitFor(() => expect(xhrInstance).toBeDefined());
    xhrInstance._triggerProgress(50, 100);

    await waitFor(() => {
      expect(screen.getByText(/Uploading 50%/)).toBeInTheDocument();
    });

    restoreImage();
  });

  it("skips canvas resize for GIF files", async () => {
    const createElementSpy = vi.spyOn(document, "createElement");

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ uploadUrl: "https://storage.test/put", key: "pets/pet-1/123.gif" }),
      } as Response)
    ) as unknown as typeof fetch;

    let xhrInstance!: XhrMock;
    const XHRMock = vi.fn().mockImplementation(() => {
      xhrInstance = makeXhrMock(200);
      return xhrInstance;
    });
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest;

    render(<PetPhotoUpload petId="pet-1" onUploaded={vi.fn()} />);
    selectFile(makeFile("image/gif", "anim.gif", 512));

    // Wait for XHR to be invoked
    await waitFor(() => expect(xhrInstance).toBeDefined());

    // canvas should NOT have been created for GIF
    const canvasCalls = createElementSpy.mock.calls.filter(([tag]) => tag === "canvas");
    expect(canvasCalls.length).toBe(0);
  });
});
