import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { parseNumber } from "@/lib/etr-data";

/**
 * Celda editable: doble clic para editar, Enter para guardar, Esc para cancelar.
 * Sirve tanto para datos cargados por el asesor como para sobreescribir datos reales.
 */
export function Editable({
  value,
  display,
  onCommit,
  type = "text",
  className,
  inputClassName,
  align = "left",
  title = "Doble clic para editar · Enter para guardar",
  options,
}: {
  value: string | number;
  display?: React.ReactNode;
  onCommit: (raw: string) => void;
  type?: "text" | "number";
  className?: string;
  inputClassName?: string;
  align?: "left" | "right";
  title?: string;
  options?: readonly string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      selectRef.current?.focus();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== String(value)) onCommit(draft);
  };

  if (editing && options) {
    return (
      <select
        ref={selectRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== String(value)) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className={cn(
          "w-full rounded-sm border border-primary/60 bg-surface-2 px-1 py-0.5 text-sm outline-none",
          inputClassName,
        )}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        inputMode={type === "number" ? "decimal" : "text"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setDraft(String(value));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className={cn(
          "w-full rounded-sm border border-primary/60 bg-surface-2 px-1 py-0.5 text-sm outline-none",
          align === "right" && "text-right",
          inputClassName,
        )}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setEditing(true);
      }}
      className={cn(
        "inline-block min-w-6 cursor-text rounded-sm px-0.5 outline-none transition-colors hover:bg-primary/10 focus-visible:ring-1 focus-visible:ring-primary",
        align === "right" && "text-right",
        className,
      )}
    >
      {display ?? String(value)}
    </span>
  );
}

/** Helper para commitear valores numéricos. */
export const commitNumber = (raw: string, apply: (n: number) => void) => {
  const n = parseNumber(raw);
  if (n !== null) apply(n);
};
