# MÄDN Online Multiplayer (Mensch, ärgere dich nicht)

Minimalistisches Online-**Mensch, ärgere dich nicht** komplett in React & TypeScript (schwarzer Hintergrund, ruhige Typografie, dezente Spielerfarben für Rot, Blau, Gelb und Grün) — für **2, 3 oder 4 Spieler**, **komplett ohne externen Spielserver**.

Der Spieler, der einen Room erstellt (**Host**), ist direkt im Browser der autoritative Spielserver. Andere Spieler verbinden sich per **WebRTC DataChannel (PeerJS)** über den Room-Code oder Invite-Link. Alternativ können jederzeit bis zu 3 Bots hinzugefügt werden.

## Features
- **2 bis 4 Spieler** (bei 2 Spielern diagonal gegenüber, bei 3 oder 4 Spielern reihum)
- **Klassische Regeln**:
  - 3× würfeln, solange keine Figur auf der Laufbahn ist
  - Bei einer **6**: Figur aus dem Haus holen + zusätzlicher Wurf
  - Startfeld freimachen, wenn noch eigene Figuren im Haus warten
  - Gegnerische Figuren durch direktes Landen rauswerfen
  - Im Zielhaus darf nicht über eigene Figuren gesprungen werden
- **P2P-Lobby mit Bots, Reconnect & Rematch**

## GitHub Pages Deployment (`.github/workflows/deploy.yml`)

1. Repo auf GitHub pushen (`main` oder `master`).
2. In GitHub unter **Settings → Pages** als *Source* **GitHub Actions** wählen.
3. `.github/workflows/deploy.yml` testet, baut (`VITE_BASE_PATH` automatisch gesetzt) und deployt die statische App direkt auf GitHub Pages.

## Lokal starten

```bash
npm install
npm run dev
```

Öffne `http://localhost:5175`.

## Tests & Typecheck

```bash
npm test
npm run typecheck
npm run build
```
