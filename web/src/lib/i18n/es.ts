import type { Catalog } from "./en";

/**
 * Español — the first interface catalog. Must define exactly the same keys as `en`
 * (compile-time via `Catalog`, plus a unit test that fails on any drift).
 */
export const es: Catalog = {
  // Shell
  "shell.skip": "Saltar al contenido",
  "nav.home": "Inicio",
  "nav.communities": "Comunidades",
  "nav.create": "Crear",
  "nav.chats": "Chats",
  "nav.profile": "Perfil",
  "nav.search": "Buscar",

  // Landing (página de presentación sin sesión)
  "landing.badge": "La app de comunidades tranquila · 18+",
  "landing.hero.title": "Encuentra a tu gente. Crea tu comunidad.",
  "landing.hero.body":
    "Kamino reúne comunidades, chats, fiestas de cine y salas en directo en una app gratuita, con herramientas de verdad para quien las administra. Sin anuncios invasivos y sin reputación de pago.",
  "landing.cta.getStarted": "Empezar",
  "landing.cta.tour": "Hacer el recorrido",
  "landing.cta.browse": "Ver comunidades",
  "landing.cta.explore": "Explorar",
  "landing.features.title": "Qué puedes hacer en Kamino",
  "landing.feature.communities.title": "Comunidades que se sienten pequeñas",
  "landing.feature.communities.body":
    "Microcomunidades de 10 a 50 personas, foros, wikis, misiones y una reputación que pertenece a cada comunidad, no una sola nota global.",
  "landing.feature.watch.title": "Fiestas de cine con cola",
  "landing.feature.watch.body":
    "Reproduce YouTube, Vimeo, Twitch o tus propios archivos en sincronía, vota qué ver después, haz comprobaciones de listos y comenta mientras lo disfrutan.",
  "landing.feature.live.title": "Salas en directo y eventos",
  "landing.feature.live.body":
    "Salas con anfitriones, oradores y mano levantada, eventos programados con recordatorios y llamadas que funcionan a la primera.",
  "landing.feature.chats.title": "Chats que abren con ganas",
  "landing.feature.chats.body":
    "Mensajes directos, grupos con moderadores, notas de voz, stickers, reacciones y confirmaciones de lectura, en el teléfono y en la web.",
  "landing.feature.creators.title": "Herramientas reales para creadores",
  "landing.feature.creators.body":
    "Portafolio, analíticas, publicaciones exclusivas y espacios para suscriptores. La reputación y la moderación no se pueden comprar.",
  "landing.feature.safety.title": "Seguridad integrada",
  "landing.feature.safety.body":
    "Moderación asistida por IA con revisión humana, apelaciones, silencios temporales, plataforma solo para adultos y control de edad 18+.",
  "landing.banner.title": "Tu comunidad te espera",
  "landing.banner.body":
    "Elige tus intereses y Kamino te sugiere comunidades y personas que los comparten: en menos de un minuto, gratis, en iPhone, Android y la web.",
  "landing.banner.button": "Únete a Kamino gratis",
  "landing.footer.rights": "© {year} Kamino · Creada por Kelnova Labs en Kelowna, Canadá. La app básica es gratis, siempre.",
  "landing.footer.houseRules": "Normas de la casa",
  "landing.footer.privacy": "Privacidad",
  "landing.footer.terms": "Términos",
  "landing.footer.copyright": "Copyright",
  "landing.footer.childSafety": "Seguridad infantil",
  "landing.footer.language": "Idioma",

  // Iniciar sesión / crear cuenta
  "login.lead.up": "Crea tu ",
  "login.lead.in": "Bienvenido de ",
  "login.highlight.up": "cuenta",
  "login.highlight.in": "nuevo",
  "login.text.up":
    "Un lugar tranquilo para tus comunidades. Gratis, sin notificaciones insistentes.",
  "login.text.in": "Qué bueno verte de nuevo. Inicia sesión para volver con tu gente.",
  "login.tab.label": "Acceso a la cuenta",
  "login.tab.up": "Crear cuenta",
  "login.tab.in": "Iniciar sesión",
  "login.invited": "Te invitó {name}: ambos ganan reputación al unirte.",
  "login.field.displayName": "Nombre para mostrar",
  "login.field.displayNamePlaceholder": "¿Cómo te llamamos?",
  "login.field.email": "Correo electrónico",
  "login.field.emailPlaceholder": "tu@ejemplo.com",
  "login.field.password": "Contraseña",
  "login.field.passwordPlaceholder": "Al menos 8 caracteres",
  "login.showPassword": "Mostrar contraseña",
  "login.hidePassword": "Ocultar contraseña",
  "login.forgot": "¿Olvidaste tu contraseña?",
  "login.submit.busy": "Abriendo tu mundo…",
  "login.submit.twoFactor": "Verificar código",
  "login.submit.up": "Crear mi cuenta",
  "login.submit.in": "Iniciar sesión",
  "login.continueWith": "Continuar con {provider}",
  "login.phone.title": "Inicia sesión con un número de teléfono",
  "login.phone.number": "Número de teléfono",
  "login.phone.code": "Código SMS",
  "login.phone.send": "Enviar código SMS",
  "login.phone.verify": "Verificar código SMS",
  "login.agree": "Al continuar aceptas los",
  "login.terms": "Términos",
  "login.and": "y la",
  "login.privacy": "Política de privacidad",
  "login.ageNote": "Para adultos de 18 años o más.",
  "login.switch.toIn": "Ya tengo una cuenta",
  "login.switch.toUp": "¿Nuevo por aquí? Crea una cuenta",
  "login.looking": "¿Solo estás mirando?",
  "login.explore": "Explorar comunidades",
  "login.emailConfirm":
    "Revisa tu correo para abrir el enlace de confirmación y luego inicia sesión. Después verificarás tu fecha de nacimiento.",

  // Esenciales del inicio
  "home.tab.forYou": "Para ti",
  "home.tab.following": "Siguiendo",
  "home.tab.communities": "Comunidades",
  "home.empty.forYou.title": "Tu inicio está tranquilo",
  "home.empty.forYou.body": "Únete a algunas comunidades y sus publicaciones aparecerán aquí.",
  "home.empty.forYou.action": "Buscar comunidades",
  "home.empty.following.title": "No hay publicaciones de quien sigues",
  "home.empty.following.body": "Sigue a creadores que te gusten para ver sus publicaciones aquí.",
  "home.empty.following.action": "Buscar personas",
  "home.empty.communities.title": "Nada nuevo en tus comunidades",
  "home.empty.communities.body": "Únete a comunidades para ver aquí sus publicaciones nuevas.",
  "home.empty.communities.action": "Explorar comunidades",

  // Panel de privacidad (donde se elige el idioma)
  "privacy.language.title": "Idioma",
  "privacy.language.help":
    "Tu preferencia de idioma ayuda a las herramientas de descubrimiento y traducción. La traducción de la interfaz depende de los idiomas disponibles.",
};
