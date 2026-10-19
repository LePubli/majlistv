# Doublage, étape D3a : banc d'essai Qwen3-TTS (clonage direct d'un échantillon de voix), processeur seul.
# Image séparée de l'étape 0 : qwen-tts exige transformers 4.57, incompatible avec chatterbox-tts 0.1.7.
# Contexte de build : le dossier dubbing/ du dépôt →  docker build -t majlis-dub-d3 -f src/dubbing/d3bench/Dockerfile src/dubbing
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 sox \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY d3bench/requirements.txt .
# PyTorch version processeur (sans CUDA) : beaucoup plus léger
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY etape0/bench.py etape0/test_pipeline.py d3bench/compare.py d3bench/test_d3.py ./
ENV PYTHONUNBUFFERED=1 HF_HOME=/models
VOLUME ["/models"]
ENTRYPOINT ["python", "bench.py"]
