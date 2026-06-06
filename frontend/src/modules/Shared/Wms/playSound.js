/**
 * WebAudio feedback for scan events.
 * Call initAudio() once on first user interaction (click/keydown).
 * Ported from legacy vanilla WMS shared rules::playSound / initAudio
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
 * @param {'success' | 'error' | 'warning' | 'ok'} type
 */
export function playSound(type) {
  if (!audioContext) return
  try {
    const osc = audioContext.createOscillator()
    const gain = audioContext.createGain()
    osc.connect(gain)
    gain.connect(audioContext.destination)
    gain.gain.setValueAtTime(0.3, audioContext.currentTime)

    if (type === 'success' || type === 'ok') {
      osc.frequency.setValueAtTime(880, audioContext.currentTime)
      osc.start()
      osc.stop(audioContext.currentTime + 0.15)
    } else if (type === 'error') {
      osc.frequency.setValueAtTime(300, audioContext.currentTime)
      osc.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3)
      osc.start()
      osc.stop(audioContext.currentTime + 0.35)
    } else if (type === 'warning') {
      osc.frequency.setValueAtTime(600, audioContext.currentTime)
      osc.start()
      osc.stop(audioContext.currentTime + 0.1)
    }
  } catch {
    // Ignore audio errors
  }
}
