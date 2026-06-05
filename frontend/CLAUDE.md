# Kirion Frontend — Project Rules

## Design Homogeneity (CRITICAL — permanent rule)

Every table header, modal header, and page header across ALL modules must use the same
shared CSS class / pattern. Never use inline one-off styles for structural UI elements.

### Table headers
- Always use `<th className="table-header">` (defined in `src/index.css`)
- Never replace with inline `font-bold text-warm-500 px-3 py-2.5` or similar
- `thead` must always carry `bg-warm-50 sticky top-0 z-[5] border-b border-warm-100`

### Modal OBC / identifier line
- OBC + status badge always on the same row (`flex items-center gap-2`)
- Font size: `text-base` inside modals, `text-xl` only in full-size modal header titles
- Status badge: `badge text-[11px] font-semibold` + the status colour class

### Column cell data types
- Customer codes / names → `text-xs text-warm-700 font-medium` (NOT `code-main`)
- Tracking numbers / box codes → `font-mono text-xs text-warm-600`
- Primary identifiers (OBC, tarima code) → `font-mono font-semibold text-primary-700`

### Module consistency
Before adding any table or modal to a module, verify it matches the pattern in
`src/modules/dropscan/pages/Tarimas.jsx` (reference implementation) and
`src/modules/dropscan/pages/Configuracion.jsx` (tab bar reference).
