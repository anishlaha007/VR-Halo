# Bundled third-party files

Stored here so the whole demo, sound recognition included, works without internet.

| File | What | Source | License |
|---|---|---|---|
| `three.module.min.js` | three.js, for the AR modes | https://threejs.org | MIT |
| `mediapipe/audio_bundle.mjs`, `mediapipe/wasm/*` | MediaPipe Tasks Audio 0.10.21, which runs the sound model in the browser | npm `@mediapipe/tasks-audio@0.10.21` (https://github.com/google-ai-edge/mediapipe) | Apache 2.0 |
| `models/yamnet.tflite` | YAMNet, Google's 521-class sound classifier (float32) | https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite (https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) | Apache 2.0 |

The model and runtime version match the Synesthesia Android app (github.com/RishabhK12/synesthesia,
`audio_classification` branch), whose listener `listen.js` ports. `yamnet.tflite` has the same SHA-256 as
that app's `models.lock.json`.

SHA-256:

```
4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf  models/yamnet.tflite
ea4cc2b0f41e915901e1a904eb99d79b3e238c19b3f9fb43e94e7f1586260f1c  mediapipe/audio_bundle.mjs
9f8d59a241abaa0d3b69dad5a094b843e9f0fdf6d2b7349d3d40541e9679725e  mediapipe/wasm/audio_wasm_internal.js
a57c300fa8fe6756396c1718ddbe4d134e1361e973087ce192bcdab3eea528d1  mediapipe/wasm/audio_wasm_internal.wasm
b9cd5366d4b460d58f151b02ce0ec5784e13130ffb67396cbb532a52ad14c966  mediapipe/wasm/audio_wasm_nosimd_internal.js
cdd5c603a5225d85dbb30944fa1e66c46a76790ec246682c4f3d88c571b5a3a6  mediapipe/wasm/audio_wasm_nosimd_internal.wasm
```

The `nosimd` pair is only loaded by browsers without WebAssembly SIMD (for example iOS before 16.4).
