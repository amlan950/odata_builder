import { useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPES = ["String", "Int32", "Int64", "Decimal", "Boolean", "DateTime", "Guid", "Binary"];

const CARDINALITY_META = {
  "1:1":    { label: "One-to-One",  color: "#185FA5", bg: "#E6F1FB" },
  "1:N":    { label: "One-to-Many", color: "#0F6E56", bg: "#E1F5EE" },
  "1:0..1": { label: "Optional",    color: "#854F0B", bg: "#FAEEDA" },
};

// Depth-based left-border colors cycling through a palette
const DEPTH_COLORS = ["#185FA5", "#0F6E56", "#854F0B", "#993556", "#533AB7", "#1D9E75"];
const depthColor = (d) => DEPTH_COLORS[d % DEPTH_COLORS.length];

let _id = 1;
const uid = () => `x${_id++}`;

// ─── Data helpers ─────────────────────────────────────────────────────────────

const makeField = (name = "", type = "String", value = "") => ({ id: uid(), name, type, value });

const makeNav = (name = "Navigation", cardinality = "1:N") => ({
  id: uid(), name, cardinality,
  fields: [makeField("Id", "Int32", "")],
  children: [],   // ← supports nested navs
  collapsed: false,
});

const makeEntityStructure = (label = "Entity") => ({
  id: uid(), label,
  entitySetName: label.replace(/\s+/g, ""),
  odataContext: "",
  root: {
    id: uid(), name: "Header",
    fields: [makeField("Id", "Guid", ""), makeField("Name", "String", "")],
    children: [],
  },
});

function entityToPayload(node) {
  const obj = {};
  node.fields.forEach(f => {
    if (!f.name) return;
    let v = f.value;
    if (f.type === "Int32" || f.type === "Int64") v = v === "" ? "" : Number(v);
    else if (f.type === "Decimal") v = v === "" ? "" : parseFloat(v);
    else if (f.type === "Boolean") v = v === "true" || v === true;
    obj[f.name] = v === undefined ? "" : v;
  });
  (node.children || []).forEach(child => {
    if (!child.name) return;
    const payload = entityToPayload(child);
    obj[child.name] = child.cardinality === "1:N" ? [payload] : payload;
  });
  return obj;
}

const buildPayload = (s) => ({
  "@odata.context": s.odataContext || `$metadata#${s.entitySetName}`,
  ...entityToPayload(s.root),
});

function parseFieldPaste(text, fallback) {
  text = (text || "").trim();
  if (!text) return fallback;
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return Object.entries(obj).map(([k, v]) => {
        let type = "String";
        if (typeof v === "number") type = Number.isInteger(v) ? "Int32" : "Decimal";
        else if (typeof v === "boolean") type = "Boolean";
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) type = "DateTime";
        else if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) type = "Guid";
        return makeField(k, type, v == null ? "" : String(v));
      });
    }
  } catch {}
  const names = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  return names.length ? names.map(n => makeField(n)) : fallback;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function FieldRow({ field, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4 }}>
      <input value={field.name} onChange={e => onChange({ ...field, name: e.target.value })}
        placeholder="Field name"
        style={{ flex: "0 0 130px", fontSize: 12, padding: "4px 7px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
      <select value={field.type} onChange={e => onChange({ ...field, type: e.target.value })}
        style={{ flex: "0 0 86px", fontSize: 12, padding: "4px 4px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
        {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <input value={field.value || ""} onChange={e => onChange({ ...field, value: e.target.value })}
        placeholder="Value"
        style={{ flex: 1, fontSize: 12, padding: "4px 7px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
    </div>
  );
}

function PasteModal({ title, onConfirm, onClose, showCardinality = false, initialCardinality = "1:N" }) {
  const [text, setText] = useState("");
  const [card, setCard] = useState(initialCardinality);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", width: 500, padding: 24, maxWidth: "95vw" }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
          Paste a JSON object <code style={{ fontSize: 11 }}>{"{ \"Field\": value }"}</code> or field names separated by commas / newlines.
        </div>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)}
          placeholder={"{\n  \"Id\": 1,\n  \"Name\": \"Example\",\n  \"Amount\": 99.9\n}\n\n— or —\n\nId, Name, Amount, Status"}
          style={{ width: "100%", height: 160, fontFamily: "monospace", fontSize: 12, padding: 10, borderRadius: 7, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box" }} />
        {showCardinality && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 7 }}>Cardinality</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {Object.entries(CARDINALITY_META).map(([k, v]) => (
                <button key={k} onClick={() => setCard(k)} style={{
                  fontSize: 12, fontWeight: 700, padding: "5px 13px", borderRadius: 7,
                  background: card === k ? v.color : v.bg, color: card === k ? "#fff" : v.color,
                  border: `1.5px solid ${v.color}`, cursor: "pointer",
                }}>{k} — {v.label}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "6px 15px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onConfirm(text, card)} style={{ fontSize: 13, padding: "6px 18px", borderRadius: 6, border: "none", background: "#185FA5", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add-Navigation inline form (reused at every depth) ───────────────────────

function AddNavForm({ onCommit, onCancel, accentColor }) {
  const [name, setName] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);

  const commit = (cardinality, fields) => {
    if (!name) return;
    onCommit(name, cardinality, fields || null);
  };

  return (
    <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--color-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>New Navigation Property</div>

      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="Navigation name (e.g. Items, Address, PricingConditions)"
        style={{ width: "100%", fontSize: 13, padding: "6px 9px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 10 }} />

      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>Select cardinality to add</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.entries(CARDINALITY_META).map(([k, v]) => (
          <button key={k} onClick={() => commit(k, null)} disabled={!name}
            style={{ fontSize: 12, fontWeight: 700, padding: "5px 13px", borderRadius: 7, background: v.bg, color: v.color, border: `1.5px solid ${v.color}`, cursor: name ? "pointer" : "not-allowed", opacity: name ? 1 : 0.4 }}>
            {k} — {v.label}
          </button>
        ))}
      </div>

      {!name && <div style={{ fontSize: 11, color: "#E24B4A", marginBottom: 8 }}>Enter a name first</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Or paste fields + cardinality at once:</span>
        <button onClick={() => { if (name) setPasteOpen(true); }} disabled={!name}
          style={{ fontSize: 11, color: accentColor, background: "none", border: `1px dashed ${accentColor}88`, borderRadius: 5, padding: "3px 9px", cursor: name ? "pointer" : "not-allowed", opacity: name ? 1 : 0.4 }}>
          ⬇ Paste + Cardinality
        </button>
        <button onClick={onCancel} style={{ fontSize: 11, color: "var(--color-text-tertiary)", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 5, padding: "3px 9px", cursor: "pointer", marginLeft: "auto" }}>
          Cancel
        </button>
      </div>

      {pasteOpen && (
        <PasteModal title={`Paste fields for "${name}"`} showCardinality initialCardinality="1:N"
          onClose={() => setPasteOpen(false)}
          onConfirm={(text, card) => {
            const fields = parseFieldPaste(text, [makeField("Id", "Int32", "")]);
            commit(card, fields);
            setPasteOpen(false);
          }} />
      )}
    </div>
  );
}

// ─── NavNode — fully recursive navigation property node ───────────────────────

function NavNode({ nav, onUpdate, onRemove, depth }) {
  const [pasteFieldsOpen, setPasteFieldsOpen] = useState(false);
  const [addingChild, setAddingChild] = useState(false);

  const color = depthColor(depth);
  const m = CARDINALITY_META[nav.cardinality];

  // Field handlers
  const updField = (i, f) => { const fs = [...nav.fields]; fs[i] = f; onUpdate({ ...nav, fields: fs }); };
  const remField = (i) => onUpdate({ ...nav, fields: nav.fields.filter((_, j) => j !== i) });
  const addField = () => onUpdate({ ...nav, fields: [...nav.fields, makeField()] });

  // Child nav handlers
  const updChild = (i, u) => { const ch = [...(nav.children || [])]; ch[i] = u; onUpdate({ ...nav, children: ch }); };
  const remChild = (i) => onUpdate({ ...nav, children: (nav.children || []).filter((_, j) => j !== i) });
  const commitChild = (name, cardinality, fields) => {
    const child = makeNav(name, cardinality);
    if (fields) child.fields = fields;
    onUpdate({ ...nav, children: [...(nav.children || []), child] });
    setAddingChild(false);
  };

  const childCount = (nav.children || []).length;

  return (
    <div style={{
      border: `1.5px solid ${color}28`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      marginTop: 8,
      overflow: "hidden",
    }}>
      {/* ── Nav header bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: `${color}09`, borderBottom: nav.collapsed ? "none" : "0.5px solid var(--color-border-tertiary)" }}>
        {/* Collapse toggle */}
        <button onClick={() => onUpdate({ ...nav, collapsed: !nav.collapsed })}
          style={{ background: "none", border: "none", cursor: "pointer", color, fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0 }}>
          {nav.collapsed ? "▶" : "▼"}
        </button>

        {/* Depth indicator dots */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {Array.from({ length: Math.min(depth, 4) }).map((_, i) => (
            <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: color, opacity: 0.5 + (i / 4) * 0.5, display: "inline-block" }} />
          ))}
        </div>

        {/* Name input */}
        <input value={nav.name} onChange={e => onUpdate({ ...nav, name: e.target.value })}
          style={{ fontWeight: 700, fontSize: 13, background: "none", border: "none", color: "var(--color-text-primary)", outline: "none", flex: 1, minWidth: 60 }} />

        {/* Stats */}
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {nav.fields.length}f{childCount > 0 ? ` · ${childCount}nav` : ""}
        </span>

        {/* Inline cardinality pills */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {Object.entries(CARDINALITY_META).map(([k, v]) => (
            <button key={k} onClick={() => onUpdate({ ...nav, cardinality: k })} style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99,
              background: nav.cardinality === k ? v.color : v.bg,
              color: nav.cardinality === k ? "#fff" : v.color,
              border: `1.5px solid ${v.color}`, cursor: "pointer", whiteSpace: "nowrap",
            }}>{k}</button>
          ))}
        </div>

        {/* Remove */}
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 16, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
      </div>

      {/* ── Body ── */}
      {!nav.collapsed && (
        <div style={{ padding: "9px 10px" }}>

          {/* Fields section */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>
              Fields ({nav.fields.length})
            </div>
            {nav.fields.map((f, i) => <FieldRow key={f.id} field={f} onChange={u => updField(i, u)} onRemove={() => remField(i)} />)}
            <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
              <button onClick={addField} style={{ fontSize: 11, color, background: "none", border: `1px dashed ${color}66`, borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>+ Field</button>
              <button onClick={() => setPasteFieldsOpen(true)} style={{ fontSize: 11, color, background: m.bg, border: `1px solid ${color}44`, borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>⬇ Paste Fields</button>
            </div>
          </div>

          {/* Nested navigation section */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>
                Nested Navigation ({childCount})
              </div>
              {!addingChild && (
                <button onClick={() => setAddingChild(true)}
                  style={{ fontSize: 10, fontWeight: 700, color, background: m.bg, border: `1px solid ${color}55`, borderRadius: 5, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  + Add Nested Nav
                </button>
              )}
            </div>

            {/* Render child navs recursively */}
            {(nav.children || []).map((child, i) => (
              <NavNode
                key={child.id}
                nav={child}
                depth={depth + 1}
                onUpdate={u => updChild(i, u)}
                onRemove={() => remChild(i)}
              />
            ))}

            {childCount === 0 && !addingChild && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", padding: "8px 0 4px", fontStyle: "italic" }}>
                No nested navigation — click "+ Add Nested Nav" to go deeper.
              </div>
            )}

            {addingChild && (
              <AddNavForm
                accentColor={depthColor(depth + 1)}
                onCommit={commitChild}
                onCancel={() => setAddingChild(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Field paste modal */}
      {pasteFieldsOpen && (
        <PasteModal title={`Paste fields for "${nav.name}"`}
          onClose={() => setPasteFieldsOpen(false)}
          onConfirm={(text) => { onUpdate({ ...nav, fields: parseFieldPaste(text, nav.fields) }); setPasteFieldsOpen(false); }} />
      )}
    </div>
  );
}

// ─── Root entity editor (header + top-level nav list) ─────────────────────────

function RootEntityEditor({ entity, onUpdate }) {
  const [headerPasteOpen, setHeaderPasteOpen] = useState(false);
  const [addingNav, setAddingNav] = useState(false);

  const updField = (i, f) => { const fs = [...entity.fields]; fs[i] = f; onUpdate({ ...entity, fields: fs }); };
  const remField = (i) => onUpdate({ ...entity, fields: entity.fields.filter((_, j) => j !== i) });
  const addField = () => onUpdate({ ...entity, fields: [...entity.fields, makeField()] });

  const updNav = (i, u) => { const ch = [...entity.children]; ch[i] = u; onUpdate({ ...entity, children: ch }); };
  const remNav = (i) => onUpdate({ ...entity, children: entity.children.filter((_, j) => j !== i) });

  const commitNav = (name, cardinality, fields) => {
    const nav = makeNav(name, cardinality);
    if (fields) nav.fields = fields;
    onUpdate({ ...entity, children: [...entity.children, nav] });
    setAddingNav(false);
  };

  return (
    <div style={{ border: "1.5px solid #185FA533", borderLeft: "3px solid #185FA5", borderRadius: 10, overflow: "hidden" }}>

      {/* ── Header / root fields ── */}
      <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "#185FA508" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#185FA5", background: "#E6F1FB", padding: "2px 8px", borderRadius: 4 }}>HEADER</span>
          <input value={entity.name} onChange={e => onUpdate({ ...entity, name: e.target.value })}
            style={{ fontWeight: 700, fontSize: 14, background: "none", border: "none", color: "var(--color-text-primary)", outline: "none", flex: 1 }} />
          <button onClick={() => setHeaderPasteOpen(true)}
            style={{ fontSize: 11, fontWeight: 700, color: "#185FA5", background: "#E6F1FB", border: "1px solid #185FA544", borderRadius: 5, padding: "4px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
            ⬇ Paste JSON / Fields
          </button>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
          Fields ({entity.fields.length})
        </div>
        {entity.fields.map((f, i) => <FieldRow key={f.id} field={f} onChange={u => updField(i, u)} onRemove={() => remField(i)} />)}
        <button onClick={addField} style={{ fontSize: 11, color: "#185FA5", background: "none", border: "1px dashed #185FA566", borderRadius: 5, padding: "3px 10px", cursor: "pointer", marginTop: 4 }}>+ Field</button>
      </div>

      {/* ── Navigation properties ── */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0F6E56", background: "#E1F5EE", padding: "2px 8px", borderRadius: 4 }}>NAVIGATION</span>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{entity.children.length} propert{entity.children.length === 1 ? "y" : "ies"}</span>
          </div>
          {!addingNav && (
            <button onClick={() => setAddingNav(true)}
              style={{ fontSize: 11, fontWeight: 700, color: "#0F6E56", background: "#E1F5EE", border: "1px solid #0F6E5644", borderRadius: 5, padding: "4px 11px", cursor: "pointer" }}>
              + Add Navigation
            </button>
          )}
        </div>

        {/* Existing nav nodes */}
        {entity.children.map((nav, i) => (
          <NavNode key={nav.id} nav={nav} depth={1} onUpdate={u => updNav(i, u)} onRemove={() => remNav(i)} />
        ))}

        {entity.children.length === 0 && !addingNav && (
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", padding: "16px 0", border: "1px dashed var(--color-border-tertiary)", borderRadius: 7, fontStyle: "italic" }}>
            No navigation properties — click "+ Add Navigation" to link related entities.
          </div>
        )}

        {addingNav && (
          <AddNavForm accentColor="#0F6E56" onCommit={commitNav} onCancel={() => setAddingNav(false)} />
        )}
      </div>

      {headerPasteOpen && (
        <PasteModal title={`Paste Header Fields — "${entity.name}"`}
          onClose={() => setHeaderPasteOpen(false)}
          onConfirm={(text) => { onUpdate({ ...entity, fields: parseFieldPaste(text, entity.fields) }); setHeaderPasteOpen(false); }} />
      )}
    </div>
  );
}

// ─── JSON panel ───────────────────────────────────────────────────────────────

function JsonPanel({ payload }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(payload, null, 2);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>JSON Output</span>
        <button onClick={copy} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: copied ? "#E1F5EE" : "var(--color-background-secondary)", color: copied ? "#0F6E56" : "var(--color-text-secondary)", cursor: "pointer" }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
        <pre style={{ margin: 0, fontSize: 11.5, lineHeight: 1.8, fontFamily: "monospace", color: "var(--color-text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</pre>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [structures, setStructures] = useState(() => {
    const s = makeEntityStructure("SalesOrder");
    s.root.name = "SalesOrderHeader";
    s.root.fields = [
      makeField("OrderId", "Guid", ""),
      makeField("CustomerName", "String", "Acme Corp"),
      makeField("OrderDate", "DateTime", "2024-01-15T10:00:00Z"),
      makeField("TotalAmount", "Decimal", "1250.00"),
    ];
    // Level 1 nav
    const items = makeNav("Items", "1:N");
    items.fields = [makeField("ItemId", "Int32", "1"), makeField("ProductName", "String", "Widget A"), makeField("Quantity", "Int32", "2"), makeField("UnitPrice", "Decimal", "125.00")];
    // Level 2 nav (nested inside Items)
    const pricing = makeNav("PricingConditions", "1:N");
    pricing.fields = [makeField("ConditionId", "Int32", ""), makeField("ConditionType", "String", "PR00"), makeField("Amount", "Decimal", "100.00")];
    items.children = [pricing];
    s.root.children = [items];
    return [s];
  });

  const [activeId, setActiveId] = useState(() => structures[0].id);
  const [view, setView] = useState("builder");

  const active = structures.find(s => s.id === activeId) || structures[0];
  const updateActive = (updated) => setStructures(prev => prev.map(s => s.id === updated.id ? updated : s));

  const addStructure = () => {
    const s = makeEntityStructure(`Entity ${structures.length + 1}`);
    setStructures(prev => [...prev, s]);
    setActiveId(s.id);
    setView("builder");
  };

  const removeStructure = (id) => {
    if (structures.length === 1) return;
    const rest = structures.filter(s => s.id !== id);
    setStructures(rest);
    if (activeId === id) setActiveId(rest[0].id);
  };

  const payload = buildPayload(active);

  return (
    <div style={{ fontFamily: "var(--font-sans, system-ui)", color: "var(--color-text-primary)", minHeight: "100vh", background: "var(--color-background-tertiary)" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 50, overflowX: "auto" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>O</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em" }}>OData Builder</span>
          </div>

          <div style={{ width: 1, height: 22, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

          {/* Entity structure tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
            {structures.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "stretch", flexShrink: 0 }}>
                <button onClick={() => { setActiveId(s.id); setView("builder"); }} style={{
                  fontSize: 12, padding: "5px 12px",
                  borderRadius: structures.length > 1 ? "6px 0 0 6px" : 6,
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRight: structures.length > 1 ? "none" : undefined,
                  cursor: "pointer",
                  background: activeId === s.id ? "#185FA5" : "var(--color-background-secondary)",
                  color: activeId === s.id ? "#fff" : "var(--color-text-secondary)",
                  fontWeight: activeId === s.id ? 700 : 400,
                }}>{s.label}</button>
                {structures.length > 1 && (
                  <button onClick={() => removeStructure(s.id)} style={{
                    fontSize: 13, padding: "0 7px",
                    borderRadius: "0 6px 6px 0",
                    border: "0.5px solid var(--color-border-secondary)",
                    background: activeId === s.id ? "#12518933" : "var(--color-background-secondary)",
                    color: activeId === s.id ? "#ffffffaa" : "#E24B4A",
                    cursor: "pointer", lineHeight: 1,
                  }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addStructure} style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "1.5px dashed #185FA577", background: "none", color: "#185FA5", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              + New Entity
            </button>
          </div>

          <div style={{ width: 1, height: 22, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {[["builder", "Builder"], ["payload", "JSON Payload"]].map(([id, lbl]) => (
              <button key={id} onClick={() => setView(id)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: view === id ? "#E6F1FB" : "none", color: view === id ? "#185FA5" : "var(--color-text-secondary)", fontWeight: view === id ? 700 : 400 }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Metadata bar ── */}
      <div style={{ background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "5px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {[["Label", "label", 130], ["Entity Set", "entitySetName", 150], ["@odata.context", "odataContext", 250]].map(([title, key, w]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>{title}</span>
            <input value={active[key]} onChange={e => updateActive({ ...active, [key]: e.target.value })}
              placeholder={key === "odataContext" ? `$metadata#${active.entitySetName}` : ""}
              style={{ fontSize: 12, padding: "3px 7px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: w }} />
          </div>
        ))}
      </div>

      {/* ── Depth legend ── */}
      {view === "builder" && (
        <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "4px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Depth</span>
          {["Header", "Level 1 Nav", "Level 2 Nav", "Level 3+ Nav"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: depthColor(i), display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Main ── */}
      <div style={{ padding: 16, maxWidth: 1260, margin: "0 auto" }}>
        {view === "builder" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, alignItems: "start" }}>
            <div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{active.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  Add navigation properties at any level. Each nav node supports its own nested navigations — unlimited depth.
                </div>
              </div>
              <RootEntityEditor entity={active.root} onUpdate={root => updateActive({ ...active, root })} />
            </div>

            <div style={{ position: "sticky", top: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Live Preview</div>
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden", maxHeight: 620, display: "flex", flexDirection: "column" }}>
                <JsonPanel payload={payload} />
              </div>
            </div>
          </div>
        )}

        {view === "payload" && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{active.label} — JSON Payload</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>Ready-to-use OData JSON output</div>
            </div>
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden", minHeight: 500, display: "flex", flexDirection: "column" }}>
              <JsonPanel payload={payload} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}