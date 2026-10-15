import { useState, useEffect, useRef, useMemo } from "react";
import * as Bible from "./bible.js";
import PassageCard, { lookupPassages } from "./PassageCard.jsx";
import JourneyView, { StepCheck, S, AuthBox } from "./Journey.jsx";
import CareView from "./Care.jsx";
import * as DB from "./supa.js";
import { journeyState, pendingStep, selfSource, localDate, DOMAIN_KEYS, TEST_KEYS } from "./journey.js";
import { journeyText, fmt } from "./strings-journey.js";
import { crisisWords } from "./crisis.js";

// The guide runs on the server (netlify/functions/compass.mjs). The browser sends only the
// person's words; the prompts and the key never leave the server.
async function askCompass(payload, retry = true) {
  let resp;
  try {
    resp = await fetch("/api/compass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error("network");
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.ok) {
    const code = data.error || "upstream";
    if (retry && (code === "timeout" || code === "unreadable")) return askCompass(payload, false); // one quiet retry
    throw new Error(code);
  }
  return data.result;
}

const DONATE_URL = "https://www.paypal.com/donate/?hosted_button_id=MWQHNBSUBX396";
const COME_UNTO_ME = { ref: "Matthew 11:28", text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest." };

// Words added in COMPASS-01. Spanish, French, Yoruba, Igbo and Hausa need a native speaker's review (see TRANSLATION-REVIEW.md).
const EXTRA = {
  en: {
    stageWord: "Stage", unclear: "UNCLEAR",
    sources: { truth: "Likely the Spirit of Truth", error: "Likely the spirit of error", unclear: "Unclear — wait and seek wisdom" },
    prayerLabels: { refute: "Active Refutation — Prayer", affirm: "Prayer of Yielding", wait: "Prayer for Clarity" },
    readChapter: "Read the whole chapter", hideChapter: "Close the chapter",
    kjvNote: "",
    communityLabel: "Bring It to the Body",
    crisisTitle: "Please reach out now",
    crisisText: "What you are carrying sounds very heavy, and you should not carry it alone. If you might harm yourself or someone else, or you are in danger, call your local emergency number now (in the U.S., call or text 988). Reach out today to someone you trust, your pastor, or a doctor.",
    humility: "The Compass is an aid to your own discernment; it does not speak for God. Test everything by the whole of Scripture and with your church.",
    errorBusy: "Many people are using the Compass right now. Please wait a few minutes and try again.",
    errorTimeout: "The response took too long. Please try again.",
  },
  es: {
    stageWord: "Etapa", unclear: "INCIERTO",
    sources: { truth: "Probablemente el Espíritu de Verdad", error: "Probablemente el espíritu de error", unclear: "Incierto — espera y busca sabiduría" },
    prayerLabels: { refute: "Refutación Activa — Oración", affirm: "Oración de Rendición", wait: "Oración por Claridad" },
    readChapter: "Leer el capítulo completo", hideChapter: "Cerrar el capítulo",
    kjvNote: "Las Escrituras se muestran en la versión King James (inglés). La explicación está en español.",
    communityLabel: "Llévalo al Cuerpo de Cristo",
    crisisTitle: "Por favor, busca ayuda ahora",
    crisisText: "Lo que llevas es muy pesado, y no debes cargarlo solo. Si podrías hacerte daño a ti mismo o a otra persona, o estás en peligro, llama ahora al número de emergencias de tu país (en EE. UU., llama o envía un mensaje al 988). Habla hoy con alguien de confianza, tu pastor o un médico.",
    humility: "La Brújula es una ayuda para tu propio discernimiento; no habla por Dios. Examínalo todo con toda la Escritura y con tu iglesia.",
    errorBusy: "Muchas personas están usando la Brújula ahora. Espera unos minutos e inténtalo de nuevo.",
    errorTimeout: "La respuesta tardó demasiado. Inténtalo de nuevo.",
  },
  fr: {
    stageWord: "Étape", unclear: "INCERTAIN",
    sources: { truth: "Probablement l'Esprit de vérité", error: "Probablement l'esprit d'erreur", unclear: "Incertain — attendez et cherchez la sagesse" },
    prayerLabels: { refute: "Réfutation Active — Prière", affirm: "Prière d'abandon", wait: "Prière pour la clarté" },
    readChapter: "Lire tout le chapitre", hideChapter: "Fermer le chapitre",
    kjvNote: "Les Écritures sont affichées dans la version King James (anglais). L'explication est en français.",
    communityLabel: "Apportez-le au Corps du Christ",
    crisisTitle: "Cherchez de l'aide maintenant",
    crisisText: "Ce que vous portez est très lourd, et vous ne devez pas le porter seul. Si vous risquez de vous faire du mal ou d'en faire à quelqu'un, ou si vous êtes en danger, appelez maintenant le numéro d'urgence de votre pays. Parlez aujourd'hui à une personne de confiance, à votre pasteur ou à un médecin.",
    humility: "La Boussole est une aide à votre propre discernement ; elle ne parle pas au nom de Dieu. Éprouvez toutes choses par l'ensemble des Écritures et avec votre Église.",
    errorBusy: "Beaucoup de personnes utilisent la Boussole en ce moment. Patientez quelques minutes et réessayez.",
    errorTimeout: "La réponse a pris trop de temps. Réessayez.",
  },
  yo: {
    stageWord: "Ìpele", unclear: "KÒ DÁJÚ",
    sources: { truth: "Ó ṣeéṣe kí ó jẹ́ Ẹ̀mí Òtítọ́", error: "Ó ṣeéṣe kí ó jẹ́ ẹ̀mí ìṣìnà", unclear: "Kò dájú — dúró kí o sì wá ọgbọ́n" },
    prayerLabels: { refute: "Kíkọ̀ Àgbára — Àdúrà", affirm: "Àdúrà Ìtẹríba", wait: "Àdúrà fún Ìmọ́lẹ̀" },
    readChapter: "Ka gbogbo orí náà", hideChapter: "Pa orí náà dé",
    kjvNote: "A fi Ìwé Mímọ́ hàn ní King James Version (Gẹ̀ẹ́sì). Àlàyé wà ní Yorùbá.",
    communityLabel: "Mú Un Wá Sọ́dọ̀ Ìjọ",
    crisisTitle: "Jọ̀wọ́ wá ìrànlọ́wọ́ nísinsìnyí",
    crisisText: "Ohun tí ò ń gbé wúwo púpọ̀, kò sì yẹ kí o gbé e nìkan. Tí o bá lè ṣe ara rẹ tàbí ẹlòmíràn léṣe, tàbí tí o bá wà nínú ewu, pe nọ́ńbà pàjáwìrì ní agbègbè rẹ nísinsìnyí. Bá ẹnìkan tí o fọkàn tán, pásítọ̀ rẹ, tàbí dókítà sọ̀rọ̀ lónìí.",
    humility: "Compass jẹ́ ohun-èlò láti ràn ọ́ lọ́wọ́ nínú ìfòyemọ̀ tìrẹ; kò sọ̀rọ̀ fún Ọlọ́run. Dán ohun gbogbo wò pẹ̀lú gbogbo Ìwé Mímọ́ àti pẹ̀lú ìjọ rẹ.",
    errorBusy: "Ọ̀pọ̀ ènìyàn ń lo Compass báyìí. Jọ̀wọ́ dúró ìṣẹ́jú díẹ̀ kí o tún gbìyànjú.",
    errorTimeout: "Ó pẹ́ jù. Jọ̀wọ́ tún gbìyànjú.",
  },
  ig: {
    stageWord: "Nkebi", unclear: "O DOGHỊ ANYA",
    sources: { truth: "O nwere ike ịbụ Mmụọ Eziokwu", error: "O nwere ike ịbụ mmụọ njehie", unclear: "O doghị anya — chere ma chọọ amamihe" },
    prayerLabels: { refute: "Ịkwụsị Ike — Ekpere", affirm: "Ekpere Nrubeisi", wait: "Ekpere maka Nghọta" },
    readChapter: "Gụọ isi ahụ niile", hideChapter: "Mechie isi ahụ",
    kjvNote: "E gosipụtara Akwụkwọ Nsọ na King James Version (Bekee). Nkọwa dị n'Igbo.",
    communityLabel: "Weta ya n'Ọgbakọ",
    crisisTitle: "Biko chọọ enyemaka ugbu a",
    crisisText: "Ihe ị na-ebu dị arọ nke ukwuu, ị gaghị ebu ya naanị gị. Ọ bụrụ na ị nwere ike imerụ onwe gị ahụ ma ọ bụ onye ọzọ, ma ọ bụ na ị nọ n'ihe egwu, kpọọ nọmba mberede mpaghara gị ugbu a. Gwa onye ị tụkwasịrị obi, pastọ gị, ma ọ bụ dọkịta okwu taa.",
    humility: "Compass bụ ihe enyemaka maka nghọta nke gị; ọ naghị ekwu okwu n'aha Chineke. Nwalee ihe niile site n'Akwụkwọ Nsọ niile na ụka gị.",
    errorBusy: "Ọtụtụ mmadụ na-eji Compass ugbu a. Biko chere nkeji ole na ole ma nwaa ọzọ.",
    errorTimeout: "O were ogologo oge. Biko nwaa ọzọ.",
  },
  ha: {
    stageWord: "Mataki", unclear: "BA A TABBATA BA",
    sources: { truth: "Mai yiwuwa Ruhun Gaskiya ne", error: "Mai yiwuwa ruhun ɓata ne", unclear: "Ba a tabbata ba — jira ka nemi hikima" },
    prayerLabels: { refute: "Ƙaryatawa Mai Aiki — Addu'a", affirm: "Addu'ar Miƙa Kai", wait: "Addu'ar Neman Haske" },
    readChapter: "Karanta dukan babin", hideChapter: "Rufe babin",
    kjvNote: "Ana nuna Nassi a cikin King James Version (Turanci). Bayani yana cikin Hausa.",
    communityLabel: "Kai Shi Ga Ikilisiya",
    crisisTitle: "Don Allah nemi taimako yanzu",
    crisisText: "Abin da kake ɗauke da shi yana da nauyi sosai, kuma bai kamata ka ɗauke shi kai kaɗai ba. Idan za ka iya cutar da kanka ko wani, ko kana cikin haɗari, kira lambar gaggawa ta yankinku yanzu. Yi magana da wanda ka amince da shi, fastonka, ko likita a yau.",
    humility: "Compass taimako ne ga fahimtarka; ba ya magana a madadin Allah. Gwada komai da dukan Nassi da kuma tare da ikilisiyarka.",
    errorBusy: "Mutane da yawa suna amfani da Compass yanzu. Don Allah jira 'yan mintuna ka sake gwadawa.",
    errorTimeout: "Ya ɗauki lokaci mai tsawo. Don Allah a sake gwadawa.",
  },
};

function errorText(T, e, fallback) {
  const code = e && e.message;
  if (code === "busy") return T.errorBusy;
  if (code === "timeout") return T.errorTimeout;
  return fallback;
}

const LANGUAGES = {
  en: { label: "English", flag: "🇺🇸" },
  es: { label: "Español", flag: "🇪🇸" },
  fr: { label: "Français", flag: "🇫🇷" },
  yo: { label: "Yorùbá", flag: "🇳🇬" },
  ig: { label: "Igbo", flag: "🇳🇬" },
  ha: { label: "Hausa", flag: "🇳🇬" },
};

const UI_TEXT = {
  en: {
    eyebrow: "A Spiritual Discernment Instrument",
    tagline: "Every signal aligns you with one of two frequencies.",
    tagline2: "Stop. Test the signal. Recalibrate.",
    domainLabel: "Life Domain",
    domainPlaceholder: "Select a domain (optional)",
    domains: ["Relationships & Marriage","Work & Vocation","Inner Life & Identity","Social & Community","Financial","Health & Body","Ministry & Service","Parenting & Family","Other"],
    signalLabel: "Name the Signal",
    signalPlaceholder: "What specific thought, feeling, or impulse is knocking at the door of your mind right now? Be honest and plain…",
    pressureLabel: "Note the Pressure",
    pressureOptions: [
      { val: "urgent", label: "Urgent Rush", sub: "Fear, panic, compulsion" },
      { val: "gentle", label: "Quiet Nudge", sub: "Clear, patient, inviting" },
      { val: "unclear", label: "Unclear", sub: "Hard to name yet" },
    ],
    testBtn: "Test the Signal",
    testing: "Testing the Signal…",
    sourceLabel: "Source Identified",
    tests: [
      { key: "christological", label: "Christological Test" },
      { key: "canonical", label: "Canonical Test" },
      { key: "character", label: "Character Test" },
      { key: "corporate", label: "Corporate Test" },
    ],
    aligned: "ALIGNED",
    misaligned: "MISALIGNED",
    startOver: "Start Over",
    generateBtn: "Generate Faithful Response",
    generating: "Preparing Response…",
    prayerLabel: "Active Refutation — Prayer",
    scriptureLabel: "Scriptural Recalibration",
    stepLabel: "Your One Step — Right Now",
    back: "Back",
    newSession: "Begin a New Session",
    journeyTitle: "The Journey Continues",
    journeyLine1: "This tool is one part of a larger journey.",
    journeyLine2: "Watch this space — Coming Soon ✦",
    donateText: "If this tool has blessed you, consider supporting the mission through His Dominion — a 501(c)(3) nonprofit. Your gift is tax-deductible and helps us keep building life-changing tools, free for everyone.",
    donateBtn: "Support His Dominion",
    errorSignal: "Please describe the signal you are experiencing.",
    errorGeneral: "Something went wrong. Please try again.",
    errorResponse: "Could not generate the response. Please try again.",
    verse1: '"Beloved, believe not every spirit, but try the spirits whether they are of God…" — 1 John 4:1',
    verse2: '"Hereby know we the spirit of truth, and the spirit of error." — 1 John 4:6',
    verse3: '"Greater is he that is in you, than he that is in the world." — 1 John 4:4',
    footer: '"Greater is he that is in you, than he that is in the world." — 1 John 4:4',
    stages: [
      { number: "I", title: "Signal Detection", desc: "Pause and name what is knocking at the door of your mind — without judgment." },
      { number: "II", title: "Source Identification", desc: "Test the signal against four unshakeable standards." },
      { number: "III", title: "Faithful Response", desc: "Discernment without action is self-deception. Switch frequencies." },
    ],
  },
  es: {
    eyebrow: "Un Instrumento de Discernimiento Espiritual",
    tagline: "Cada señal te alinea con una de dos frecuencias.",
    tagline2: "Detente. Prueba la señal. Recalibra.",
    domainLabel: "Área de Vida",
    domainPlaceholder: "Selecciona un área (opcional)",
    domains: ["Relaciones y Matrimonio","Trabajo y Vocación","Vida Interior e Identidad","Social y Comunidad","Finanzas","Salud y Cuerpo","Ministerio y Servicio","Crianza y Familia","Otro"],
    signalLabel: "Nombra la Señal",
    signalPlaceholder: "¿Qué pensamiento, sentimiento o impulso específico está llamando a la puerta de tu mente ahora mismo? Sé honesto y claro…",
    pressureLabel: "Nota la Presión",
    pressureOptions: [
      { val: "urgent", label: "Urgencia", sub: "Miedo, pánico, compulsión" },
      { val: "gentle", label: "Suave Empuje", sub: "Claro, paciente, invitante" },
      { val: "unclear", label: "No Claro", sub: "Difícil de nombrar aún" },
    ],
    testBtn: "Probar la Señal",
    testing: "Probando la Señal…",
    sourceLabel: "Fuente Identificada",
    tests: [
      { key: "christological", label: "Prueba Cristológica" },
      { key: "canonical", label: "Prueba Canónica" },
      { key: "character", label: "Prueba de Carácter" },
      { key: "corporate", label: "Prueba Corporativa" },
    ],
    aligned: "ALINEADO",
    misaligned: "DESALINEADO",
    startOver: "Empezar de Nuevo",
    generateBtn: "Generar Respuesta Fiel",
    generating: "Preparando Respuesta…",
    prayerLabel: "Refutación Activa — Oración",
    scriptureLabel: "Recalibración Escritural",
    stepLabel: "Tu Primer Paso — Ahora Mismo",
    back: "Atrás",
    newSession: "Comenzar una Nueva Sesión",
    journeyTitle: "El Viaje Continúa",
    journeyLine1: "Esta herramienta es parte de un viaje más grande.",
    journeyLine2: "Estén atentos — ¡Próximamente! ✦",
    donateText: "Si esta herramienta te ha bendecido, considera apoyar la misión a través de His Dominion — una organización sin fines de lucro 501(c)(3). Tu donación es deducible de impuestos.",
    donateBtn: "Apoyar His Dominion",
    errorSignal: "Por favor describe la señal que estás experimentando.",
    errorGeneral: "Algo salió mal. Por favor intenta de nuevo.",
    errorResponse: "No se pudo generar la respuesta. Por favor intenta de nuevo.",
    verse1: '"Amados, no creáis a todo espíritu, sino probad los espíritus." — 1 Juan 4:1',
    verse2: '"En esto conocemos el espíritu de verdad y el espíritu de error." — 1 Juan 4:6',
    verse3: '"Mayor es el que está en vosotros, que el que está en el mundo." — 1 Juan 4:4',
    footer: '"Mayor es el que está en vosotros, que el que está en el mundo." — 1 Juan 4:4',
    stages: [
      { number: "I", title: "Detección de Señal", desc: "Pausa y nombra lo que está llamando a la puerta de tu mente — sin juzgar." },
      { number: "II", title: "Identificación de Fuente", desc: "Prueba la señal contra cuatro estándares inquebrantables." },
      { number: "III", title: "Respuesta Fiel", desc: "El discernimiento sin acción es autoengaño. Cambia de frecuencia." },
    ],
  },
  fr: {
    eyebrow: "Un Instrument de Discernement Spirituel",
    tagline: "Chaque signal vous aligne avec l'une de deux fréquences.",
    tagline2: "Arrêtez. Testez le signal. Recalibrez.",
    domainLabel: "Domaine de Vie",
    domainPlaceholder: "Sélectionnez un domaine (optionnel)",
    domains: ["Relations et Mariage","Travail et Vocation","Vie Intérieure et Identité","Social et Communauté","Finances","Santé et Corps","Ministère et Service","Parentalité et Famille","Autre"],
    signalLabel: "Nommez le Signal",
    signalPlaceholder: "Quelle pensée, sentiment ou impulsion frappe à la porte de votre esprit en ce moment? Soyez honnête et clair…",
    pressureLabel: "Notez la Pression",
    pressureOptions: [
      { val: "urgent", label: "Urgence", sub: "Peur, panique, compulsion" },
      { val: "gentle", label: "Douce Invitation", sub: "Clair, patient, invitant" },
      { val: "unclear", label: "Peu Clair", sub: "Difficile à nommer encore" },
    ],
    testBtn: "Tester le Signal",
    testing: "Test en cours…",
    sourceLabel: "Source Identifiée",
    tests: [
      { key: "christological", label: "Test Christologique" },
      { key: "canonical", label: "Test Canonique" },
      { key: "character", label: "Test de Caractère" },
      { key: "corporate", label: "Test Corporatif" },
    ],
    aligned: "ALIGNÉ",
    misaligned: "DÉSALIGNÉ",
    startOver: "Recommencer",
    generateBtn: "Générer une Réponse Fidèle",
    generating: "Préparation de la Réponse…",
    prayerLabel: "Réfutation Active — Prière",
    scriptureLabel: "Recalibration Scripturaire",
    stepLabel: "Votre Premier Pas — Maintenant",
    back: "Retour",
    newSession: "Commencer une Nouvelle Session",
    journeyTitle: "Le Voyage Continue",
    journeyLine1: "Cet outil fait partie d'un voyage plus grand.",
    journeyLine2: "Surveillez cet espace — Bientôt disponible! ✦",
    donateText: "Si cet outil vous a béni, envisagez de soutenir la mission à travers His Dominion — une organisation à but non lucratif 501(c)(3).",
    donateBtn: "Soutenir His Dominion",
    errorSignal: "Veuillez décrire le signal que vous ressentez.",
    errorGeneral: "Quelque chose a mal tourné. Veuillez réessayer.",
    errorResponse: "Impossible de générer la réponse. Veuillez réessayer.",
    verse1: '"Bien-aimés, n\'ajoutez pas foi à tout esprit; mais éprouvez les esprits." — 1 Jean 4:1',
    verse2: '"C\'est à cela que nous reconnaissons l\'esprit de vérité et l\'esprit d\'erreur." — 1 Jean 4:6',
    verse3: '"Celui qui est en vous est plus grand que celui qui est dans le monde." — 1 Jean 4:4',
    footer: '"Celui qui est en vous est plus grand que celui qui est dans le monde." — 1 Jean 4:4',
    stages: [
      { number: "I", title: "Détection du Signal", desc: "Faites une pause et nommez ce qui frappe à la porte de votre esprit — sans jugement." },
      { number: "II", title: "Identification de la Source", desc: "Testez le signal par rapport à quatre normes inébranlables." },
      { number: "III", title: "Réponse Fidèle", desc: "Le discernement sans action est une illusion. Changez de fréquence." },
    ],
  },
  yo: {
    eyebrow: "Ohun-elo Ìdánwò Ẹmí",
    tagline: "Gbogbo àmì ń so ọ pọ̀ mọ́ ọkan ninu igbi meji.",
    tagline2: "Dúró. Ṣàdánwò àmì náà. Tún ṣe.",
    domainLabel: "Agbègbè Ìgbésí-ayé",
    domainPlaceholder: "Yan agbègbè kan (aṣayan)",
    domains: ["Àjọṣepọ̀ àti Ìgbéyàwó","Iṣẹ́ àti Ìpè","Ìgbésí-ayé inú àti Ìdánimọ̀","Àwùjọ àti Ìjọ","Owó","Ìlera àti Ara","Iṣẹ́-òjíṣẹ́ àti Ìsìn","Bíbímọ àti Ìdílé","Mìíràn"],
    signalLabel: "Sọ Àmì Náà",
    signalPlaceholder: "Irú ìrónú, ìmọ̀lára, tàbí agbára wo ni ó ń kọ ẹnu ọkàn rẹ nísinsin yìí? Jẹ́ onígbọ̀wọ́ àti tọ̀…",
    pressureLabel: "Ṣàkíyèsí Ìtẹ́síwájú",
    pressureOptions: [
      { val: "urgent", label: "Ìyàrá", sub: "Ẹ̀rù, ìdàrúdàpọ̀, ìmúra" },
      { val: "gentle", label: "Ìpèsẹ Rere", sub: "Kedere, sùúrù, ìpè" },
      { val: "unclear", label: "Kò Kedere", sub: "Ṣòro láti sọ títí di isinsisiyi" },
    ],
    testBtn: "Ṣàdánwò Àmì Náà",
    testing: "Ń ṣàdánwò Àmì…",
    sourceLabel: "Orísun Ti Mọ",
    tests: [
      { key: "christological", label: "Ìdánwò Kristológìkì" },
      { key: "canonical", label: "Ìdánwò Kánónìkì" },
      { key: "character", label: "Ìdánwò Ìwà" },
      { key: "corporate", label: "Ìdánwò Àjọpọ̀" },
    ],
    aligned: "Ó TỌ̀",
    misaligned: "KÒ TỌ̀",
    startOver: "Bẹ̀rẹ̀ Lẹ́ẹ̀kan Sí",
    generateBtn: "Ṣẹ̀dá Ìdáhùn Olóòtọ́",
    generating: "Ń pèsè Ìdáhùn…",
    prayerLabel: "Kíkọ̀ Àgbára — Àdúrà",
    scriptureLabel: "Atúntò Ìwé Mímọ́",
    stepLabel: "Ìgbésẹ̀ Rẹ Kan — Sísinsin Yìí",
    back: "Padà",
    newSession: "Bẹ̀rẹ̀ Ìdánwò Tuntun",
    journeyTitle: "Ìrìn-Àjò Náà Ń Bá Lọ",
    journeyLine1: "Ohun-elo yìí jẹ́ apá kan ti ìrìn-àjò tó tobi jùlọ.",
    journeyLine2: "Máa wo àyè yìí — Ń bọ̀ laipẹ! ✦",
    donateText: "Tí ohun-elo yìí bá ti jẹ ìbùkún fún ọ, ronu láti ṣe àtìlẹyìn iṣẹ́ náà nípasẹ̀ His Dominion.",
    donateBtn: "Ṣe Àtìlẹyìn His Dominion",
    errorSignal: "Jọwọ ṣàpèjúwe àmì tí o ń ní iriri.",
    errorGeneral: "Nǹkan kan ṣẹlẹ̀. Jọwọ gbiyanju lẹ́ẹ̀kan síi.",
    errorResponse: "Kò lè ṣẹ̀dá ìdáhùn. Jọwọ gbiyanju lẹ́ẹ̀kan síi.",
    verse1: '"Àwọn olùfẹ́, má ṣe gbọ́ gbogbo ẹ̀mí; ṣùgbọ́n ṣàdánwò àwọn ẹ̀mí." — 1 Jòhánù 4:1',
    verse2: '"Nípa èyí ni a mọ̀ ẹ̀mí òtítọ́ àti ẹ̀mí ìtanjẹ." — 1 Jòhánù 4:6',
    verse3: '"Ẹni tó wà nínú yín tóbi ju ẹni tó wà nínú ayé lọ." — 1 Jòhánù 4:4',
    footer: '"Ẹni tó wà nínú yín tóbi ju ẹni tó wà nínú ayé lọ." — 1 Jòhánù 4:4',
    stages: [
      { number: "I", title: "Ìwárí Àmì", desc: "Dúró kí o sì sọ ohun tó ń kọ ẹnu ọkàn rẹ — láìsí ìdájọ́." },
      { number: "II", title: "Ìdánimọ̀ Orísun", desc: "Ṣàdánwò àmì náà lódì sí ìwọ̀n mẹ́rin tí kò ṣeéyípadà." },
      { number: "III", title: "Ìdáhùn Olóòtọ́", desc: "Ìdánwò láìsí iṣẹ́ jẹ́ ẹtan ara ẹni. Yí igbi padà." },
    ],
  },
  ig: {
    eyebrow: "Ngwaọrụ Nchọpụta Mmụọ",
    tagline: "Akara ọ bụla na-edozi gị n'otu n'ime mmejọ abụọ.",
    tagline2: "Kwụsị. Nwalee akara ahụ. Tụgharia.",
    domainLabel: "Mpaghara Ndụ",
    domainPlaceholder: "Họrọ mpaghara (nhọrọ)",
    domains: ["Mmekọrịta na Alụmdi","Ọrụ na Ọrụ Ike","Ndụ ime na Njirimara","Ọha na Obodo","Ego","Ahụike na Ahụ","Ozi na Ọrụ Onyenwe","Ịzụ Ụmụaka na Ezinụlọ","Ndị ọzọ"],
    signalLabel: "Kọọ Akara Ahụ",
    signalPlaceholder: "Olee echiche, mmetụta, ma ọ bụ ọrụ dị ịrịba ama na-akụ n'ọnụ uche gị ugbu a? Bụrụ onye ezi okwu na nke doro anya…",
    pressureLabel: "Hụ Nrụgide",
    pressureOptions: [
      { val: "urgent", label: "Ọsịsa", sub: "Egwu, ihe mgbu, ịkpali" },
      { val: "gentle", label: "Ịkpọ Nwayọọ", sub: "Doro anya, ndụmọdụ, ịkpọ" },
      { val: "unclear", label: "Adịghị Doro Anya", sub: "Ọ siri ike ikọ ya ugbu a" },
    ],
    testBtn: "Nwalee Akara Ahụ",
    testing: "Na-anwalee Akara…",
    sourceLabel: "Isi Ntọala Achọpụtara",
    tests: [
      { key: "christological", label: "Nnwale Kraịst" },
      { key: "canonical", label: "Nnwale Kanọn" },
      { key: "character", label: "Nnwale Agwa" },
      { key: "corporate", label: "Nnwale Ọha" },
    ],
    aligned: "DABARA",
    misaligned: "ADABAGHỊ",
    startOver: "Malite Ọzọ",
    generateBtn: "Mepụta Nzaghachi Kwesịrị Ekwesị",
    generating: "Na-akwado Nzaghachi…",
    prayerLabel: "Ịkwụsị Ike — Ekpere",
    scriptureLabel: "Ịtụgharia n'Akwụkwọ Nsọ",
    stepLabel: "Nzọụkwụ Gị Otu — Ugbu a",
    back: "Laghachi",
    newSession: "Malite Nnwale Ọhụrụ",
    journeyTitle: "Njem Ahụ Na-aga N'ihu",
    journeyLine1: "Ngwaọrụ a bụ akụkụ otu njem ka ukwu.",
    journeyLine2: "Nọdị na-elecha anya ebe a — Na-abịa n'oge na-adịghị anya! ✦",
    donateText: "Ọ bụrụ na ngwaọrụ a enye gị ngọzi, tụlee ịkwado ozi ahụ site na His Dominion — otu ọrụ 501(c)(3).",
    donateBtn: "Kwado His Dominion",
    errorSignal: "Biko kọọ akara ị na-ahụ.",
    errorGeneral: "Ihe mere. Biko nwalee ọzọ.",
    errorResponse: "Enweghị ike imepụta nzaghachi. Biko nwalee ọzọ.",
    verse1: '"Ndị hụrụ m n\'anya, etoroh ikwere mmụọ ọ bụla; kama nwalee mmụọ ndị ahụ." — 1 Jọn 4:1',
    verse2: '"Site n\'nke a anyị maara mmụọ nke eziokwu na mmụọ nke ọdachi." — 1 Jọn 4:6',
    verse3: '"Onye dị n\'ime unu karịa onye dị n\'ụwa." — 1 Jọn 4:4',
    footer: '"Onye dị n\'ime unu karịa onye dị n\'ụwa." — 1 Jọn 4:4',
    stages: [
      { number: "I", title: "Ịchọpụta Akara", desc: "Kwụsị ma kọọ ihe na-akụ n'ọnụ uche gị — n'enweghị ikpe." },
      { number: "II", title: "Ịchọpụta Isi Ntọala", desc: "Nwalee akara ahụ megide ụkpụrụ anọ na-agaghị agbanwe." },
      { number: "III", title: "Nzaghachi Kwesịrị Ekwesị", desc: "Nchọpụta n'enweghị ọrụ bụ ịduhie onwe ya. Gbanwee mmejọ." },
    ],
  },
  ha: {
    eyebrow: "Kayan Aiki na Gano Ruhu",
    tagline: "Kowane alama tana daidaita ku da ɗaya daga cikin mitar biyu.",
    tagline2: "Tsaya. Gwada alama. Sake daidaitawa.",
    domainLabel: "Yankin Rayuwa",
    domainPlaceholder: "Zaɓi yanki (zaɓi)",
    domains: ["Alaƙa da Aure","Aiki da Kira","Rayuwar Ciki da Asali","Jama'a da Al'umma","Kudi","Lafiya da Jiki","Hidima da Bauta","Renon Yara da Iyali","Sauran"],
    signalLabel: "Sanya Suna wa Alama",
    signalPlaceholder: "Wane tunani, ji, ko motsawa ta musamman tana kwankwasa ƙofar zuciyarku yanzu haka? Kasance mai gaskiya da bayyana…",
    pressureLabel: "Lura da Matsi",
    pressureOptions: [
      { val: "urgent", label: "Gaggawa", sub: "Tsoro, firgita, tilastawa" },
      { val: "gentle", label: "Taushi", sub: "Bayyana, haƙuri, gayyata" },
      { val: "unclear", label: "Ba a Bayyana ba", sub: "Yana da wahala a faɗa tukuna" },
    ],
    testBtn: "Gwada Alama",
    testing: "Ana Gwada Alama…",
    sourceLabel: "An Gano Tushe",
    tests: [
      { key: "christological", label: "Gwajin Kirista" },
      { key: "canonical", label: "Gwajin Canonical" },
      { key: "character", label: "Gwajin Hali" },
      { key: "corporate", label: "Gwajin Jama'a" },
    ],
    aligned: "YA DACE",
    misaligned: "BAYA DACEWA",
    startOver: "Fara Daga Farko",
    generateBtn: "Ƙirƙiri Amsa Mai Aminci",
    generating: "Ana Shirya Amsa…",
    prayerLabel: "Ƙaryatawa Mai Aiki — Addu'a",
    scriptureLabel: "Sake Daidaitawa da Nassi",
    stepLabel: "Matakinka Ɗaya — Yanzu Haka",
    back: "Koma Baya",
    newSession: "Fara Zaman Sabon",
    journeyTitle: "Tafiya Ta ci gaba",
    journeyLine1: "Wannan kayan aiki wani ɓangare ne na tafiya mafi girma.",
    journeyLine2: "Kalli wannan wuri — Zuwa nan ba da jimawa ba! ✦",
    donateText: "Idan wannan kayan aikin ya albarka ku, yi la'akari da goyan bayan aikin ta His Dominion — wata ƙungiya ta 501(c)(3).",
    donateBtn: "Goyi Bayan His Dominion",
    errorSignal: "Don Allah bayyana alama da kuke fuskanta.",
    errorGeneral: "Wani abu ya faru. Don Allah a sake gwadawa.",
    errorResponse: "Ba a iya ƙirƙirar amsa ba. Don Allah a sake gwadawa.",
    verse1: '"Ya ku ƙaunatattu, kada ku gaskata kowane ruhu; sai ku gwada ruhuhu." — 1 Yahaya 4:1',
    verse2: '"Ta haka ne muke sanin ruhu na gaskiya da ruhu na barna." — 1 Yahaya 4:6',
    verse3: '"Wanda yake a cikinku ya fi wanda yake a duniya." — 1 Yahaya 4:4',
    footer: '"Wanda yake a cikinku ya fi wanda yake a duniya." — 1 Yahaya 4:4',
    stages: [
      { number: "I", title: "Gano Alama", desc: "Tsaya ka sanya suna wa abin da yake kwankwasa ƙofar zuciyarka — ba tare da hukunci ba." },
      { number: "II", title: "Gano Tushe", desc: "Gwada alama da ƙa'idodi huɗu masu ƙarfi." },
      { number: "III", title: "Amsa Mai Aminci", desc: "Gano ba tare da aiki ba yaudara ce. Canza mitar." },
    ],
  },
};

const COMPASS_ANGLE = { detect: -45, identify: 0, respond: 45 };
const STAGE_KEYS = ["detect", "identify", "respond"];
const STAGE_COLORS = ["#C9A84C", "#7B9EBE", "#82C9A0"];

function CompassRose({ stageIndex }) {
  const angle = [-45, 0, 45][stageIndex] ?? 0;
  const color = STAGE_COLORS[stageIndex] ?? "#C9A84C";
  return (
    <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width="110" height="110">
        <circle cx="60" cy="60" r="56" fill="none" stroke="#2A3A5C" strokeWidth="1.5" />
        <circle cx="60" cy="60" r="48" fill="none" stroke="#1E2D4A" strokeWidth="0.5" />
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return <line key={deg}
            x1={60 + 48 * Math.sin(rad)} y1={60 - 48 * Math.cos(rad)}
            x2={60 + 56 * Math.sin(rad)} y2={60 - 56 * Math.cos(rad)}
            stroke="#2A3A5C" strokeWidth="1.5" />;
        })}
        <g transform={"rotate(" + angle + ", 60, 60)"}
          style={{ transition: "transform 0.9s cubic-bezier(0.34,1.56,0.64,1)" }}>
          <polygon points="60,14 54,60 66,60" fill={color} opacity="0.95" />
          <polygon points="60,106 54,60 66,60" fill="#2A3A5C" />
          <circle cx="60" cy="60" r="5" fill="#0D1829" stroke={color} strokeWidth="1.5" />
        </g>
        <circle cx="60" cy="60" r="56" fill="none" stroke={color} strokeWidth="0.5" opacity="0.3" />
      </svg>
    </div>
  );
}

