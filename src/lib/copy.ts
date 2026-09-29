/**
 * Site copy (Spanish). Kept in one place so a future translation or copy
 * review touches a single file. The page is deliberately almost wordless:
 * the mascot carries it (docs/scroll-script.md).
 */
export const copy = {
  meta: {
    title: 'KELOR Interactive · Conoce a Kelo',
    description:
      'Conoce a Kelo, la mascota 3D de KELOR Interactive, estudio de desarrollo web en Ecuador.',
  },
  brand: 'KELOR Interactive',
  /** The studio's site; switch to the final domain once it exists. */
  studioHref: 'https://kelor-interactive.vercel.app',
  hero: {
    /** Accessible description of the 3D scene. */
    sceneLabel:
      'Escena 3D: de un huevo de dinosaurio nace Kelo, un pequeño dinosaurio morado que te sigue con la mirada. Puedes tocarlo y, con el ratón, arrastrarlo; si lo molestas mucho, muerde.',
  },
  /** What you can do with Kelo, shown until you first touch him. */
  hint: {
    pointer: 'Tócalo o arrástralo',
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
  contact: {
    question: '¿Quieres una web a medida?',
    link: 'Escríbenos',
    // The studio's contact page; switch to the final domain once it exists.
    href: 'https://kelor-interactive.vercel.app/contacto',
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
