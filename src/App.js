import { useState } from "react";

const FIELD_TYPES = ["String", "Int32", "Int64", "Decimal", "Boolean", "DateTime", "Guid", "Binary"];

const CARDINALITY_META = {
  "1:1":    { label: "One-to-One",  icon: "1:1",    color: "#185FA5", bg: "#E6F1FB" },
  "1:N":    { label: "One-to-Many", icon: "1:N",    color: "#0F6E56", bg: "#E1F5EE" },
  "1:0..1": { label: "Optional",    icon: "1:0..1", color: "#854F0B", bg: "#FAEEDA" },
};

let _id = 1;
const uid = () => `x${_id++}`;

function makeField(name = "", type = "String", value = "") {
  return { id: uid(), name, type, value };
}

function makeNav(name = "Items", cardinality = "1:N") {
  return { id: uid(), name, cardinality, fields: [makeField("Id", "Int32", "")], collapsed: false };
}

function makeEntityStructure(label = "Entity Structure") {
  return {
    id: uid(),
    label,
    entitySetName: label.replace(/\s+/g, ""),
    odataContext: "",
    root: {
      id: uid(),
      name: "Header",
      fields: [makeField("Id", "Guid", ""), makeField("Name", "String", "")],
      children: [],
    },
  };
}

function entityToPayload(entity) {
  const obj = {};
  entity.fields.forEach(f => {
    if (!f.name) return;
    let v = f.value;
    if (f.type === "Int32" || f.type === "Int64") v = v === "" ? null : Number(v);
    else if (f.type === "Decimal") v = v === "" ? null : parseFloat(v);
    else if (f.type === "Boolean") v = v === "true" || v === true;
    else if (v === "") v = null;
    obj[f.name] = v;
  });
  (entity.children || []).forEach(child => {
    if (!child.name) return;
    if (child.cardinality === "1:N") {
      obj[child.name] = [entityToPayload(child)];
    } else {
      obj[child.name] = entityToPayload(child);
    }
  });
  return obj;
}

function buildPayload(struct) {
  const ctx = struct.odataContext || `$metadata#${struct.entitySetName}`;
  return { "@odata.context": ctx, ...entityToPayload(struct.root) };
}

function parseFieldPaste(text, fallback) {
  text = text.trim();
  if (!text) return fallback;
  try {
    const obj = JSON.parse(text);
    if (typeof obj === "object" && !Array.isArray(obj)) {
      return Object.entries(obj).map(([k, v]) => {
        let type = "String";
        if (typeof v === "number") type = Number.isInteger(v) ? "Int32" : "Decimal";
        else if (typeof v === "boolean") type = "Boolean";
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) type = "DateTime";
        else if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) type = "Guid";
        return makeField(k, type, v === null ? "" : String(v));
      });
    }
  } catch {}
  const names = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (names.length) return names.map(n => makeField(n));
  return fallback;
}

// ─── UI Pieces ────────────────────────────────────────────────────────────────

function CardBadge({ cardinality, clickable, active, onClick }) {
  const m = CARDINALITY_META[cardinality];
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
      background: active ? m.color : m.bg,
      color: active ? "#fff" : m.color,
      border: `1.5px solid ${m.color}`,
      cursor: clickable ? "pointer" : "default",
      whiteSpace: "nowrap", letterSpacing: "0.02em",
    }}>
      {m.icon} {m.label}
    </button>
  );
}