function TypingText({ text, speed = 16 }) {
  const [displayed, setDisplayed] = useState("");
  const idx = useRef(0);
  useEffect(() => {
    setDisplayed(""); idx.current = 0;
    if (!text) return;
    const iv = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  }, [text]);
  return <span>{displayed}</span>;
}

const RESULT_COLOR = { aligned: "#82C9A0", misaligned: "#E07B6A", unclear: "#C9A84C" };
const SOURCE_COLOR = { truth: "#82C9A0", error: "#E07B6A", unclear: "#C9A84C" };

function TestCard({ label, content, index, aligned, misaligned, unclear, mine, youLabel, question }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 280 + 150);
    return () => clearTimeout(t);
  }, [index]);
  const result = content ? content.result : "unclear";
  const color = RESULT_COLOR[result] || RESULT_COLOR.unclear;
  return (
    <div style={{
      border: "1px solid " + (visible ? color + "44" : "#1E2D4A"),
      borderRadius: 12, padding: "16px 20px",
      background: visible ? color + "08" : "transparent",
      transition: "all 0.5s ease",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(10px)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: "#8A9EC0", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 11, color: color, fontFamily: "monospace", letterSpacing: "0.1em" }}>
          {result === "aligned" ? aligned : result === "misaligned" ? misaligned : unclear}
        </span>
      </div>
      {mine && (
        <div style={{ fontSize: 11.5, color: RESULT_COLOR[mine], marginBottom: 6, fontFamily: "monospace", letterSpacing: "0.06em" }}>
          {youLabel}: {mine === "aligned" ? aligned : mine === "misaligned" ? misaligned : unclear}
        </div>
      )}
      <p style={{ margin: 0, color: "#B8C9E0", fontSize: 14.5, lineHeight: 1.72, fontFamily: "'Lora',serif" }}>
        {content ? content.analysis : question || ""}
      </p>
    </div>
  );
}

