"""Create the original local alarm recording; no external sound dependency."""
import math
import struct
import wave
from pathlib import Path

rate = 44100
duration = 1.8
tones = [(0.04, 0.20, 880), (0.28, 0.20, 660), (0.52, 0.30, 880)]
samples = []
for n in range(round(rate * duration)):
    t = n / rate
    sample = 0.0
    for start, length, frequency in tones:
        elapsed = t - start
        if 0 <= elapsed < length:
            envelope = min(1, elapsed / 0.015, (length - elapsed) / 0.03)
            sample += 0.42 * envelope * (math.sin(2 * math.pi * frequency * elapsed) + 0.16 * math.sin(4 * math.pi * frequency * elapsed))
    samples.append(struct.pack('<h', round(max(-1, min(1, sample)) * 32767)))
target = Path(__file__).resolve().parent.parent / 'dist' / 'sounds' / 'alarm.wav'
target.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(target), 'wb') as recording:
    recording.setnchannels(1)
    recording.setsampwidth(2)
    recording.setframerate(rate)
    recording.writeframes(b''.join(samples))
print(f'Created {target.name}: {duration}s, {rate} Hz')
