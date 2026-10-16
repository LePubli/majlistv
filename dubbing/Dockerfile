# Service de doublage Mejliss TV (étape D1a) : Piper (voix de base) + ChatterboxVC (conversion vers une voix autorisée), processeur seul.
# Contexte de build : RACINE du dépôt (comme le transcripteur). DockPanel → Git Deploy → Dockerfile : dubbing/Dockerfile.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 espeak-ng \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY dubbing/requirements.txt .
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY dubbing/src ./src
RUN useradd -m app && mkdir /models /work && chown app /models /work
USER app
ENV PYTHONUNBUFFERED=1 HF_HOME=/models MODELS_DIR=/models WORK_DIR=/work
EXPOSE 3000
CMD ["python", "src/main.py"]
