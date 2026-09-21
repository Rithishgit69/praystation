"""Render narration lines with Kokoro-82M (Apache-2.0 model; its output may be used freely).

usage: uv run --python 3.12 --with kokoro --with soundfile --with numpy tools/kokoro_tts.py <jobs.json>
jobs.json: [{"file": "/abs/path/out.wav", "text": "...", "voice": "af_heart", "speed": 0.92}, ...]
Writes 24 kHz mono WAV files; the Node tool converts them to MP3.
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

jobs = json.load(open(sys.argv[1]))
pipes = {}
for job in jobs:
    lang = job.get("lang", "a")  # 'a' American English, 'b' British English
    pipe = pipes.get(lang)
    if pipe is None:
        pipe = pipes[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    chunks = [audio for _, _, audio in pipe(job["text"], voice=job["voice"], speed=job.get("speed", 1.0))]
    audio = np.concatenate(chunks) if chunks else np.zeros(2400, dtype=np.float32)
    # A short tail of silence so the clip never ends on a hard cut.
    audio = np.concatenate([audio, np.zeros(int(24000 * 0.25), dtype=audio.dtype)])
    sf.write(job["file"], audio, 24000)
    print(job["file"], round(len(audio) / 24000, 2), flush=True)
