# Service de transcription Whisper (faster-whisper, CPU) + vidéos YouTube/Vimeo (yt-dlp, Deno). Contexte de build : racine du dépôt.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY transcriber/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && chmod +x /usr/local/bin/deno && deno --version  # le paquet pip de Deno n'est pas exécutable par défaut
COPY transcriber/src ./src
COPY transcriber/models ./models
RUN useradd -m app && mkdir /models /work && chown app /models /work
USER app
ENV PYTHONUNBUFFERED=1 HF_HOME=/models MODELS_DIR=/models WORK_DIR=/work PATH=/home/app/.local/bin:$PATH
EXPOSE 3000
CMD ["python", "src/main.py"]
