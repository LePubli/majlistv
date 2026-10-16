# Étape 0 doublage : banc d'essai Chatterbox (CPU). Contexte de build : ce dossier (dubbing/etape0).
# Python 3.11 : Chatterbox exige numpy<2 et Python<3.13.
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 espeak-ng \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
# PyTorch version processeur (sans CUDA) : beaucoup plus léger
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY bench.py test_pipeline.py ./
ENV PYTHONUNBUFFERED=1 HF_HOME=/models
VOLUME ["/models"]
ENTRYPOINT ["python", "bench.py"]
