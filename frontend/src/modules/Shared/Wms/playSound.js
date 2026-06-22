/**
 * WebAudio feedback for scan events — single shared implementation for all modules.
 * Call initAudio() once on first user interaction (click/keydown).
 */

let audioContext = null

export function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    document.addEventListener('click', () => {
      if (audioContext?.state === 'suspended') audioContext.resume()
    }, { once: true })
  } catch {
    // Audio not supported — silent fallback
  }
}

/**
 * @param {'success'|'ok'|'error'|'warning'|'reject'|'duplicate'|'complete'|'peso'|'suspicious'} type
 */
export function playSound(type) {
  if (!audioContext) return
  try {
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.connect(gain)
    gain.connect(audioContext.destination)
    const t = audioContext.currentTime

    if (type === 'success' || type === 'ok') {
      gain.gain.setValueAtTime(0.3, t)
      osc.frequency.setValueAtTime(880, t)
      osc.start(); osc.stop(t + 0.15)

    } else if (type === 'error') {
      gain.gain.setValueAtTime(0.3, t)
      osc.frequency.setValueAtTime(300, t)
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.3)
      osc.start(); osc.stop(t + 0.35)

    } else if (type === 'warning') {
      gain.gain.setValueAtTime(0.3, t)
      osc.frequency.setValueAtTime(600, t)
      osc.start(); osc.stop(t + 0.1)

    } else if (type === 'reject') {
      osc.type = 'sawtooth'
      gain.gain.setValueAtTime(0.45, t)
      osc.frequency.setValueAtTime(240, t)
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.45)
      osc.start(); osc.stop(t + 0.45)

    } else if (type === 'duplicate') {
      // 330 Hz sawtooth brief pulse — distinct from warning, used for barcode duplicates
      osc.type = 'sawtooth'
      gain.gain.setValueAtTime(0.2, t)
      osc.frequency.setValueAtTime(330, t)
      osc.start(); osc.stop(t + 0.25)

    } else if (type === 'complete') {
      // Ascending two-tone — "tarima completa" celebration
      gain.gain.setValueAtTime(0.15, t)
      osc.frequency.setValueAtTime(1200, t)
      osc.frequency.setValueAtTime(1500, t + 0.1)
      osc.start(); osc.stop(t + 0.25)

    } else if (type === 'peso') {
      // Two ascending notes — "peso confirmado"
      gain.gain.setValueAtTime(0.15, t)
      osc.frequency.setValueAtTime(660, t)
      osc.frequency.setValueAtTime(880, t + 0.09)
      osc.start(); osc.stop(t + 0.18)

    } else if (type === 'suspicious') {
      // Double-beep sawtooth — "código sospechoso, verificar"
      osc.type = 'sawtooth'
      gain.gain.setValueAtTime(0, t)
      gain.gain.setValueAtTime(0.12, t + 0.01)
      gain.gain.setValueAtTime(0, t + 0.16)
      gain.gain.setValueAtTime(0.12, t + 0.26)
      gain.gain.setValueAtTime(0, t + 0.42)
      osc.frequency.setValueAtTime(440, t)
      osc.start(t); osc.stop(t + 0.45)
    }
  } catch {
    // Ignore audio errors
  }
}
