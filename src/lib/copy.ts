/**
 * Site copy (Spanish). Kept in one place so a future translation or copy
 * review touches a single file. The page is deliberately almost wordless:
 * a dark stage where the visitor drops an egg and Kelo hatches
 * (docs/interaction-script.md).
 */
export const copy = {
  meta: {
    title: 'KELOR Interactive · Conoce a Kelo',
    description:
      'Kelo, la mascota 3D de KELOR Interactive: suelta el huevo y míralo nacer, vivo en tu navegador. Así construimos webs interactivas a medida en Ecuador.',
  },
  brand: 'KELOR Interactive',
  /** The studio's site; switch to the final domain once it exists. */
  studioHref: 'https://kelor-interactive.vercel.app',
  hero: {
    /** Accessible description of the 3D scene. */
    sceneLabel:
      'Escena 3D interactiva sobre un fondo oscuro: sueltas un huevo de dinosaurio y de él nace Kelo, un pequeño dinosaurio morado que te sigue con la mirada. Puedes tocarlo; con el ratón también puedes arrastrarlo, girar la cámara y darle órdenes con los controles.',
  },
  /** The first thing on the stage: drop the egg. */
  drop: {
    label: 'Soltar el huevo',
    pointer: 'Haz clic para soltar el huevo',
    touch: 'Toca para soltar el huevo',
  },
  /** What you can do with Kelo, shown until you first touch him. */
  hint: {
    pointer: 'Arrastra · Gira · Acerca',
    touch: 'Tócalo',
  },
  /** The keyboard's way to him: a button over him. */
  kelo: {
    label: 'Tocar a Kelo',
    keys: 'Intro o Espacio para tocarlo; las flechas lo hacen saltar.',
  },
  meet: {
    title: 'Conoce a Kelo',
    line: 'la mascota de KELOR Interactive',
  },
  cta: {
    nav: 'Hablemos',
  },
  contact: {
    question: '¿Quieres una web a medida?',
    // The studio's contact page; switch to the final domain once it exists.
    href: 'https://kelor-interactive.vercel.app/contacto',
  },
  /** The desktop sandbox's dock: icons, named here for tooltips and screen readers. */
  showcase: {
    dock: {
      label: 'Controles de Kelo',
      actions: { wave: 'Saludar', jump: 'Saltar', roar: 'Rugir', look: 'Mirar', bite: 'Morder' },
      light: 'Luz',
      lights: { studio: 'Estudio', sunset: 'Atardecer', neon: 'Neón' },
      view: { spin: 'Giro 360°', xray: 'Rayos X', reset: 'Centrar' },
      game: 'Jugar a Kelo Run',
      size: 'Tamaño de Kelo',
      pixel: 'pixel art',
    },
  },
  /** The pixel runner, after the ninth tap on a phone. */
  game: {
    label: 'Minijuego: Kelo esquiva bichos',
    title: 'KELO RUN',
    start: { pointer: 'Pulsa Espacio para empezar', touch: 'Toca para empezar' },
    over: 'Fin del juego',
    again: { pointer: 'Pulsa Espacio para jugar otra vez', touch: 'Toca para jugar otra vez' },
    close: 'Cerrar el minijuego',
    help: {
      pointer: 'Espacio, ↑ o el botón A para saltar los bichos. Esc para salir.',
      touch: 'Toca la pantalla para saltar los bichos.',
    },
    /** The printing on the KELOR handheld the runner plays in (decorative). */
    console: {
      brand: 'KELOR',
      maker: 'Interactive',
      model: 'K-89',
      power: 'Power',
      select: 'Select',
      start: 'Start',
    },
  },
  notFound: {
    title: 'Página no encontrada',
    body: 'Esta página no existe. Kelo te espera en la portada.',
    back: 'Volver al inicio',
  },
  error: {
    title: 'Algo salió mal',
    body: 'La página no pudo cargarse. Vuelve a intentarlo en un momento.',
    retry: 'Reintentar',
    back: 'Volver al inicio',
  },
  /** Accessible name of the sound switch; its state is aria-pressed. */
  sound: {
    label: 'Sonido',
  },
  footer: {
    owner: 'KELOR Interactive',
  },
} as const
