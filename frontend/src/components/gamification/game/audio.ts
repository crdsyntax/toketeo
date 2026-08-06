let audioCtx: AudioContext | null = null

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.06, slide = 0) {
  try {
    audioCtx ??= new AudioContext()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.type = type
    o.frequency.value = freq
    if (slide !== 0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + dur)
    }
    g.gain.setValueAtTime(vol, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur)
    o.connect(g)
    g.connect(audioCtx.destination)
    o.start()
    o.stop(audioCtx.currentTime + dur)
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  jump: () => tone(300, 0.12, 'square', 0.045, 300),
  slash: () => tone(190, 0.08, 'sawtooth', 0.035, -120),
  cast: () => tone(280, 0.14, 'triangle', 0.05, 180),
  hitEnemy: () => tone(520, 0.12, 'triangle', 0.05, -200),
  kill: () => tone(420, 0.18, 'triangle', 0.06, -360),
  hurt: () => tone(75, 0.25, 'sawtooth', 0.07, -30),
  switchWeapon: () => tone(360, 0.06, 'square', 0.03, 80),
  win: () => [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.055), i * 120)),
  lose: () => [220, 174, 130].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sawtooth', 0.055), i * 150)),
}
