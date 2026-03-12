# Changelog

All notable changes to Teter are documented here.

---

## [1.0.0] - 2026-03-12

### Added
- Multi-file code editor with folder tree sidebar
- Convex backend for snippet storage (create, read, update, delete)
- REST API routes for snippet CRUD operations
- Short ID generation for shareable snippet URLs
- Drag and drop support for reorganizing files and folders
- Tab-based file navigation in the editor
- Auto-save on existing snippets (1s debounce)
- One-click copy code and share link buttons
- Edit/View mode toggle on saved snippets
- SVG favicon with maroon "T" branding
- Vercel Analytics and Speed Insights integration
- Responsive layout with mobile breakpoint

### Changed
- Rebuilt UI from Windows 95/98 retro theme to clean Material Design
- Adopted tan brown and maroon color palette
- Replaced 98.css with custom design system (elevation, rounded corners, transitions)
- Switched typography from VT323 monospace to Inter (UI) and JetBrains Mono (code)
- Replaced emoji icons with Lucide React icon set
- File names no longer forced to uppercase

### Fixed
- Files/folders vanishing after creation due to auto-save triggering redirect on home page
- URL changing on every re-save by persisting snippet ID in component state
- Subsequent saves now PATCH the same snippet instead of creating new ones
- URL updates via `history.replaceState` instead of full navigation after first save

---

## [0.1.0] - Initial

- Scaffolded Next.js 16 project via `create-next-app`