function PasteModal({ title, onConfirm, onClose, showCardinality = false, initialCardinality = "1:1" }) {
  const [text, setText] = useState("");
  const [card, setCard] = useState(initialCardinality);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: "0.5px solid var(--color-border-secondary)", width: 500, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 14 }}>
          Paste a JSON object <span style={{ color: "var(--color-text-secondary)" }}>{"{ \"FieldName\": value }"}</span> — or field names separated by commas / newlines.
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"{\n  \"Id\": 1,\n  \"Name\": \"Example\",\n  \"Amount\": 99.9\n}\n\n— or —\n\nId, Name, Amount, Status"}
          style={{ width: "100%", height: 170, fontFamily: "monospace", fontSize: 12, padding: 10, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box" }}
        />
        {showCardinality && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Relationship (Cardinality)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.keys(CARDINALITY_META).map(k => (
                <CardBadge key={k} cardinality={k} clickable active={card === k} onClick={() => setCard(k)} />
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 7, border: "0.5px solid var(--color-border-secondary)", background: "none", color: "var(--color-text-secondary)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onConfirm(text, card)} style={{ fontSize: 13, padding: "7px 18px", borderRadius: 7, border: "none", background: "#185FA5", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ field, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
      <input value={field.name} onChange={e => onChange({ ...field, name: e.target.value })} placeholder="Field name"
        style={{ flex: "0 0 140px", fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
      <select value={field.type} onChange={e => onChange({ ...field, type: e.target.value })}
        style={{ flex: "0 0 88px", fontSize: 12, padding: "4px 5px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
        {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <input value={field.value || ""} onChange={e => onChange({ ...field, value: e.target.value })} placeholder="Value"
        style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
      <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 17, lineHeight: 1, padding: "0 2px" }}>×</button>
    </div>
  );
}

function NavSection({ nav, onUpdate, onRemove }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const m = CARDINALITY_META[nav.cardinality];

  const updateField = (i, f) => { const fs = [...nav.fields]; fs[i] = f; onUpdate({ ...nav, fields: fs }); };
  const removeField = (i) => onUpdate({ ...nav, fields: nav.fields.filter((_, j) => j !== i) });
  const addField = () => onUpdate({ ...nav, fields: [...nav.fields, makeField()] });

  return (
    <div style={{ border: `1.5px solid ${m.color}33`, borderLeft: `3px solid ${m.color}`, borderRadius: 9, marginTop: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: `${m.color}0a`, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        <button onClick={() => onUpdate({ ...nav, collapsed: !nav.collapsed })}
          style={{ background: "none", border: "none", cursor: "pointer", color: m.color, fontSize: 12, padding: 0, lineHeight: 1 }}>
          {nav.collapsed ? "▶" : "▼"}
        </button>
        <input value={nav.name} onChange={e => onUpdate({ ...nav, name: e.target.value })}
          style={{ fontWeight: 700, fontSize: 13, background: "none", border: "none", color: "var(--color-text-primary)", outline: "none", flex: 1 }} />
        {/* Inline cardinality selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {Object.keys(CARDINALITY_META).map(k => (
            <button key={k} onClick={() => onUpdate({ ...nav, cardinality: k })} style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
              background: nav.cardinality === k ? CARDINALITY_META[k].color : CARDINALITY_META[k].bg,
              color: nav.cardinality === k ? "#fff" : CARDINALITY_META[k].color,
              border: `1.5px solid ${CARDINALITY_META[k].color}`,
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{k}</button>
          ))}
        </div>
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 17, lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>

      {!nav.collapsed && (
        <div style={{ padding: "10px 12px" }}>
          {nav.fields.map((f, i) => <FieldRow key={f.id} field={f} onChange={u => updateField(i, u)} onRemove={() => removeField(i)} />)}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={addField} style={{ fontSize: 11, color: m.color, background: "none", border: `1px dashed ${m.color}66`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>+ Field</button>
            <button onClick={() => setPasteOpen(true)} style={{ fontSize: 11, color: m.color, background: m.bg, border: `1px solid ${m.color}44`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>⬇ Paste Fields</button>
          </div>
        </div>
      )}

      {pasteOpen && (
        <PasteModal
          title={`Paste fields for "${nav.name}"`}
          onClose={() => setPasteOpen(false)}
          onConfirm={(text) => {
            const fields = parseFieldPaste(text, nav.fields);
            onUpdate({ ...nav, fields });
            setPasteOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RootEntityEditor({ entity, onUpdate }) {
  const [headerPasteOpen, setHeaderPasteOpen] = useState(false);
  const [navPasteOpen, setNavPasteOpen] = useState(false);
  const [addingNav, setAddingNav] = useState(false);
  const [newNavName, setNewNavName] = useState("");

  const updateField = (i, f) => { const fs = [...entity.fields]; fs[i] = f; onUpdate({ ...entity, fields: fs }); };
  const removeField = (i) => onUpdate({ ...entity, fields: entity.fields.filter((_, j) => j !== i) });
  const addField = () => onUpdate({ ...entity, fields: [...entity.fields, makeField()] });

  const updateNav = (i, u) => { const ch = [...entity.children]; ch[i] = u; onUpdate({ ...entity, children: ch }); };
  const removeNav = (i) => onUpdate({ ...entity, children: entity.children.filter((_, j) => j !== i) });

  const commitNav = (name, cardinality, fields) => {
    const nav = makeNav(name || "Navigation", cardinality);
    if (fields) nav.fields = fields;
    onUpdate({ ...entity, children: [...entity.children, nav] });
    setNewNavName("");
    setAddingNav(false);
  };

  return (
    <div style={{ border: "1.5px solid #185FA533", borderLeft: "3px solid #185FA5", borderRadius: 10, overflow: "hidden" }}>

      {/* ── Header block ── */}
      <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "#185FA508" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#185FA5", background: "#E6F1FB", padding: "2px 8px", borderRadius: 4 }}>HEADER</span>
          <input value={entity.name} onChange={e => onUpdate({ ...entity, name: e.target.value })}
            style={{ fontWeight: 700, fontSize: 14, background: "none", border: "none", color: "var(--color-text-primary)", outline: "none", flex: 1 }} />
          <button onClick={() => setHeaderPasteOpen(true)}
            style={{ fontSize: 11, color: "#185FA5", background: "#E6F1FB", border: "1px solid #185FA544", borderRadius: 5, padding: "4px 11px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600 }}>
            ⬇ Paste JSON / Fields
          </button>
        </div>

        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>Fields ({entity.fields.length})</div>
          {entity.fields.map((f, i) => <FieldRow key={f.id} field={f} onChange={u => updateField(i, u)} onRemove={() => removeField(i)} />)}
        </div>
        <button onClick={addField} style={{ fontSize: 11, color: "#185FA5", background: "none", border: "1px dashed #185FA566", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>+ Field</button>
      </div>

      {/* ── Navigation properties block ── */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0F6E56", background: "#E1F5EE", padding: "2px 8px", borderRadius: 4 }}>NAVIGATION</span>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{entity.children.length} propert{entity.children.length === 1 ? "y" : "ies"}</span>
          </div>
          {!addingNav && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setAddingNav(true)}
                style={{ fontSize: 11, color: "#0F6E56", background: "#E1F5EE", border: "1px solid #0F6E5644", borderRadius: 5, padding: "4px 11px", cursor: "pointer", fontWeight: 600 }}>
                + Add Navigation
              </button>
              <button onClick={() => setNavPasteOpen(true)}
                style={{ fontSize: 11, color: "#0F6E56", background: "none", border: "1px dashed #0F6E5666", borderRadius: 5, padding: "4px 11px", cursor: "pointer" }}>
                ⬇ Paste Nav Fields
              </button>
            </div>
          )}
        </div>

        {/* Inline add nav form */}
        {addingNav && (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "var(--color-text-primary)" }}>New Navigation Property</div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>Name</div>
              <input autoFocus value={newNavName} onChange={e => setNewNavName(e.target.value)} placeholder="e.g. Items, Address, Contacts"
                style={{ width: "100%", fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>Select Cardinality to Add</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(CARDINALITY_META).map(([k, v]) => (
                  <button key={k} onClick={() => { if (newNavName) commitNav(newNavName, k, null); }}
                    disabled={!newNavName}
                    style={{ fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8, background: v.bg, color: v.color, border: `1.5px solid ${v.color}`, cursor: newNavName ? "pointer" : "not-allowed", opacity: newNavName ? 1 : 0.45 }}>
                    {k} — {v.label}
                  </button>
                ))}
              </div>
              {!newNavName && <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 6 }}>Enter a name first</div>}
            </div>

            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Or paste fields + choose cardinality at once:</span>
              <button onClick={() => { if (newNavName) setNavPasteOpen("inline"); }}
                disabled={!newNavName}
                style={{ fontSize: 11, color: "#0F6E56", background: "#E1F5EE", border: "1px solid #0F6E5644", borderRadius: 5, padding: "4px 10px", cursor: newNavName ? "pointer" : "not-allowed", opacity: newNavName ? 1 : 0.5 }}>
                ⬇ Paste + Cardinality
              </button>
              <button onClick={() => { setAddingNav(false); setNewNavName(""); }}
                style={{ fontSize: 11, color: "var(--color-text-tertiary)", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {entity.children.map((nav, i) => (
          <NavSection key={nav.id} nav={nav} onUpdate={u => updateNav(i, u)} onRemove={() => removeNav(i)} />
        ))}

        {entity.children.length === 0 && !addingNav && (
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", padding: "18px 0", border: "1px dashed var(--color-border-tertiary)", borderRadius: 8 }}>
            No navigation properties yet — click "+ Add Navigation" to link a related entity.
          </div>
        )}
      </div>

      {/* Modals */}
      {headerPasteOpen && (
        <PasteModal title={`Paste Header Fields — "${entity.name}"`} onClose={() => setHeaderPasteOpen(false)}
          onConfirm={(text) => { onUpdate({ ...entity, fields: parseFieldPaste(text, entity.fields) }); setHeaderPasteOpen(false); }} />
      )}

      {navPasteOpen === "inline" && (
        <PasteModal title={`Paste Fields for "${newNavName}"`} showCardinality initialCardinality="1:N"
          onClose={() => { setNavPasteOpen(false); }}
          onConfirm={(text, card) => {
            const fields = parseFieldPaste(text, [makeField("Id", "Int32", "")]);
            commitNav(newNavName, card, fields);
            setNavPasteOpen(false);
          }} />
      )}

      {navPasteOpen === true && (
        <PasteModal title="Paste Navigation Fields" showCardinality initialCardinality="1:N"
          onClose={() => setNavPasteOpen(false)}
          onConfirm={(text, card) => {
            const fields = parseFieldPaste(text, [makeField("Id", "Int32", "")]);
            const name = "Navigation";
            commitNav(name, card, fields);
            setNavPasteOpen(false);
          }} />
      )}
    </div>
  );
}

function JsonPanel({ payload }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(payload, null, 2);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>JSON Output</span>
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

// ─── Main App ─────────────────────────────────────────────────────────────────

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
    const items = makeNav("Items", "1:N");
    items.fields = [makeField("ItemId", "Int32", "1"), makeField("ProductName", "String", "Widget A"), makeField("Quantity", "Int32", "2"), makeField("UnitPrice", "Decimal", "125.00")];
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

          {/* Logo */}
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
                }}>
                  {s.label}
                </button>
                {structures.length > 1 && (
                  <button onClick={() => removeStructure(s.id)} title="Remove" style={{
                    fontSize: 13, padding: "0 7px",
                    borderRadius: "0 6px 6px 0",
                    border: "0.5px solid var(--color-border-secondary)",
                    background: activeId === s.id ? "#1251894d" : "var(--color-background-secondary)",
                    color: activeId === s.id ? "#ffffffaa" : "#E24B4A",
                    cursor: "pointer", lineHeight: 1,
                  }}>×</button>
                )}
              </div>
            ))}
            <button onClick={addStructure} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1.5px dashed #185FA577", background: "none", color: "#185FA5", cursor: "pointer", flexShrink: 0, fontWeight: 600, whiteSpace: "nowrap" }}>
              + New Entity
            </button>
          </div>

          <div style={{ width: 1, height: 22, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

          {/* View tabs */}
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {[["builder", "Builder"], ["payload", "JSON Payload"]].map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: view === id ? "#E6F1FB" : "none", color: view === id ? "#185FA5" : "var(--color-text-secondary)", fontWeight: view === id ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Entity metadata bar ── */}
      <div style={{ background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "6px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {[
          ["Label", "label", 140],
          ["Entity Set", "entitySetName", 160],
          ["@odata.context", "odataContext", 260],
        ].map(([title, key, w]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>{title}</span>
            <input value={active[key]} onChange={e => updateActive({ ...active, [key]: e.target.value })}
              placeholder={key === "odataContext" ? `$metadata#${active.entitySetName}` : ""}
              style={{ fontSize: 12, padding: "3px 8px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: w }} />
          </div>
        ))}
      </div>

      {/* ── Main content ── */}
      <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
        {view === "builder" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, alignItems: "start" }}>
            <div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{active.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  Use "Paste JSON / Fields" to bulk-add fields. Add navigation properties for related entities and set cardinality inline.
                </div>
              </div>
              <RootEntityEditor entity={active.root} onUpdate={root => updateActive({ ...active, root })} />
            </div>

            <div style={{ position: "sticky", top: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Live Preview</div>
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden", maxHeight: 600, display: "flex", flexDirection: "column" }}>
                <JsonPanel payload={payload} />
              </div>
            </div>
          </div>
        )}

        {view === "payload" && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{active.label} — JSON Payload</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>Ready-to-use OData JSON payload</div>
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