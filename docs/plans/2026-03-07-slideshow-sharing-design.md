# Diashow-Sharing mit Musik — Design

## Ziel
Nutzer kann eine Foto-Diashow mit Hintergrundmusik als teilbaren Web-Link exportieren. Empfaenger (auch ohne Account) sehen eine Fullscreen-Diashow mit Musik.

## Architektur

### Zwei Komponenten
1. **SlideshowShareModal** (in-app) — Konfiguration + Link-Generierung
2. **Oeffentliche Diashow-Seite** (`/slideshow/:token`) — Fullscreen-Player, kein Auth

### Neuer DB-Table: `slideshow_shares`
```
id           uuid PK
trip_id      FK -> trips
created_by   FK -> profiles
token        text UNIQUE INDEX
music_track  text ('relaxed' | 'adventure' | 'romantic' | 'festive')
interval_ms  int (3000 | 4000 | 6000)
photo_ids    jsonb (array of photo IDs in Reihenfolge)
trip_name    text
expires_at   timestamptz (created_at + 30 Tage)
created_at   timestamptz
```

RLS: Insert/Select fuer authentifizierte Trip-Mitglieder. Oeffentlicher Zugriff ueber Edge Function.

### Musik
- 4 royalty-free MP3-Tracks (~2-3 MB je) in Supabase Storage Bucket `music` (public)
- Stimmungen: relaxed, adventure, romantic, festive
- In-App Preview: `expo-av` (Audio.Sound)
- Oeffentliche Seite: HTML5 `<audio>` mit loop

### State-Unterscheidung Export-Button
```
Slideshow aktiv  -> Share-Button -> SlideshowShareModal (Link erstellen)
Slideshow NICHT aktiv -> Share-Button -> handleSingleExport (Foto teilen)
```

## In-App Flow
1. Nutzer startet Diashow
2. Share-Button oeffnet SlideshowShareModal:
   - Musik-Auswahl (4 Karten mit Play-Preview)
   - Geschwindigkeit (3s / 4s / 6s Segmented Control)
   - Info: "X Fotos werden geteilt"
3. "Link erstellen" -> Insert in slideshow_shares, Token generieren
4. Link anzeigen (wayfable.ch/slideshow/:token) + Copy + Native Share

## Oeffentliche Seite
- Minimaler Fullscreen-Player, schwarzer Hintergrund
- Fade-Uebergaenge zwischen Fotos
- Musik autoplay (mit User-Interaction-Gate wegen Browser-Policy)
- Progress-Bar oben
- Kleines WayFable-Logo unten-links
- Am Ende: CTA-Screen "Plane deine eigene Reise mit WayFable" + Link
- Play/Pause, Mute-Button
- Edge Function `get-slideshow` laedt Config + signierte Foto-URLs
- Prueft expires_at, 404 wenn abgelaufen

## Neue Dependencies
- `expo-av` — Audio-Playback

## Link-Gueltigkiet
- 30 Tage ab Erstellung
