# Changelog

All notable changes to AFL Time Punch are documented here.

---

## [Unreleased]
- `4a37995` chore: update package-lock.json after client dependency install _(2026-04-02)_

## [1.0.0] — 2026-04-13

### Added
- Electron desktop app packaging — runs as a native Windows app, no browser required
- Windows installer (`AFL Time Punch Setup 1.0.0.exe`) via electron-builder
- SQLite data stored at `%APPDATA%\AFL Time Punch\timepunch.db` (survives updates)
- Excel export downloads saved to system Downloads folder via native dialog

### Changed
- Vite build now uses relative asset paths (`base: './'`) for Electron compatibility
- Express server serves built React client as static files in production

---

## [0.1.0] — 2026-04-02

### Added
- Complete React client with live timer, clock in/out, pause/resume with comments
- Weekly calendar view with daily session breakdown
- Pay calculation based on configurable hourly rate
- Excel (XLSX) export of weekly time data
- Express REST API: sessions, settings, export endpoints
- SQLite database with auto-migration via better-sqlite3
- Server integration tests (sessions and settings routes)

### Fixed
- Server route guards, DB reset safety, and export edge cases

---

[Unreleased]: https://github.com/Zysphoria/afl-time-punch/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Zysphoria/afl-time-punch/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Zysphoria/afl-time-punch/releases/tag/v0.1.0
