# MuCodo (Multiple Countdown)
A multiple count-down app that runs in a browser but does not need the internet and allows to count the time for multiple participants.

./
├── main.py             # FastAPI-Anwendung
├── requirements.txt    # Python-Abhängigkeiten
├── Dockerfile          # Docker-Build-Anweisungen
├── docker-compose.yml  # Docker Compose Konfiguration
├── static/             # Ordner für statische Dateien
│   ├── index.html
│   ├── admin.html
│   ├── style.css
│   ├── script.js
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── config.json



Funktionsweise:

Offline-Fähigkeit: Nach dem ersten Laden sollte die Anwendung dank des Service Workers auch ohne Internetverbindung funktionieren. Wenn Sie Änderungen an den Anwendungsdateien vornehmen, müssen Sie den Service Worker aktualisieren (oft reicht ein Neuladen der Seite im Browser oder ein "Hard Refresh" (Strg+Shift+R / Cmd+Shift+R) oder das Leeren des Caches über die Entwicklertools).

- Countdown-Seite: Zeigt die verbleibende Zeit groß an und den Fortschrittsbalken im Footer. Die Zeit wird aus dem localStorage gelesen.
- Admin-Seite:
- Ermöglicht die manuelle Eingabe von Minuten und Sekunden für die Gesamtzeit.
- Pfeiltasten ermöglichen das schnelle Anpassen der Zeit.
- "Vordefinierte Zeiten" aus config.json können ausgewählt werden, um total_time und remaining_time zu setzen. Hier gibt es auch die Option "Neutral".
- "Restzeit" zeigt die aktuelle remaining_time an.
- "Änderungszeiten" aus config.json erlauben das Hinzufügen oder Abziehen von Zeit von der aktuellen Gesamtzeit und Restzeit.

Der Play/Pause-Button steuert den Countdown. Wenn er läuft, wird elapsed_ und total_ Zeit für den ausgewählten Namen im localStorage gespeichert. Wenn der Name geändert wird, wird die elapsed_ Zeit zum total_ für den alten Namen addiert (dieser Teil ist im bereitgestellten Code saveElapsedTime implementiert, jedoch die Aggregation zu total_ beim Namenwechsel ist eine fortgeschrittene Logik, die Sie bei Bedarf hinzufügen müssten).

_localStorage_: remaining_time und total_time werden kontinuierlich aktualisiert. Die elapsed_ und total_ Zeiten werden projektbezogen gespeichert.