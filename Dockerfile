# Dockerfile
# Verwende ein offizielles Python-Runtime-Image als Basis
FROM python:3.10-slim-buster

# Lege das Arbeitsverzeichnis im Container fest
WORKDIR /app

# Upgrade pip to the latest version
RUN pip install --no-cache-dir --upgrade pip

# Kopiere die requirements.txt ins Arbeitsverzeichnis
COPY requirements.txt .

# Installiere die Python-Abhängigkeiten
RUN pip install --no-cache-dir -r requirements.txt

# Kopiere die main.py und den gesamten statischen Ordner
COPY main.py /app
COPY static/ /app/static/

# Exponiere den Port, auf dem Uvicorn läuft
EXPOSE 8000

# Definiere den Befehl zum Starten der FastAPI-Anwendung mit Uvicorn
# --host 0.0.0.0 ist wichtig, damit die Anwendung von außen erreichbar ist
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