function ProgressDots({ stageIndex }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 36 }}>
      {STAGE_COLORS.map((color, i) => {
        const active = i === stageIndex;
        const done = stageIndex > i;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : "none" }}>
            <div style={{
              width: active ? 28 : 10, height: 10, borderRadius: 5,
              background: done ? color : active ? color : "#1E2D4A",
              transition: "all 0.5s ease",
              boxShadow: active ? "0 0 10px " + color + "88" : "none",
              flexShrink: 0,
            }} />
            {i < 2 && (
              <div style={{
                flex: 1, height: 1,
                background: done ? STAGE_COLORS[i + 1] + "44" : "#1A2840",
                transition: "background 0.5s ease", margin: "0 4px"
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Spinner({ color }) {
  const c = color || "#C9A84C";
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid " + c + "44", borderTopColor: c,
      borderRadius: "50%", animation: "spin 0.8s linear infinite"
    }} />
  );
}

function LanguagePicker({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "#0D1829", border: "1px solid #2A3A5C", borderRadius: 8,
        padding: "6px 14px", color: "#C9A84C", fontSize: 13,
        fontFamily: "'Cormorant Garamond',serif", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {LANGUAGES[lang].flag} {LANGUAGES[lang].label} ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "110%", right: 0, zIndex: 100,
          background: "#0D1829", border: "1px solid #2A3A5C", borderRadius: 10,
          padding: "6px 0", minWidth: 160,
          boxShadow: "0 8px 32px #00000088",
        }}>
          {Object.entries(LANGUAGES).map(([code, { label, flag }]) => (
            <button key={code} onClick={() => { setLang(code); setOpen(false); }}
              style={{
                display: "block", width: "100%", background: lang === code ? "#C9A84C11" : "transparent",
                border: "none", padding: "8px 16px", color: lang === code ? "#C9A84C" : "#8A9EC0",
                fontSize: 13, fontFamily: "'Lora',serif", cursor: "pointer", textAlign: "left",
              }}>
              {flag} {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Days 11–30: the person answers the four tests before (or instead of) the guide.
function SelfTests({ T, J, my, setMy, onSubmit, error }) {
  const opts = [["aligned", J.passes, "#82C9A0"], ["misaligned", J.fails, "#E07B6A"], ["unclear", J.notSure, "#C9A84C"]];
  return (
    <div data-testid="selftests">
      <div style={S.label}>{J.yourTests}</div>
      <p style={{ ...S.small, marginBottom: 14 }}>{J.yourTestsHelp}</p>
      {T.tests.map((t) => (
        <div key={t.key} style={{ border: "1px solid #1E2D4A", borderRadius: 12, padding: "16px 18px", marginBottom: 12, background: "#0D1829" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 14, color: "#8A9EC0", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{t.label}</div>
          <p style={{ margin: "0 0 12px", fontSize: 14.5, color: "#B8C9E0", lineHeight: 1.65 }}>{J.testQ[t.key]}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label={t.label}>
            {opts.map(([v, l, c]) => (
              <button key={v} role="radio" aria-checked={my[t.key] === v} data-test={t.key} data-v={v} onClick={() => setMy({ ...my, [t.key]: v })}
                style={{ flex: "1 1 80px", background: my[t.key] === v ? c + "22" : "transparent", border: "1px solid " + (my[t.key] === v ? c : "#1E2D4A"), borderRadius: 8, padding: "9px 6px", color: my[t.key] === v ? c : "#8A9EC0", fontSize: 13.5, fontFamily: "'Lora',serif", cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p style={{ color: "#E07B6A", fontSize: 13.5, marginBottom: 14 }}>{error}</p>}
      <button onClick={onSubmit} style={{ ...S.btn("#C9A84C", true), marginBottom: 8 }}>{J.seeResult}</button>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState("en");
  const [stageIndex, setStageIndex] = useState(0);
  const [signal, setSignal] = useState("");
  const [pressure, setPressure] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [crisis, setCrisis] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState({});
  const topRef = useRef(null);

  // The 30-Day Attunement
  // Each page has its own address: /signin, /journey, /care (the Compass itself is /).
  const PATHS = { compass: "/", signin: "/signin", journey: "/journey", care: "/care" };
  const viewFromPath = () => ({ "/signin": "signin", "/journey": "journey", "/care": "care" })[location.pathname.replace(/\/+$/, "")] || "compass";
  const [view, setViewState] = useState(viewFromPath);
  function setView(v) {
    setViewState(v);
    try { if (location.pathname !== PATHS[v]) history.pushState(null, "", PATHS[v] + location.search + location.hash); } catch (e) { /* ignore */ }
  }
  useEffect(() => {
    const back = () => setViewState(viewFromPath());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const [overview, setOverview] = useState([]);
  const [notes, setNotes] = useState([]);
  const [user, setUser] = useState(null);
  const [journey, setJourney] = useState(null);
  const [entries, setEntries] = useState([]);
  const [jLoading, setJLoading] = useState(false);
  const [jError, setJError] = useState("");
  const loadedOnce = useRef(false); // show "Loading…" only the first time; later refreshes update in place
  const [recovery, setRecovery] = useState(false);
  const [partners, setPartners] = useState([]);
  const [invites, setInvites] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [counsel, setCounsel] = useState([]);
  const [shareOn, setShareOn] = useState(false);
  // An invitation link (?invite=CODE) survives signing in or creating an account.
  const [inviteCode, setInviteCode] = useState(() => {
    try {
      const q = new URLSearchParams(location.search).get("invite");
      if (q) { localStorage.setItem("ac-invite", q); return q; }
      return localStorage.getItem("ac-invite") || null;
    } catch (e) { return new URLSearchParams(location.search).get("invite"); }
  });
  const [saveOn, setSaveOn] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");
  const [myTests, setMyTests] = useState({});
  const [mySource, setMySource] = useState(null);
  const [selfOpen, setSelfOpen] = useState(false);
  const J = journeyText(lang);
  const jstate = journeyState(journey, entries);
  const todayMode = user && journey && jstate && !jstate.complete ? jstate.mode : "guided";
  const step = user ? pendingStep(entries) : null;

  async function reloadJourney() {
    if (!DB.journeyAvailable) return;
    const u = await DB.currentUser().catch(() => null);
    if (!u) { loadedOnce.current = false; setJourney(null); setEntries([]); setPartners([]); setInvites([]); setSharedWithMe([]); setCounsel([]); setOverview([]); setNotes([]); return; }
    if (!loadedOnce.current) setJLoading(true);
    try {
      // Church care (COMPASS-06) loads alongside; if its tables are not there yet, the rest still works.
      const [j, es, ps, inv, sh, ov, ns] = await Promise.all([DB.getJourney(), DB.listEntries(u.id), DB.listPartners(), DB.listInvites(), DB.listSharedWithMe(u.id),
        DB.careOverview().catch(() => []), DB.listCareNotes().catch(() => [])]);
      const ids = (es || []).filter((e) => e.shared).map((e) => e.id).concat((sh || []).map((e) => e.id));
      const cs = await DB.listCounsel(ids).catch(() => []);
      setJourney(j); setEntries(es || []); setPartners(ps || []); setInvites(inv || []); setSharedWithMe(sh || []); setCounsel(cs || []); setOverview(ov || []); setNotes(ns || []); setJError("");
    } catch (e) {
      setJError("load"); // keep what we have and say so
    }
    loadedOnce.current = true;
    setJLoading(false);
  }

  useEffect(() => {
    if (!DB.journeyAvailable) return;
    let stop = () => {};
    // Coming back from a confirmation email or Google sign-in: open the journey.
    const back = location.hash + location.search;
    if (/access_token|error_description|code=/.test(back)) setView("journey");
    // A password-reset link: read it from the address, because the library may announce it before we listen.
    if (/type=recovery/.test(back)) setRecovery(true);
    if (inviteCode) setView("journey");
    // From an email notice: open the journey, then tidy the address.
    if (/[?&]open=journey/.test(location.search)) { setView("journey"); history.replaceState(null, "", location.pathname); }
    DB.onAuth((u, event) => {
      setUser(u);
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); setView("journey"); }
    }).then((f) => { stop = f; DB.currentUser().then(setUser).catch(() => {}); }).catch(() => {});
    return () => stop();
  }, []);
  useEffect(() => { reloadJourney(); }, [user && user.id]);

  function openJourney() { setView("journey"); reloadJourney(); setTimeout(scrollTop, 50); }
  function testFromJourney() { setView("compass"); reset(); reloadJourney(); }
  function stepSet(entry, status) { return DB.setStep(entry.id, status); }
  function inviteDone(accepted) {
    try { localStorage.removeItem("ac-invite"); } catch (e) { /* ignore */ }
    setInviteCode(null);
    if (/invite=/.test(location.search)) history.replaceState(null, "", location.pathname);
    if (accepted) reloadJourney();
  }
  const ownedPartners = partners.filter((p) => user && p.owner === user.id).length;
  const pastoral = partners.filter((p) => user && p.partner === user.id && p.role === "pastor");
  function openCare() { setView("care"); reloadJourney(); setTimeout(scrollTop, 50); }
  // Signed in from the sign-in page: on to My Journey.
  useEffect(() => { if (user && view === "signin") { setView("journey"); reloadJourney(); } }, [user && user.id, view]);

  const T = { ...UI_TEXT[lang], ...EXTRA[lang] };
  const stage = T.stages[stageIndex];
  const color = STAGE_COLORS[stageIndex];

  // Drawn once, so the stars do not jump every time the page updates.
  const stars = useMemo(() => Array.from({ length: 55 }).map(() => ({
    size: Math.random() * 2 + 1, left: Math.random() * 100, top: Math.random() * 100,
    opacity: Math.random() * 0.25 + 0.04, dur: Math.random() * 4 + 3, delay: Math.random() * 5,
  })), []);

  function scrollTop() {
    if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth" });
  }

  function domainKey(label) {
    const i = T.domains.indexOf(label);
    return i >= 0 ? DOMAIN_KEYS[i] : "";
  }

  async function runIdentification() {
    if (!signal.trim()) { setError(T.errorSignal); return; }
    setError(""); setAnalysisData(null); setMySource(null); setMyTests({}); setSaveMsg("");
    const s = { signal: signal.trim(), domain: domainKey(domain), pressure, mode: todayMode };
    setSession(s);
    if (crisisWords(s.signal)) { setCrisis(true); setTimeout(scrollTop, 100); return; }
    // Days 11–30: the person tests first.
    if (s.mode !== "guided") { setSelfOpen(true); setStageIndex(1); setTimeout(scrollTop, 100); return; }
    setLoading(true);
    try {
      const r = await askCompass({ action: "test", lang, signal: s.signal, domain: s.domain, pressure: s.pressure });
      if (r.crisis) { setCrisis(true); setTimeout(scrollTop, 100); }
      else { setAnalysisData(r); setStageIndex(1); setTimeout(scrollTop, 100); }
    } catch (e) {
      setError(errorText(T, e, T.errorGeneral));
    }
    setLoading(false);
  }

  async function askGuideTest() {
    setError(""); setLoading(true);
    try {
      const r = await askCompass({ action: "test", lang, signal: session.signal, domain: session.domain, pressure: session.pressure });
      if (r.crisis) { setCrisis(true); setTimeout(scrollTop, 100); }
      else setAnalysisData(r);
    } catch (e) {
      setError(errorText(T, e, T.errorGeneral));
    }
    setLoading(false);
  }

  async function submitSelf() {
    if (TEST_KEYS.some((k) => !myTests[k])) { setError(J.answerAll); return; }
    setError(""); setMySource(selfSource(myTests)); setSelfOpen(false);
    if (session.mode === "compare") await askGuideTest();
  }

  async function saveEntry(r) {
    if (!user || !saveOn) return;
    const st = jstate;
    try {
      const shareIt = shareOn && ownedPartners > 0;
      const row = await DB.addEntry({
        local_date: localDate(), round: journey ? journey.round : 1, day_no: st && !st.complete ? st.day : null,
        mode: session.mode || "guided", domain: session.domain || "", pressure: session.pressure || "", signal: session.signal,
        source: analysisData ? analysisData.source : null, my_source: mySource, summary: analysisData ? analysisData.summary : null,
        tests: analysisData ? analysisData.tests : null, my_tests: session.mode !== "guided" ? myTests : null,
        stance: r.stance, prayer: r.prayer, passages: r.passages, step: r.step, community: r.community,
        shared: shareIt, shared_at: shareIt ? new Date().toISOString() : null,
      });
      if (shareIt && row) DB.notify("share", { entry_id: row.id });
      setSaveMsg(J.saved);
      reloadJourney();
    } catch (e) {
      setSaveMsg(J.errorSave);
    }
  }

  async function runResponse() {
    if (!analysisData && !mySource) return;
    // On "test on your own" days, the person's own reading leads unless they asked the guide.
    const src = session.mode === "self" || !analysisData ? mySource : analysisData.source;
    setError(""); setLoading(true); setResponseData(null);
    try {
      const r = await askCompass({ action: "respond", lang, signal: session.signal, domain: session.domain, pressure: session.pressure, source: src, summary: analysisData ? analysisData.summary : "" });
      if (r.crisis) { setCrisis(true); setLoading(false); setTimeout(scrollTop, 100); return; }
      // Selah names the passages; the words always come from the bundled King James Bible.
      const found = await lookupPassages(r.passages, 8);
      setResponseData({ ...r, found });
      saveEntry(r);
      setStageIndex(2);
      setTimeout(scrollTop, 100);
    } catch (e) {
      setError(errorText(T, e, T.errorResponse));
    }
    setLoading(false);
  }

  function reset() {
    setStageIndex(0); setSignal(""); setPressure(""); setDomain(""); setCrisis(false);
    setAnalysisData(null); setResponseData(null); setError(""); setSession({});
    setMyTests({}); setMySource(null); setSelfOpen(false); setSaveMsg(""); setShareOn(false); // sharing is chosen fresh every time
    setTimeout(scrollTop, 100);
  }

  const sourceColor = analysisData ? (SOURCE_COLOR[analysisData.source] || SOURCE_COLOR.unclear) : "#C9A84C";

  return (
    <div style={{ minHeight: "100vh", background: "#080F1C", fontFamily: "'Lora',serif", color: "#D4E0F0", padding: "0 0 80px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        {stars.map((st, i) => (
          <div key={i} style={{
            position: "absolute", borderRadius: "50%", background: "#fff",
            width: st.size, height: st.size, left: st.left + "%", top: st.top + "%",
            opacity: st.opacity, animation: "twinkle " + st.dur + "s ease-in-out infinite", animationDelay: st.delay + "s",
          }} />
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
        @keyframes twinkle { 0%,100%{opacity:0.04} 50%{opacity:0.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 #C9A84C33} 50%{box-shadow:0 0 0 14px #C9A84C00} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%,100%{opacity:0.7} 50%{opacity:1} }
        textarea,select{outline:none!important}
        textarea:focus,select:focus{border-color:#C9A84C88!important}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0D1829}
        ::-webkit-scrollbar-thumb{background:#2A3A5C;border-radius:2px}
        *{box-sizing:border-box}
      `}</style>

      <div ref={topRef} style={{ position: "relative", zIndex: 1, maxWidth: 660, margin: "0 auto", padding: "0 20px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", paddingTop: 56, paddingBottom: 36, animation: "fadeUp 0.8s ease forwards" }}>
          <div style={{ display: "flex", justifyContent: DB.journeyAvailable ? "space-between" : "flex-end", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {DB.journeyAvailable && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => (view === "journey" ? testFromJourney() : openJourney())} data-testid="nav-journey"
                  style={{ background: view === "journey" ? "#C9A84C15" : "#0D1829", border: "1px solid #2A3A5C", borderRadius: 8, padding: "6px 14px", color: "#C9A84C", fontSize: 13, fontFamily: "'Cormorant Garamond',serif", cursor: "pointer" }}>
                  {view === "journey" ? "✦ " + J.back : "✦ " + J.navJourney + (jstate && !jstate.complete ? " · " + jstate.day + "/30" : "")}
                </button>
                {user && pastoral.length > 0 && (
                  <button onClick={() => (view === "care" ? testFromJourney() : openCare())} data-testid="nav-care"
                    style={{ background: view === "care" ? "#C9A84C15" : "#0D1829", border: "1px solid #2A3A5C", borderRadius: 8, padding: "6px 14px", color: "#C9A84C", fontSize: 13, fontFamily: "'Cormorant Garamond',serif", cursor: "pointer" }}>
                    {"✦ " + J.careNav + " · " + pastoral.length}
                  </button>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {DB.journeyAvailable && !user && view !== "signin" && (
                <button onClick={() => { setView("signin"); setTimeout(scrollTop, 50); }} data-testid="nav-signin"
                  style={{ background: "#C9A84C22", border: "1px solid #C9A84C88", borderRadius: 8, padding: "6px 14px", color: "#F0E6CC", fontSize: 13, fontFamily: "'Cormorant Garamond',serif", cursor: "pointer" }}>
                  {J.signInNav}
                </button>
              )}
              <LanguagePicker lang={lang} setLang={(l) => { setLang(l); reset(); }} />
            </div>
          </div>
          <div style={{ letterSpacing: "0.25em", fontSize: 10.5, color: "#4A6080", textTransform: "uppercase", marginBottom: 14, fontFamily: "'Cormorant Garamond',serif" }}>
            {T.eyebrow}
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, fontSize: "clamp(36px,8vw,54px)", margin: 0, color: "#F0E6CC", letterSpacing: "0.04em", lineHeight: 1.1 }}>
            The Attunement<br />
            <span style={{ color: "#C9A84C", fontStyle: "italic" }}>Compass</span>
          </h1>
          <div style={{ width: 36, height: 1, background: "#C9A84C44", margin: "18px auto" }} />
          <p style={{ fontSize: 14.5, color: "#6A80A0", maxWidth: 440, margin: "0 auto", lineHeight: 1.85, fontStyle: "italic" }}>
            {T.tagline}<br />{T.tagline2}
          </p>
        </div>

        {view === "signin" && (
          <div style={{ animation: "fadeUp 0.45s ease forwards" }} data-testid="signinpage">
            {user ? <p style={S.small}>{J.loading}</p> : <AuthBox J={J} title={J.signInPageTitle} text={J.signInPageText} />}
            <button onClick={testFromJourney} style={{ ...S.quiet, width: "100%" }}>{J.back}</button>
          </div>
        )}

        {view === "care" && (
          <CareView T={T} J={J} user={user} loading={jLoading} walking={partners.filter((p) => user && p.partner === user.id)} overview={overview}
            shared={sharedWithMe} counsel={counsel} notes={notes} reload={reloadJourney} onBack={openJourney} />
        )}

        {view === "journey" && (
          <JourneyView partners={partners} notes={notes} onOpenCare={openCare} invites={invites} shared={sharedWithMe} counsel={counsel} inviteCode={inviteCode} onInviteDone={inviteDone}
            T={T} J={J} lang={lang} user={user} error={jError ? J.errorLoad : ""} recovery={recovery} onRecovered={() => setRecovery(false)} journey={journey} entries={entries} loading={jLoading}
            reload={reloadJourney} onBack={testFromJourney} onTest={testFromJourney} onStepSet={stepSet} askCompass={askCompass} />
        )}

        {view === "compass" && <>
        <ProgressDots stageIndex={stageIndex} />

        {crisis && (
          <div style={{ animation: "fadeUp 0.45s ease forwards" }}>
            <div role="alert" style={{ border: "1px solid #C9A84C66", borderRadius: 14, padding: "22px 22px", background: "#C9A84C0D", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 25, color: "#F0E6CC", marginBottom: 10 }}>{T.crisisTitle}</div>
              <p style={{ margin: 0, fontSize: 15.5, color: "#D4E0F0", lineHeight: 1.8 }}>{T.crisisText}</p>
            </div>
            <div style={{ border: "1px solid #7B9EBE33", borderRadius: 14, padding: "18px 22px", background: "#7B9EBE07", marginBottom: 20 }}>
              <p style={{ margin: "0 0 6px", fontSize: 16, color: "#B8C9E0", lineHeight: 1.8, fontStyle: "italic" }}>"{COME_UNTO_ME.text}"</p>
              <div style={{ fontSize: 13, color: "#7B9EBE" }}>{COME_UNTO_ME.ref} · KJV</div>
            </div>
            <button onClick={reset} style={{ width: "100%", background: "#C9A84C11", border: "1px solid #C9A84C55", borderRadius: 10, padding: "13px 20px", color: "#C9A84C", fontSize: 15, fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>
              {T.startOver}
            </button>
          </div>
        )}

        {/* Stage header */}
        {!crisis && <div key={stageIndex + lang} style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 28, animation: "fadeUp 0.45s ease forwards" }}>
          <CompassRose stageIndex={stageIndex} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <span style={{ fontFamily: "'Cormorant Garamond',serif", color: color, fontSize: 12.5, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                {T.stageWord} {stage.number}
              </span>
              <div style={{ height: 1, flex: 1, background: color + "33" }} />
            </div>
            <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontWeight: 400, fontSize: 27, margin: "0 0 7px", color: "#F0E6CC" }}>{stage.title}</h2>
            <p style={{ margin: "0 0 8px", fontSize: 13.5, color: "#7A8FAA", lineHeight: 1.6, fontStyle: "italic" }}>
              {stageIndex === 0 ? T.verse1 : stageIndex === 1 ? T.verse2 : T.verse3}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: "#8A9EC0", lineHeight: 1.6 }}>{stage.desc}</p>
          </div>
        </div>}

        {/* STAGE 1 */}
        {!crisis && stageIndex === 0 && (
          <div style={{ animation: "fadeUp 0.45s ease forwards" }}>
            {user && journey && jstate && !jstate.complete && (
              <button onClick={openJourney} data-testid="daybanner" style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid #2A3A5C", borderRadius: 12, padding: "12px 16px", background: "#0D1829", marginBottom: 18 }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: "#F0E6CC" }}>{fmt(J.dayOf, { n: jstate.day })} · <span style={{ color: { guided: "#C9A84C", compare: "#7B9EBE", self: "#82C9A0" }[jstate.mode] }}>{J.modes[jstate.mode]}</span></div>
                <div style={{ fontSize: 12.5, color: "#5A7090", marginTop: 3 }}>{J.modeHelp[jstate.mode]}</div>
              </button>
            )}
            {step && <StepCheck key={step.id} entry={step} J={J} onSet={stepSet} />}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: "#5A7090", textTransform: "uppercase", marginBottom: 8, fontFamily: "'Cormorant Garamond',serif" }}>
                {T.domainLabel}
              </label>
              <select value={domain} onChange={(e) => setDomain(e.target.value)}
                style={{ width: "100%", background: "#0D1829", border: "1px solid #1E2D4A", borderRadius: 8, padding: "12px 16px", color: domain ? "#D4E0F0" : "#4A6080", fontSize: 15, fontFamily: "'Lora',serif", cursor: "pointer", appearance: "none" }}>
                <option value="">{T.domainPlaceholder}</option>
                {T.domains.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: "#5A7090", textTransform: "uppercase", marginBottom: 8, fontFamily: "'Cormorant Garamond',serif" }}>
                {T.signalLabel}
              </label>
              <textarea value={signal} onChange={(e) => setSignal(e.target.value)}
                placeholder={T.signalPlaceholder} rows={5}
                style={{ width: "100%", background: "#0D1829", border: "1px solid #1E2D4A", borderRadius: 8, padding: "14px 16px", color: "#D4E0F0", fontSize: 15, fontFamily: "'Lora',serif", lineHeight: 1.7, resize: "vertical", transition: "border-color 0.2s" }} />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 11, letterSpacing: "0.15em", color: "#5A7090", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Cormorant Garamond',serif" }}>
                {T.pressureLabel}
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                {T.pressureOptions.map((opt) => (
                  <button key={opt.val} onClick={() => setPressure(opt.val)}
                    style={{ flex: 1, background: pressure === opt.val ? "#C9A84C15" : "#0D1829", border: "1px solid " + (pressure === opt.val ? "#C9A84C" : "#1E2D4A"), borderRadius: 10, padding: "13px 8px", cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                    <div style={{ fontSize: 13, color: pressure === opt.val ? "#C9A84C" : "#8A9EC0", marginBottom: 3, fontFamily: "'Lora',serif" }}>{opt.label}</div>
                    <div style={{ fontSize: 10.5, color: "#4A6080" }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {user && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#8A9EC0", marginBottom: 16, cursor: "pointer" }}>
                <input type="checkbox" checked={saveOn} onChange={(e) => setSaveOn(e.target.checked)} data-testid="saveon" /> {J.saveToJournal}
              </label>
            )}
            {user && saveOn && ownedPartners > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#7B9EBE", margin: "-6px 0 16px", cursor: "pointer" }}>
                <input type="checkbox" checked={shareOn} onChange={(e) => setShareOn(e.target.checked)} data-testid="shareon" /> {J.shareWithPartners}
              </label>
            )}

            {error && <p style={{ color: "#E07B6A", fontSize: 13.5, marginBottom: 14 }}>{error}</p>}

            <button onClick={runIdentification} disabled={loading}
              style={{ width: "100%", background: loading ? "#1A2840" : "#C9A84C11", border: "1px solid " + (loading ? "#1E2D4A" : "#C9A84C66"), borderRadius: 10, padding: "15px 24px", color: loading ? "#4A6080" : "#C9A84C", fontSize: 15, fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.12em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.3s", animation: loading ? "none" : "pulse 2.5s infinite", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {loading ? <><Spinner />{T.testing}</> : T.testBtn}
            </button>
          </div>
        )}

        {/* STAGE 2 */}
        {!crisis && stageIndex === 1 && selfOpen && (
          <div style={{ animation: "fadeUp 0.45s ease forwards" }}>
            <SelfTests T={T} J={J} my={myTests} setMy={(m) => { setMyTests(m); setError(""); }} onSubmit={submitSelf} error={error} />
            <button onClick={reset} style={{ ...S.quiet, width: "100%" }}>{T.startOver}</button>
          </div>
        )}

        {!crisis && stageIndex === 1 && !selfOpen && (analysisData || mySource) && (
          <div style={{ animation: "fadeUp 0.45s ease forwards" }}>
            {mySource && (
              <div data-testid="mysource" style={{ border: "1px solid " + SOURCE_COLOR[mySource] + "44", borderRadius: 14, padding: "18px 22px", background: SOURCE_COLOR[mySource] + "0A", marginBottom: 14, textAlign: "center" }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "#5A7090", textTransform: "uppercase", marginBottom: 7, fontFamily: "'Cormorant Garamond',serif" }}>{J.yourResult}</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 25, color: SOURCE_COLOR[mySource], fontWeight: 400 }}>{T.sources[mySource]}</div>
              </div>
            )}

            {analysisData && (
              <div style={{ border: "1px solid " + sourceColor + "44", borderRadius: 14, padding: "20px 22px", background: sourceColor + "0A", marginBottom: 26, textAlign: "center" }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "#5A7090", textTransform: "uppercase", marginBottom: 7, fontFamily: "'Cormorant Garamond',serif" }}>{mySource ? J.guideWord : T.sourceLabel}</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 27, color: sourceColor, fontWeight: 400, marginBottom: 9 }}>{T.sources[analysisData.source] || T.sources.unclear}</div>
                <p style={{ margin: 0, fontSize: 14.5, color: "#8A9EC0", lineHeight: 1.75, fontStyle: "italic" }}>
                  <TypingText text={analysisData.summary} />
                </p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {T.tests.map((t, i) => (
                <TestCard key={t.key + (analysisData ? "g" : "m")} label={t.label}
                  content={analysisData && analysisData.tests ? analysisData.tests[t.key] : (mySource ? { result: myTests[t.key] } : null)}
                  mine={analysisData && mySource ? myTests[t.key] : null} youLabel={J.you} question={J.testQ[t.key]}
                  index={i} aligned={T.aligned} misaligned={T.misaligned} unclear={T.unclear} />
              ))}
            </div>

            {analysisData && mySource && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#7B9EBE", lineHeight: 1.65, textAlign: "center" }}>{J.compareNote}</p>}

            {!analysisData && mySource && (
              <button onClick={askGuideTest} disabled={loading} data-testid="askguide" style={{ ...S.btn("#7B9EBE"), marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {loading ? <><Spinner color="#7B9EBE" />{T.testing}</> : J.askGuide}
              </button>
            )}

            <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "#5A7090", lineHeight: 1.65, fontStyle: "italic", textAlign: "center" }}>{T.humility}</p>

            {error && <p style={{ color: "#E07B6A", fontSize: 13.5, marginBottom: 14 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={reset}
                style={{ flexShrink: 0, background: "transparent", border: "1px solid #1E2D4A", borderRadius: 10, padding: "13px 18px", color: "#4A6080", fontSize: 14, fontFamily: "'Cormorant Garamond',serif", cursor: "pointer" }}>
                {T.startOver}
              </button>
              <button onClick={runResponse} disabled={loading}
                style={{ flex: 1, background: loading ? "#1A2840" : "#82C9A011", border: "1px solid " + (loading ? "#1E2D4A" : "#82C9A066"), borderRadius: 10, padding: "13px 20px", color: loading ? "#4A6080" : "#82C9A0", fontSize: 15, fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.1em", textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {loading ? <><Spinner color="#82C9A0" />{T.generating}</> : T.generateBtn}
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3 */}
        {!crisis && stageIndex === 2 && responseData && (
          <div style={{ animation: "fadeUp 0.45s ease forwards" }}>
            <div style={{ border: "1px solid #C9A84C33", borderRadius: 14, padding: "20px 22px", background: "#C9A84C07", marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "#8A7040", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Cormorant Garamond',serif" }}>{T.prayerLabels[responseData.stance] || T.prayerLabel}</div>
              <p style={{ margin: 0, fontSize: 16, color: "#D4C890", lineHeight: 1.85, fontStyle: "italic", fontFamily: "'Cormorant Garamond',serif" }}>"{responseData.prayer}"</p>
            </div>

            {responseData.found.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "#5A7090", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Cormorant Garamond',serif" }}>{T.scriptureLabel}</div>
                {T.kjvNote && <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "#5A7090", lineHeight: 1.6 }}>{T.kjvNote}</p>}
                {responseData.found.map((p) => <PassageCard key={p.label} p={p} T={T} />)}
              </div>
            )}

            <div style={{ border: "1px solid #82C9A033", borderRadius: 14, padding: "20px 22px", background: "#82C9A007", marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "#4A7A60", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Cormorant Garamond',serif" }}>{T.stepLabel}</div>
              <p style={{ margin: 0, fontSize: 16, color: "#82C9A0", lineHeight: 1.8, fontFamily: "'Cormorant Garamond',serif" }}>{responseData.step}</p>
            </div>

            {responseData.community && (
              <div style={{ border: "1px solid #7B9EBE33", borderRadius: 14, padding: "18px 22px", background: "#0D1829", marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.2em", color: "#5A7090", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Cormorant Garamond',serif" }}>{T.communityLabel}</div>
                <p style={{ margin: 0, fontSize: 14.5, color: "#B8C9E0", lineHeight: 1.7 }}>{responseData.community}</p>
              </div>
            )}

            <div style={{ borderRadius: 14, padding: "20px 22px", background: "#0D1829", border: "1px solid #2A3A5C", marginBottom: 16, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 15, color: "#8A9EC0", lineHeight: 1.85, fontStyle: "italic", fontFamily: "'Cormorant Garamond',serif" }}>{responseData.encouragement}</p>
            </div>

            <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "#5A7090", lineHeight: 1.65, fontStyle: "italic", textAlign: "center" }}>{T.humility}</p>

            <div style={{ borderRadius: 14, padding: "28px 24px", background: "#0A1520", border: "1px solid #C9A84C33", marginBottom: 16, textAlign: "center" }}>
              {saveMsg && <p data-testid="savemsg" style={{ margin: "0 0 14px", fontSize: 13, color: saveMsg === J.saved ? "#82C9A0" : "#E07B6A" }}>{saveMsg}</p>}
              <div style={{ fontSize: 10, letterSpacing: "0.28em", color: "#C9A84C77", textTransform: "uppercase", marginBottom: 12, fontFamily: "'Cormorant Garamond',serif" }}>
                {T.journeyTitle}
              </div>
              {DB.journeyAvailable && user && journey && jstate ? (
                <>
                  <p style={{ margin: "0 0 4px", fontSize: 20, color: "#F0E6CC", fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, lineHeight: 1.4 }}>{jstate.complete ? J.completeTitle : fmt(J.dayOf, { n: jstate.day })}</p>
                  <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "#6A80A0" }}>{fmt(J.practiced, { n: jstate.practised })}</p>
                  <button onClick={openJourney} style={{ ...S.btn("#C9A84C"), width: "auto", padding: "11px 24px", marginBottom: 18 }}>{J.openJourney}</button>
                </>
              ) : DB.journeyAvailable ? (
                <>
                  <p style={{ margin: "0 0 6px", fontSize: 20, color: "#F0E6CC", fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, lineHeight: 1.4 }}>{J.pitchTitle}</p>
                  <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "#6A80A0", lineHeight: 1.7 }}>{J.pitch}</p>
                  <button onClick={openJourney} data-testid="begin-cta" style={{ ...S.btn("#C9A84C"), width: "auto", padding: "11px 24px", marginBottom: 18 }}>{J.begin}</button>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 4px", fontSize: 20, color: "#F0E6CC", fontFamily: "'Cormorant Garamond',serif", fontWeight: 300, lineHeight: 1.4 }}>
                    {T.journeyLine1}
                  </p>
                  <p style={{ margin: "0 0 18px", fontSize: 15, color: "#C9A84C", fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic" }}>
                    {T.journeyLine2}
                  </p>
                </>
              )}
              <div style={{ width: 40, height: 1, background: "#C9A84C44", margin: "0 auto 18px" }} />
              <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#6A80A0", fontFamily: "'Lora',serif", lineHeight: 1.75 }}>
                {T.donateText}
              </p>
              <button onClick={() => window.open(DONATE_URL, "_blank", "noopener")}
                style={{ display: "inline-block", background: "#C9A84C11", border: "1px solid #C9A84C55", borderRadius: 10, padding: "12px 28px", color: "#C9A84C", fontSize: 13.5, fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}>
                {T.donateBtn}
              </button>
            </div>

            {error && <p style={{ color: "#E07B6A", fontSize: 13.5, marginBottom: 14 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStageIndex(1)}
                style={{ flexShrink: 0, background: "transparent", border: "1px solid #1E2D4A", borderRadius: 10, padding: "13px 18px", color: "#4A6080", fontSize: 14, fontFamily: "'Cormorant Garamond',serif", cursor: "pointer" }}>
                {T.back}
              </button>
              <button onClick={reset}
                style={{ flex: 1, background: "#C9A84C11", border: "1px solid #C9A84C55", borderRadius: 10, padding: "13px 20px", color: "#C9A84C", fontSize: 15, fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.3s" }}>
                {T.newSession}
              </button>
            </div>
          </div>
        )}

        </>}

        <div style={{ textAlign: "center", marginTop: 56, paddingTop: 20, borderTop: "1px solid #0F1E30" }}>
          <p style={{ fontSize: 11.5, color: "#2A3A5C", fontFamily: "'Cormorant Garamond',serif", letterSpacing: "0.1em", fontStyle: "italic" }}>
            {T.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
