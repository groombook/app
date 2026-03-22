import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

interface ClientResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface PetResult {
  id: string;
  name: string;
  breed: string | null;
  clientId: string;
  ownerName: string;
}

interface SearchResults {
  clients: ClientResult[];
  pets: PetResult[];
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(null);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data: SearchResults = await res.json();
          setResults(data);
          setOpen(true);
        }
      } catch (err) {
        console.warn("GlobalSearch: fetch error", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleClientClick(client: ClientResult) {
    setOpen(false);
    setQuery("");
    navigate(`/admin/clients?highlight=${client.id}`);
  }

  function handlePetClick(pet: PetResult) {
    setOpen(false);
    setQuery("");
    navigate(`/admin/clients?highlight=${pet.clientId}`);
  }

  const hasResults = results && (results.clients.length > 0 || results.pets.length > 0);

  return (
    <div style={{ position: "relative", flex: "1 1 0", maxWidth: 320, minWidth: 0 }}>
      <div style={{ position: "relative" }}>
        <Search
          size={15}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#9ca3af",
            pointerEvents: "none",
          }}
        />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search clients & pets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: 44,
            paddingLeft: 32,
            paddingRight: 12,
            fontSize: 13,
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            outline: "none",
            background: "#f8fafc",
            color: "#1a202c",
          }}
          aria-label="Search clients and pets"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />
      </div>

      {open && (
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            zIndex: 100,
            overflow: "hidden",
            minWidth: "100%",
          }}
        >
          {loading && (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>
              Searching…
            </div>
          )}

          {!loading && !hasResults && (
            <div style={{ padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>
              No results found
            </div>
          )}

          {!loading && results && results.clients.length > 0 && (
            <div>
              <div
                style={{
                  padding: "6px 16px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                Clients
              </div>
              {results.clients.map((client) => (
                <button
                  key={client.id}
                  role="option"
                  onClick={() => handleClientClick(client)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    padding: "12px 16px",
                    minHeight: 48,
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#1a202c" }}>
                    {client.name}
                  </span>
                  {client.phone && (
                    <span style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>
                      {client.phone}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!loading && results && results.pets.length > 0 && (
            <div>
              <div
                style={{
                  padding: "6px 16px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                Pets
              </div>
              {results.pets.map((pet) => (
                <button
                  key={pet.id}
                  role="option"
                  onClick={() => handlePetClick(pet)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    padding: "12px 16px",
                    minHeight: 48,
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#1a202c" }}>
                    {pet.name}
                    {pet.breed && (
                      <span style={{ fontWeight: 400, color: "#4b5563" }}> · {pet.breed}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>
                    Owner: {pet.ownerName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
