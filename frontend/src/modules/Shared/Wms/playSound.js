/**
 * WebAudio feedback for scan events — single shared implementation for all modules.
 * Call initAudio() once on first user interaction (click/keydown).
 */

let audioContext = null

export function initAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume()
    return
  }
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
    const t = audioContext.currentTime
    const tone = ({
      start = 0,
      duration = 0.1,
      frequency = 440,
      endFrequency = null,
      wave = 'sine',
      volume = 0.22,
      attack = 0.008,
      release = 0.035,
    } = {}) => {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const at = t + start
      const end = at + duration
      osc.type = wave
      osc.frequency.setValueAtTime(frequency, at)
      if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, Math.max(at + 0.01, end - release))
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(volume, at + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.start(at)
      osc.stop(end + 0.02)
    }

    if (type === 'success' || type === 'ok') {
      // Single clean high beep — industrial scanner confirmation (1760 Hz = A6).
      tone({ start: 0, duration: 0.085, frequency: 1760, wave: 'sine', volume: 0.21, attack: 0.002, release: 0.018 })

    } else if (type === 'error' || type === 'reject') {
      // Two descending clear tones — unmistakeable rejection, no buzzer harshness.
      tone({ start: 0,    duration: 0.10, frequency: 440, wave: 'sine', volume: 0.26, attack: 0.002, release: 0.02 })
      tone({ start: 0.14, duration: 0.13, frequency: 277, wave: 'sine', volume: 0.27, attack: 0.002, release: 0.025 })

    } else if (type === 'duplicate') {
      // Two identical mid-pitch chirps — "already scanned this", clearly different from error.
      tone({ start: 0,    duration: 0.055, frequency: 1047, wave: 'sine', volume: 0.19, attack: 0.002, release: 0.015 })
      tone({ start: 0.09, duration: 0.055, frequency: 1047, wave: 'sine', volume: 0.19, attack: 0.002, release: 0.015 })

    } else if (type === 'warning') {
      // Single mid-tone — neutral advisory, less urgent than error.
      tone({ start: 0, duration: 0.09, frequency: 660, wave: 'sine', volume: 0.19, attack: 0.002, release: 0.02 })

    } else if (type === 'complete') {
      // Three ascending tones — "all done" celebration (do–mi–sol).
      tone({ start: 0,    duration: 0.09, frequency: 880,  wave: 'sine', volume: 0.17, attack: 0.002, release: 0.018 })
      tone({ start: 0.11, duration: 0.09, frequency: 1100, wave: 'sine', volume: 0.18, attack: 0.002, release: 0.018 })
      tone({ start: 0.22, duration: 0.13, frequency: 1320, wave: 'sine', volume: 0.19, attack: 0.002, release: 0.025 })

    } else if (type === 'peso') {
      // Two ascending notes — "weight confirmed".
      tone({ start: 0,    duration: 0.075, frequency: 660, wave: 'sine', volume: 0.15, attack: 0.002, release: 0.018 })
      tone({ start: 0.10, duration: 0.085, frequency: 880, wave: 'sine', volume: 0.16, attack: 0.002, release: 0.018 })

    } else if (type === 'suspicious') {
      // Three rapid mid beeps — "check this code" advisory.
      tone({ start: 0,    duration: 0.06, frequency: 740, wave: 'sine', volume: 0.15, attack: 0.002, release: 0.015 })
      tone({ start: 0.09, duration: 0.06, frequency: 740, wave: 'sine', volume: 0.15, attack: 0.002, release: 0.015 })
      tone({ start: 0.18, duration: 0.06, frequency: 740, wave: 'sine', volume: 0.15, attack: 0.002, release: 0.015 })
    }
  } catch {
    // Ignore audio errors
  }
}
