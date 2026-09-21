/**
 * Browser-only reader of the device signals used by detectQualityTier.
 * Creates a throwaway WebGL 2 context to read the renderer string, then
 * releases it immediately.
 */
import type { DeviceSignals } from '@/lib/quality/detect'

interface NavigatorExtras {
  deviceMemory?: number
  connection?: { saveData?: boolean }
  userAgentData?: { mobile?: boolean }
}

export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & NavigatorExtras
  let renderer: string | null = null
  let webgl2 = false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
    if (gl) {
      webgl2 = true
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    webgl2 = false
  }

  const iPadOs = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1
  const isMobile =
    nav.userAgentData?.mobile ?? (iPadOs || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent))

  return {
    webgl2,
    renderer,
    isMobile,
    hardwareConcurrency: nav.hardwareConcurrency || undefined,
    deviceMemoryGB: nav.deviceMemory,
    saveData: nav.connection?.saveData ?? false,
  }
}
