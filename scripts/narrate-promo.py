"""
Genera la narración del video promocional (public/promo/narracion.mp3) con Kokoro, una voz
neuronal que corre local y sin claves. Cada línea arranca al comienzo de su escena.

Uso:
  pip install kokoro-onnx soundfile
  # Descargar kokoro-v1.0.onnx y voices-v1.0.bin de
  # https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  python scripts/narrate-promo.py <carpeta-con-los-modelos>
Requiere ffmpeg. Si cambias la duración de las escenas en features/promo/promo-video.tsx,
actualiza SCENE_MS aquí.
"""
import subprocess, sys, tempfile, os
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

VOICE = "ef_dora"
SCENE_MS = [4800, 6800, 7600, 9200, 6800, 8600, 8000, 6000]
LINES = [
    "Esto es RAX. Tu idea, en orden. Tus dudas, en pruebas.",
    "Primero, crea tu proyecto y cuéntale tu idea con tus propias palabras.",
    "Tu proyecto avanza en cuatro etapas: entender, orientar, probar y decidir. Siempre sabes qué sigue.",
    "El asistente de inteligencia artificial te hace una pregunta a la vez, y separa lo que sabes de lo que supones.",
    "Un mentor revisa tu proyecto desde su bandeja y agenda una sesión contigo.",
    "Hablan por videollamada dentro de RAX, y la conversación se transcribe sola.",
    "Después, la IA resume la sesión en acuerdos, experimentos y tareas, y el asistente las usa para guiarte.",
    "Entiende tu idea, prueba en pequeño y decide con evidencia. Crea tu cuenta en RAX.",
]
LEAD_MS = 550  # espera el fundido entre escenas

models = sys.argv[1] if len(sys.argv) > 1 else "."
out_mp3 = os.path.join(os.path.dirname(__file__), "..", "public", "promo", "narracion.mp3")
k = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))

sr = 24000
total = sum(SCENE_MS) + 600
track = np.zeros(int(total / 1000 * sr), dtype=np.float32)
start = 0
for ms, text in zip(SCENE_MS, LINES):
    samples, sr = k.create(text, voice=VOICE, speed=1.0, lang="es")
    if len(samples) / sr > (ms - 700) / 1000:
        print(f"Aviso: la línea no entra en su escena: {text!r}")
    a = int((start + LEAD_MS) / 1000 * sr)
    track[a : a + len(samples)] += samples[: len(track) - a]
    start += ms

with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, "n.wav")
    sf.write(wav, track, sr)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "128k", out_mp3], check=True)
print("Listo:", out_mp3)
