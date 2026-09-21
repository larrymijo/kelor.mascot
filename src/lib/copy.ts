/**
 * Site copy (Spanish). Kept in one place so a future translation or copy
 * review touches a single file.
 */
export const copy = {
  meta: {
    title: 'KELOR Interactive',
    description:
      'Estudio de software en Ecuador. Muy pronto, una experiencia 3D con nuestra nueva mascota.',
  },
  hero: {
    eyebrow: 'Próximamente',
    title: 'Algo está por eclosionar.',
    body: 'Estamos preparando una experiencia 3D protagonizada por la nueva mascota del estudio.',
    /** Accessible description of the decorative 3D scene. */
    sceneLabel:
      'Escena 3D: un huevo hexagonal con los colores del logo de KELOR se agrieta y de él nace un pequeño dinosaurio morado.',
    cta: {
      label: 'Conoce KELOR Interactive',
      // Current studio site; switch to the final domain once it exists.
      href: 'https://kelor-interactive.vercel.app',
    },
  },
  footer: {
    owner: 'KELOR Interactive',
  },
} as const
