# BNIW CRM

Kleines CRM zum Abarbeiten der BNIW-Verwaltungskontakte – als installierbare Web-App (PWA).

**App öffnen:** https://marialuxoxo.github.io/marias-crm-/

## Was es kann
- **Abarbeiten** – wie bisher: Kontakt für Kontakt durchgehen, Status setzen, Broschüre, Warteliste, Notizen. Neu: Wiedervorlage-Datum, Ansprechpartner pro Firma, Aktivitäten (Anruf / Notiz / E-Mail / Meeting) mit Verlauf.
- **Kontakte** – Tabelle aller Firmen, sortierbar, filterbar, Volltextsuche (auch in Notizen und Ansprechpartnern), Firmen anlegen/bearbeiten.
- **Mein Tag** – was an einem Tag passiert ist: Kennzahlen, Verlauf (zeitlich oder nach Firma), 14-Tage-Diagramm, fällige Wiedervorlagen, Tagesbericht zum Kopieren.
- **Globale Suche** oben (Strg+K oder `/`) – findet Firmen, Personen, Telefonnummern und Notizen.

## Datenschutz
Kontaktliste und Notizen liegen **nur lokal im Browser** (localStorage) – nicht in diesem Repo und nicht auf einem Server.
Deshalb regelmäßig unter **Daten → Sicherung herunterladen** exportieren.

## Erster Start
1. Alte Datei `BNIW_Verwaltungskontakte….html` in der App auswählen → Kontaktliste wird übernommen.
2. In der alten Datei auf **⭳ Export** klicken und die JSON-Datei in der App importieren → Status & Notizen.

## Als App installieren (Windows)
In Edge oder Chrome die App-Adresse öffnen → Symbol „App installieren“ in der Adressleiste (oder Button „⤓ Als App installieren“ oben rechts).

## Veröffentlichen
GitHub Pages veröffentlicht direkt aus dem Branch `claude/marias-crm-webapp-k4aoor`, Ordner `/ (root)`
(*Settings → Pages → Deploy from a branch*). Jeder Push dorthin ist nach 1–2 Minuten online. Bei Änderungen an der App `VERSION` in `sw.js` hochzählen.
