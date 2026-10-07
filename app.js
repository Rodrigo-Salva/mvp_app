/* ============================================================
   SeñasYa - prototipo (HTML + CSS + JS vanilla)

   Módulos de este archivo (separados a propósito):
     1. DATOS         vocabulario, SIGNS, gestos y alfabeto del avatar
     2. ESTADO        estado en memoria (nada se guarda en disco)
     3. TRANSPORTE    comunicación entre tablets (BroadcastChannel)
     4. VOZ           voz a texto y texto a voz
     5. RECONOCIMIENTO  cámara + MediaPipe + recognizeSign()
     6. AVATAR        SignAvatar (manos y torso esquemáticos en SVG)
     7. INTERFAZ      pantallas, ajustes, chat, flujo de la sesión

   PRIVACIDAD: el video se procesa solo en el dispositivo. No se usa
   localStorage ni se envía nada a servidores. Todo vive en memoria y
   se borra con "Terminar y borrar conversación".
   ============================================================ */
'use strict';

/* ============================================================
   1. DATOS
   ============================================================ */

// Frases por escenario. Se pueden editar libremente.
// `animacion_id` apunta a ANIMS (secuencia de gestos del avatar).
const VOCABULARY = {
    reception: [
        { id: 'cita_sacar',   texto: 'Quiero sacar una cita.',        animacion_id: 'cita_sacar' },
        { id: 'cita_hoy',     texto: 'Tengo cita hoy.',               animacion_id: 'cita_hoy' },
        { id: 'cita_hora',    texto: '¿A qué hora es mi cita?',       animacion_id: 'cita_hora' },
        { id: 'cita_cambiar', texto: 'Necesito cambiar mi cita.',     animacion_id: 'cita_cambiar' },
        { id: 'especialista', texto: 'Necesito un especialista.',     animacion_id: 'especialista' },
        { id: 'ayuda_sordo',  texto: 'Soy sordo, necesito ayuda.',    animacion_id: 'ayuda_sordo' },
        { id: 'gracias',      texto: 'Gracias.',                      animacion_id: 'gracias' },
        { id: 'si',           texto: 'Sí.',                           animacion_id: 'si' },
        { id: 'no',           texto: 'No.',                           animacion_id: 'no' },
        { id: 'repita',       texto: 'Repita, por favor.',            animacion_id: 'repita' }
    ],
    consulting: [
        { id: 'dolor',          texto: 'Me duele aquí.',               animacion_id: 'dolor' },
        { id: 'fiebre',         texto: 'Tengo fiebre.',                animacion_id: 'fiebre' },
        { id: 'mareos',         texto: 'Tengo mareos.',                animacion_id: 'mareos' },
        { id: 'no_entiendo',    texto: 'No entiendo.',                 animacion_id: 'no_entiendo' },
        { id: 'grave',          texto: '¿Es grave?',                   animacion_id: 'grave' },
        { id: 'medicina_que',   texto: '¿Qué medicina debo tomar?',    animacion_id: 'medicina_que' },
        { id: 'cuando_vuelvo',  texto: '¿Cuándo vuelvo?',              animacion_id: 'cuando_vuelvo' },
        { id: 'alergia',        texto: 'Tengo alergia.',               animacion_id: 'alergia' },
        { id: 'gracias_doc',    texto: 'Gracias, doctor.',             animacion_id: 'gracias_doc' }
    ],
    pharmacy: [
        { id: 'recoger_med',        texto: 'Vengo a recoger mis medicinas.', animacion_id: 'recoger_med' },
        { id: 'receta',             texto: 'Tengo receta.',                  animacion_id: 'receta' },
        { id: 'costo',              texto: '¿Cuánto cuesta?',                animacion_id: 'costo' },
        { id: 'como_tomar',         texto: '¿Cómo se toma?',                 animacion_id: 'como_tomar' },
        { id: 'cada_horas',         texto: '¿Cada cuántas horas?',           animacion_id: 'cada_horas' },
        { id: 'otra_presentacion',  texto: '¿Tiene otra presentación?',      animacion_id: 'otra_presentacion' },
        { id: 'gracias',            texto: 'Gracias.',                       animacion_id: 'gracias' }
    ]
};

// Respuestas rápidas del personal (botones).
const STAFF_PHRASES = [
    { id: 'cita_a_las',  texto: 'Su cita es a las…',             animacion_id: 'cita_a_las' },
    { id: 'espere',      texto: 'Espere un momento, por favor.', animacion_id: 'espere' },
    { id: 'pase',        texto: 'Pase al consultorio.',          animacion_id: 'pase' },
    { id: 'firme',       texto: 'Firme aquí, por favor.',        animacion_id: 'firme' },
    { id: 'repetir',     texto: '¿Puede repetir?',               animacion_id: 'repetir_staff' },
    { id: 'escrito',     texto: 'Le explico por escrito.',       animacion_id: 'escrito' }
];

/* ------------------------------------------------------------
   SIGNS: señas que el clasificador por reglas puede reconocer.
   *** LÍMITE EXPLÍCITO ***
   No existe un modelo público de Lengua de Señas Peruana (LSP).
   Estas son "señas de demostración": formas de mano sencillas
   (qué dedos están extendidos) asociadas a una frase. NO son
   LSP real. Para producción, reemplazar `recognizeSign` por un
   modelo entrenado (p. ej. TensorFlow.js) con la comunidad sorda.

   Cada entrada: id, etiqueta_texto, descripcion_de_la_forma_de_mano,
   escenario, y `patron` = dedos extendidos en el orden
   [pulgar, índice, medio, anular, meñique] (1 = extendido, 0 = doblado).
   ------------------------------------------------------------ */
const SHAPES = {
    '11111': 'Mano abierta: los 5 dedos extendidos',
    '01000': 'Solo el índice extendido',
    '01100': 'Índice y medio extendidos (V)',
    '00000': 'Puño cerrado',
    '10000': 'Solo el pulgar extendido',
    '00001': 'Solo el meñique extendido',
    '11000': 'Pulgar e índice extendidos (L)',
    '10001': 'Pulgar y meñique extendidos (Y)',
    '01110': 'Índice, medio y anular extendidos',
    '01111': 'Cuatro dedos extendidos, pulgar doblado'
};
const SIGNS = [
    // Recepción
    { id: 'r1',  escenario: 'reception',  patron: '11111', etiqueta_texto: 'Quiero sacar una cita.' },
    { id: 'r2',  escenario: 'reception',  patron: '01000', etiqueta_texto: 'Tengo cita hoy.' },
    { id: 'r3',  escenario: 'reception',  patron: '01100', etiqueta_texto: '¿A qué hora es mi cita?' },
    { id: 'r4',  escenario: 'reception',  patron: '00000', etiqueta_texto: 'Necesito cambiar mi cita.' },
    { id: 'r5',  escenario: 'reception',  patron: '10000', etiqueta_texto: 'Sí.' },
    { id: 'r6',  escenario: 'reception',  patron: '00001', etiqueta_texto: 'No.' },
    { id: 'r7',  escenario: 'reception',  patron: '11000', etiqueta_texto: 'Soy sordo, necesito ayuda.' },
    { id: 'r8',  escenario: 'reception',  patron: '10001', etiqueta_texto: 'Gracias.' },
    { id: 'r9',  escenario: 'reception',  patron: '01110', etiqueta_texto: 'Necesito un especialista.' },
    { id: 'r10', escenario: 'reception',  patron: '01111', etiqueta_texto: 'Repita, por favor.' },
    // Consultorio
    { id: 'c1',  escenario: 'consulting', patron: '11111', etiqueta_texto: 'Me duele aquí.' },
    { id: 'c2',  escenario: 'consulting', patron: '01000', etiqueta_texto: 'Tengo fiebre.' },
    { id: 'c3',  escenario: 'consulting', patron: '01100', etiqueta_texto: 'Tengo mareos.' },
    { id: 'c4',  escenario: 'consulting', patron: '00000', etiqueta_texto: 'No entiendo.' },
    { id: 'c5',  escenario: 'consulting', patron: '10000', etiqueta_texto: '¿Es grave?' },
    { id: 'c6',  escenario: 'consulting', patron: '00001', etiqueta_texto: '¿Qué medicina debo tomar?' },
    { id: 'c7',  escenario: 'consulting', patron: '11000', etiqueta_texto: '¿Cuándo vuelvo?' },
    { id: 'c8',  escenario: 'consulting', patron: '10001', etiqueta_texto: 'Tengo alergia.' },
    { id: 'c9',  escenario: 'consulting', patron: '01110', etiqueta_texto: 'Gracias, doctor.' },
    // Farmacia
    { id: 'f1',  escenario: 'pharmacy',   patron: '11111', etiqueta_texto: 'Vengo a recoger mis medicinas.' },
    { id: 'f2',  escenario: 'pharmacy',   patron: '01000', etiqueta_texto: 'Tengo receta.' },
    { id: 'f3',  escenario: 'pharmacy',   patron: '01100', etiqueta_texto: '¿Cuánto cuesta?' },
    { id: 'f4',  escenario: 'pharmacy',   patron: '00000', etiqueta_texto: '¿Cómo se toma?' },
    { id: 'f5',  escenario: 'pharmacy',   patron: '10000', etiqueta_texto: '¿Cada cuántas horas?' },
    { id: 'f6',  escenario: 'pharmacy',   patron: '00001', etiqueta_texto: '¿Tiene otra presentación?' },
    { id: 'f7',  escenario: 'pharmacy',   patron: '10001', etiqueta_texto: 'Gracias.' }
].map(s => ({ ...s, descripcion_de_la_forma_de_mano: SHAPES[s.patron] }));

const signsFor = (escenario) => SIGNS.filter(s => s.escenario === escenario);

const SCENARIO_NAMES = { reception: 'Recepción', consulting: 'Consultorio', pharmacy: 'Farmacia' };
const FINGER_NAMES = ['Pulgar', 'Índice', 'Medio', 'Anular', 'Meñique'];

const normalizeText = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function findPhraseByText(text) {
    const t = normalizeText(text).replace(/[^a-z0-9 ]/g, '').trim();
    const all = [...STAFF_PHRASES, ...Object.values(VOCABULARY).flat()];
    return all.find(p => normalizeText(p.texto).replace(/[^a-z0-9 ]/g, '').trim() === t) || null;
}

/* ------------------------------------------------------------
   DATOS DEL AVATAR
   *** AVISO *** Las poses son ILUSTRATIVAS. No representan señas
   reales de LSP. Deben validarse con la comunidad sorda y con un
   intérprete certificado de LSP antes de cualquier uso real.

   Un brazo = [ángulo del brazo, ángulo del antebrazo, ángulo de la mano, forma de dedos].
   Ángulos en grados: 0 = hacia abajo, 90 = horizontal hacia afuera,
   180 = hacia arriba, >180 = cruza hacia el centro del cuerpo.
   ------------------------------------------------------------ */
const CURLS = {   // 0 = dedo extendido, 1 = dedo doblado. Orden: pulgar, índice, medio, anular, meñique
    open:   [0, 0, 0, 0, 0],
    relax:  [0.4, 0.4, 0.4, 0.4, 0.4],
    fist:   [0.7, 1, 1, 1, 1],
    point:  [0.8, 0, 1, 1, 1],
    pinch:  [0.2, 0.4, 0.1, 0.1, 0.1],
    flat:   [0.4, 0, 0, 0, 0],
    hook:   [0.3, 0.7, 0.7, 0.7, 0.7],
    ycurl:  [0, 1, 1, 1, 0]
};
const REST_ARM = [8, 4, 0, 'relax'];

// Cada gesto = lista de fotogramas [brazoA, brazoB]. Brazo A = derecha del avatar en pantalla.
const GESTOS = {
    reposo:   [[REST_ARM, REST_ARM]],
    saludo:   [[[60,170,180,'open'], REST_ARM], [[60,190,195,'open'], REST_ARM], [[60,170,170,'open'], REST_ARM]],
    yo:       [[[10,250,250,'point'], REST_ARM], [[10,245,245,'point'], REST_ARM]],
    tu:       [[[60,95,95,'point'], REST_ARM]],
    cita:     [[[30,110,110,'flat'], [30,110,110,'flat']], [[30,125,125,'flat'], [30,110,110,'flat']]],
    hoy:      [[[20,60,60,'flat'], [20,60,60,'flat']], [[20,75,75,'flat'], [20,75,75,'flat']]],
    hora:     [[[30,190,200,'point'], [25,110,110,'flat']], [[30,185,195,'point'], [25,110,110,'flat']]],
    pulso:    [[[30,190,200,'flat'], [25,110,110,'flat']], [[30,195,205,'flat'], [25,110,110,'flat']]],
    dolor:    [[[30,235,250,'point'], [30,235,250,'point']], [[30,225,235,'point'], [30,225,235,'point']]],
    fiebre:   [[[60,185,225,'open'], REST_ARM], [[60,180,220,'open'], REST_ARM]],
    mareo:    [[[70,190,160,'open'], [70,190,160,'open']], [[70,190,200,'open'], [70,190,200,'open']], [[70,190,160,'open'], [70,190,160,'open']]],
    gracias:  [[[0,205,215,'flat'], REST_ARM], [[40,160,160,'flat'], REST_ARM]],
    si:       [[[40,170,180,'fist'], REST_ARM], [[40,150,160,'fist'], REST_ARM], [[40,170,180,'fist'], REST_ARM]],
    no:       [[[40,170,160,'point'], REST_ARM], [[40,170,200,'point'], REST_ARM], [[40,170,160,'point'], REST_ARM]],
    entender: [[[60,190,190,'point'], REST_ARM], [[60,195,200,'point'], REST_ARM]],
    sordo:    [[[55,185,185,'point'], REST_ARM], [[30,215,230,'point'], REST_ARM]],
    pregunta: [[[50,150,150,'open'], REST_ARM], [[50,140,140,'open'], REST_ARM]],
    esperar:  [[[30,100,100,'open'], [30,100,100,'open']], [[30,105,105,'open'], [30,105,105,'open']]],
    firmar:   [[[30,100,120,'pinch'], [30,95,95,'flat']], [[30,105,130,'pinch'], [30,95,95,'flat']]],
    pase:     [[[60,100,95,'open'], REST_ARM], [[60,100,95,'hook'], REST_ARM], [[60,100,95,'open'], REST_ARM]],
    medicina: [[[30,200,200,'pinch'], REST_ARM], [[30,190,190,'pinch'], REST_ARM]],
    dinero:   [[[30,120,120,'pinch'], REST_ARM], [[30,120,125,'open'], REST_ARM]],
    repetir:  [[[40,150,140,'open'], REST_ARM], [[40,150,170,'open'], REST_ARM], [[40,150,200,'open'], REST_ARM]],
    cambiar:  [[[30,110,110,'fist'], [30,110,110,'fist']], [[30,95,95,'fist'], [30,125,125,'fist']]],
    ayuda:    [[[30,120,120,'flat'], [30,120,120,'flat']], [[30,95,95,'flat'], [30,95,95,'flat']]],
    alergia:  [[[40,200,210,'hook'], [25,110,110,'flat']], [[40,205,220,'hook'], [25,110,110,'flat']]],
    grave:    [[[30,120,120,'fist'], [30,120,120,'fist']], [[30,110,110,'fist'], [30,130,130,'fist']]]
};

// Secuencias de gestos por `animacion_id`.
const ANIMS = {
    cita_sacar: ['yo', 'cita'],
    cita_hoy: ['yo', 'cita', 'hoy'],
    cita_hora: ['cita', 'hora', 'pregunta'],
    cita_cambiar: ['yo', 'cita', 'cambiar'],
    especialista: ['yo', 'ayuda', 'pulso'],
    ayuda_sordo: ['yo', 'sordo', 'ayuda'],
    gracias: ['gracias'],
    si: ['si'],
    no: ['no'],
    repita: ['repetir', 'pregunta'],
    dolor: ['yo', 'dolor'],
    fiebre: ['yo', 'fiebre'],
    mareos: ['yo', 'mareo'],
    no_entiendo: ['no', 'entender'],
    grave: ['grave', 'pregunta'],
    medicina_que: ['medicina', 'pregunta'],
    cuando_vuelvo: ['yo', 'hora', 'pregunta'],
    alergia: ['yo', 'alergia'],
    gracias_doc: ['pulso', 'gracias'],
    recoger_med: ['yo', 'medicina', 'ayuda'],
    receta: ['yo', 'firmar'],
    costo: ['dinero', 'pregunta'],
    como_tomar: ['medicina', 'pregunta'],
    cada_horas: ['hora', 'repetir', 'pregunta'],
    otra_presentacion: ['medicina', 'cambiar', 'pregunta'],
    cita_a_las: ['cita', 'hora'],
    espere: ['esperar'],
    pase: ['pase'],
    firme: ['firmar'],
    repetir_staff: ['repetir', 'pregunta'],
    escrito: ['yo', 'firmar']
};

// Palabras sueltas con gesto (para respuestas habladas o escritas libres).
// Cualquier palabra que no esté aquí se DELETREA con el alfabeto dactilológico.
const WORD_GESTOS = {
    hola: 'saludo', buenos: 'saludo', buenas: 'saludo', dias: 'saludo', tardes: 'saludo',
    cita: 'cita', hora: 'hora', horas: 'hora', gracias: 'gracias', si: 'si', no: 'no',
    espere: 'esperar', esperar: 'esperar', momento: 'esperar', pase: 'pase', pasar: 'pase',
    firme: 'firmar', firmar: 'firmar', receta: 'firmar', dolor: 'dolor', duele: 'dolor',
    fiebre: 'fiebre', medicina: 'medicina', medicinas: 'medicina', pastilla: 'medicina', pastillas: 'medicina',
    doctor: 'pulso', doctora: 'pulso', medico: 'pulso', repita: 'repetir', repetir: 'repetir',
    ayuda: 'ayuda', ayudar: 'ayuda', cuesta: 'dinero', precio: 'dinero', soles: 'dinero', pagar: 'dinero',
    mareo: 'mareo', mareos: 'mareo', alergia: 'alergia', entiende: 'entender', entiendo: 'entender',
    cambiar: 'cambiar', hoy: 'hoy', usted: 'tu', tu: 'tu', yo: 'yo', mi: 'yo'
};

// Alfabeto dactilológico ILUSTRATIVO: forma de los 5 dedos por letra (0 extendido, 1 doblado).
const LETRAS = {
    a: [0,1,1,1,1], b: [0.8,0,0,0,0], c: [0.3,0.4,0.4,0.4,0.4], d: [0.5,0,0.8,0.8,0.8],
    e: [0.7,0.9,0.9,0.9,0.9], f: [0.5,0.6,0,0,0], g: [0,0,1,1,1], h: [0.5,0,0,1,1],
    i: [0.8,1,1,1,0], j: [0.8,1,1,1,0], k: [0,0,0,1,1], l: [0,0,1,1,1], m: [0.8,0.9,0.9,0.9,1],
    n: [0.8,0.9,0.9,1,1], o: [0.5,0.5,0.5,0.5,0.5], p: [0,0,0.2,1,1], q: [0,0,1,1,1],
    r: [0.8,0,0.1,1,1], s: [0.8,1,1,1,1], t: [0.4,0.9,1,1,1], u: [0.8,0,0,1,1], v: [0.8,0,0.05,1,1],
    w: [0.8,0,0,0,1], x: [0.8,0.6,1,1,1], y: [0,1,1,1,0], z: [0.8,0,1,1,1]
};

/* ============================================================
   2. ESTADO (solo en memoria)
   ============================================================ */
const S = {
    role: null,               // 'patient' | 'staff' | 'both'
    scenario: 'reception',
    active: false,
    conversation: [],         // [{from, text, ts}] -> se borra al terminar
    settings: { fontSize: 'normal', highContrast: false, avatarSpeed: 1, voiceLang: 'es-PE', tts: true },
    // paciente
    pending: null,            // seña esperando confirmación
    cooldownUntil: 0,
    camToken: 0, camRunning: false, stream: null, hands: null,
    avatar: null, lastStaff: null,
    // personal
    recognition: null, listening: false, retriedLang: false,
    // conexión
    peerSeen: 0, peerRole: null, peerSynced: false, pingTimer: null
};
const hasPatient = () => S.role === 'patient' || S.role === 'both';
const hasStaff = () => S.role === 'staff' || S.role === 'both';
const $ = (id) => document.getElementById(id);

/* ============================================================
   3. TRANSPORTE ENTRE TABLETS
   ------------------------------------------------------------
   Toda la comunicación entre Tablet A (paciente) y Tablet B
   (personal) pasa por este objeto. Hoy usa BroadcastChannel, que
   solo comunica pestañas del MISMO navegador y equipo (para
   probar con dos pestañas).

   >>> PARA USAR WEBSOCKET EN PRODUCCIÓN: reemplaza el contenido de
   >>> `open()` y `send()`. Crea `new WebSocket('wss://servidor/sala/123')`,
   >>> envía con ws.send(JSON.stringify(msg)) y en ws.onmessage llama a
   >>> `dispatch(JSON.parse(e.data))`. El resto de la app no cambia.
   >>> (Con datos de salud: usar wss://, autenticación y cifrado.)

   Mensajes: PING, PATIENT_MSG, STAFF_MSG, SCENARIO, CLEAR, END_SESSION.
   ============================================================ */
const Transport = (() => {
    let channel = null;
    let listener = () => {};
    let loopback = false;   // en modo "ambas vistas" los mensajes también vuelven a esta pestaña

    function open(onMessage, useLoopback) {
        listener = onMessage;
        loopback = !!useLoopback;
        if (!channel && 'BroadcastChannel' in window) {
            channel = new BroadcastChannel('senasya_v1');   // <-- aquí iría el WebSocket
            channel.onmessage = (e) => dispatch(e.data);
        }
        return !!channel;
    }
    function send(type, payload = {}) {
        const msg = { type, payload, ts: Date.now() };
        if (channel) channel.postMessage(msg);                // <-- y aquí ws.send(...)
        if (loopback) setTimeout(() => dispatch(msg), 0);
    }
    function dispatch(msg) { if (msg && msg.type) listener(msg); }
    function close() { if (channel) { channel.close(); channel = null; } }
    return { open, send, close };
})();

function onTransportMessage({ type, payload }) {
    if (!S.active) return;
    switch (type) {
        case 'PING':
            // Solo cuenta como conectado un par complementario (paciente <-> personal)
            if (payload.role === S.role && S.role !== 'both') break;
            S.peerSeen = Date.now(); S.peerRole = payload.role;
            // El personal adopta el área del paciente la primera vez que se conectan
            if (S.role === 'staff' && payload.role === 'patient' && !S.peerSynced) {
                S.peerSynced = true;
                if (payload.scenario !== S.scenario) setScenario(payload.scenario, false);
            }
            updateLinkStatus();
            break;
        case 'PATIENT_MSG': if (hasStaff()) receivePatientMessage(payload); break;
        case 'STAFF_MSG':   if (hasPatient()) receiveStaffMessage(payload); break;
        case 'SCENARIO':    setScenario(payload.scenario, false); break;
        case 'CLEAR':       clearHistory(false); break;
        case 'END_SESSION': endSession(false); break;
    }
}

function updateLinkStatus() {
    const connected = S.role === 'both' || (Date.now() - S.peerSeen < 8000);
    if (!connected) S.peerSynced = false;
    const textP = connected ? '🔗 Conectado con el personal' : '⏳ Esperando al personal…';
    const textS = connected ? '🔗 Conectado con el paciente' : '⏳ Esperando al paciente…';
    $('link-status-patient').textContent = textP;
    $('link-status-staff').textContent = textS;
}

/* ============================================================
   4. VOZ (voz a texto y texto a voz)
   ============================================================ */
function pickVoice(lang) {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    const exact = voices.find(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
    return exact || voices.find(v => v.lang.toLowerCase().startsWith('es')) || null;
}

function speak(text) {
    if (!('speechSynthesis' in window)) { showMessage('Este navegador no puede leer en voz alta. Lee el texto en pantalla.'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = S.settings.voiceLang;
    const v = pickVoice(S.settings.voiceLang);
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
}

function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = $('btn-mic');
    if (!SR) {
        mic.disabled = true;
        $('mic-status').textContent = '🚫 Voz no disponible en este navegador. Escribe la respuesta.';
        showMessage('Este navegador no entiende la voz. Usa Chrome, o escribe la respuesta abajo.', true);
        return;
    }
    const rec = new SR();
    rec.lang = S.settings.voiceLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setMicState(true);
    rec.onend = () => setMicState(false);
    rec.onresult = (e) => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t; else interim += t;
        }
        $('mic-live').textContent = interim || final;
        if (final.trim()) { sendToPatient(final.trim()); $('mic-live').textContent = ''; }
    };
    rec.onerror = (e) => {
        setMicState(false);
        const msgs = {
            'not-allowed': 'No tenemos permiso para usar el micrófono. Permítelo en el navegador, o escribe la respuesta.',
            'service-not-allowed': 'No tenemos permiso para usar el micrófono. Permítelo en el navegador, o escribe la respuesta.',
            'audio-capture': 'No se encontró un micrófono. Conéctalo, o escribe la respuesta.',
            'no-speech': 'No se escuchó nada. Toca el micrófono e intenta otra vez.',
            'network': 'La voz necesita internet en este navegador. Escribe la respuesta.'
        };
        if (e.error === 'language-not-supported' && !S.retriedLang) {
            S.retriedLang = true; rec.lang = 'es-ES';       // respaldo es-ES
            showMessage('Se usará español de España para la voz.');
            return;
        }
        if (e.error !== 'aborted') showMessage(msgs[e.error] || 'No se pudo escuchar. Escribe la respuesta.', true);
    };
    S.recognition = rec;
}

function toggleMic() {
    const rec = S.recognition;
    if (!rec) return;
    if (S.listening) { rec.stop(); return; }
    rec.lang = S.retriedLang ? 'es-ES' : S.settings.voiceLang;
    try { rec.start(); } catch (err) { /* ya estaba iniciado */ }
}

function setMicState(on) {
    S.listening = on;
    const b = $('btn-mic');
    b.classList.toggle('recording', on);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '⏹' : '🎤';
    $('mic-status').textContent = on ? '🔴 Escuchando… habla ahora' : 'Toca para hablar';
}

/* ============================================================
   5. RECONOCIMIENTO DE SEÑAS (cámara + MediaPipe Hands)
   ============================================================ */

const dist = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* ------------------------------------------------------------
   recognizeSign(landmarks, signs, aspect)

   INTERFAZ (para poder cambiarla por un modelo TensorFlow.js sin
   tocar el resto de la app):
     entrada : landmarks = arreglo de 21 puntos {x,y,z} de MediaPipe
               signs     = señas candidatas (del escenario activo)
               aspect    = ancho/alto del video (corrige distancias)
     salida  : { signId, texto, confidence, fingers, patron }
               - signId/texto = null si la forma no coincide con ninguna seña
               - confidence   = 0..1
               - fingers      = [bool x5] pulgar..meñique
     Un modelo entrenado devolvería el mismo objeto: así el resto
     (estabilizador, confirmación, envío) no cambia.

   MÉTODO (por reglas): un dedo está extendido si la punta está más
   lejos de la muñeca que su articulación media. No depende de la
   orientación de la mano. Para el pulgar se compara con la base del
   meñique. La confianza sale de qué tan lejos del umbral está cada dedo.
   *** Solo reconoce formas de mano estáticas de SIGNS. No es LSP real. ***
   ------------------------------------------------------------ */
function recognizeSign(landmarks, signs, aspect = 4 / 3) {
    if (!landmarks || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const THRESH = 1.15, SPREAD = 0.3;

    // [punta, articulación media] de índice, medio, anular, meñique
    const fingerJoints = [[8, 6], [12, 10], [16, 14], [20, 18]];
    const ratios = [dist(landmarks[4], landmarks[17], aspect) / Math.max(dist(landmarks[2], landmarks[17], aspect), 1e-6)];
    fingerJoints.forEach(([tip, pip]) => {
        ratios.push(dist(landmarks[tip], wrist, aspect) / Math.max(dist(landmarks[pip], wrist, aspect), 1e-6));
    });

    const fingers = ratios.map(r => r > THRESH);
    const confidence = ratios.reduce((acc, r) => acc + clamp01(Math.abs(r - THRESH) / SPREAD), 0) / ratios.length;
    const patron = fingers.map(f => (f ? '1' : '0')).join('');

    const match = signs.find(s => s.patron === patron);
    return {
        signId: match ? match.id : null,
        texto: match ? match.etiqueta_texto : null,
        confidence, fingers, patron
    };
}

/* Estabilizador: una seña solo se propone si se mantiene N cuadros seguidos.
   Así un gesto de paso o un parpadeo de la detección no envía nada. */
function createStabilizer(frames = 10, minConfidence = 0.45) {
    let id = null, count = 0, confSum = 0;
    return {
        reset() { id = null; count = 0; confSum = 0; },
        push(res) {
            if (!res || !res.signId || res.confidence < minConfidence) { id = null; count = 0; confSum = 0; return { progress: 0, fired: null }; }
            if (res.signId === id) { count++; confSum += res.confidence; }
            else { id = res.signId; count = 1; confSum = res.confidence; }
            const progress = Math.min(1, count / frames);
            if (count >= frames) {
                const fired = { signId: id, texto: res.texto, confidence: confSum / count };
                id = null; count = 0; confSum = 0;
                return { progress: 1, fired };
            }
            return { progress, fired: null };
        }
    };
}
const stabilizer = createStabilizer();

function setCameraStatus(text) { $('camera-status').textContent = text; $('camera-status').classList.remove('hidden'); }

async function startCamera() {
    const token = ++S.camToken;
    const video = $('input-video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('🚫 Cámara no disponible. Usa el modo demostración.');
        showMessage('Este navegador no permite usar la cámara. Abre la página con localhost o https. Puedes seguir con el modo demostración.', true);
        return;
    }
    setCameraStatus('📷 Pidiendo permiso de cámara…');
    try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
    } catch (err) {
        const msg = (err.name === 'NotAllowedError' || err.name === 'SecurityError')
            ? 'No pudimos usar la cámara porque no se dio permiso. Permítela en el navegador. Mientras tanto usa el modo demostración.'
            : (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')
                ? 'No se encontró una cámara en este equipo. Usa el modo demostración.'
                : 'No se pudo abrir la cámara (puede estar en uso por otra aplicación). Usa el modo demostración.';
        setCameraStatus('🚫 Sin cámara. Usa el modo demostración.');
        showMessage(msg, true);
        return;
    }
    if (token !== S.camToken) { stopCamera(); return; }      // la sesión terminó mientras esperábamos
    video.srcObject = S.stream;
    try { await video.play(); } catch (e) { /* se reintenta con los cuadros */ }

    if (typeof Hands === 'undefined') {
        setCameraStatus('⚠ Detector de manos no cargado (sin internet). Usa el modo demostración.');
        showMessage('No se pudo cargar el detector de manos (necesita internet la primera vez). Usa el modo demostración.', true);
        return;
    }
    try {
        setCameraStatus('⏳ Cargando detector de manos…');
        const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
        hands.onResults(onHandResults);
        await hands.initialize();
        if (token !== S.camToken) { hands.close(); return; }
        S.hands = hands;
        S.camRunning = true;
        $('camera-status').classList.add('hidden');
        const loop = async () => {
            if (!S.camRunning || token !== S.camToken) return;
            try { if (video.readyState >= 2) await hands.send({ image: video }); } catch (e) { console.error(e); }
            requestAnimationFrame(loop);
        };
        loop();
    } catch (err) {
        console.error(err);
        setCameraStatus('⚠ No se pudo iniciar el detector. Usa el modo demostración.');
        showMessage('No se pudo iniciar el detector de manos. Usa el modo demostración.', true);
    }
}

function stopCamera() {
    S.camToken++;
    S.camRunning = false;
    if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
    if (S.hands) { try { S.hands.close(); } catch (e) { /* nada */ } S.hands = null; }
    const v = $('input-video'); if (v) v.srcObject = null;
    const c = $('output-canvas'); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function onHandResults(results) {
    const canvas = $('output-canvas');
    const ctx = canvas.getContext('2d');
    if (results.image && canvas.width !== results.image.width) { canvas.width = results.image.width; canvas.height = results.image.height; }
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    const lm = results.multiHandLandmarks && results.multiHandLandmarks[0];
    if (lm && typeof drawConnectors !== 'undefined') {
        drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7ee0c3', lineWidth: 4 });
        drawLandmarks(ctx, lm, { color: '#ffffff', fillColor: '#0b6e8a', lineWidth: 2, radius: 4 });
    }
    ctx.restore();

    const res = lm ? recognizeSign(lm, signsFor(S.scenario), canvas.width / canvas.height) : null;
    let progress = 0;
    if (!S.pending && Date.now() >= S.cooldownUntil) {
        const out = stabilizer.push(res);
        progress = out.progress;
        if (out.fired) proposeSign(out.fired.texto, out.fired.confidence);
    } else {
        stabilizer.reset();
    }
    updateLiveBox(res, progress);
}

function updateLiveBox(res, progress) {
    const box = $('live-fingers');
    box.innerHTML = '';
    FINGER_NAMES.forEach((name, i) => {
        const on = res ? res.fingers[i] : false;
        const chip = document.createElement('span');
        chip.className = 'finger-chip' + (on ? ' on' : '');
        chip.textContent = `${on ? '✔' : '✘'} ${name}`;
        box.appendChild(chip);
    });
    $('live-progress').value = Math.round(progress * 100);
    let label = '🖐 Sin mano a la vista';
    if (res && res.signId) label = `✔ ${res.texto} (${Math.round(res.confidence * 100)}%)`;
    else if (res) label = '❔ Forma de mano sin seña asignada';
    $('live-label').textContent = label;
}

/* ---------- Confirmación antes de enviar ---------- */
function proposeSign(texto, confidence) {
    if (S.pending) return;
    S.pending = { texto, confidence };
    const p = $('confirm-text');
    p.textContent = '';
    p.append('¿Quisiste decir: ');
    const em = document.createElement('em'); em.textContent = texto; p.appendChild(em);
    p.append('?');
    const pct = Math.round(confidence * 100);
    $('confirm-confidence').value = pct;
    $('confirm-confidence-label').textContent = `${pct}% (${pct >= 75 ? 'alta' : pct >= 55 ? 'media' : 'baja'})`;
    $('confirm-panel').classList.remove('hidden');
    $('sent-status').classList.add('hidden');
    $('btn-confirm-yes').focus();
}

function resolveConfirmation(accepted) {
    if (!S.pending) return;
    const { texto } = S.pending;
    S.pending = null;
    S.cooldownUntil = Date.now() + 2500;
    stabilizer.reset();
    $('confirm-panel').classList.add('hidden');
    if (accepted) sendPatientMessage(texto);
    else {
        $('patient-current-text').textContent = 'Entendido, no se envió. Intenta otra vez.';
        $('sent-status').classList.add('hidden');
    }
}

function sendPatientMessage(texto) {
    $('patient-current-text').textContent = texto;
    const st = $('sent-status');
    st.textContent = '✔ Enviado al personal';
    st.classList.remove('hidden');
    Transport.send('PATIENT_MSG', { text: texto });
}

/* ============================================================
   6. AVATAR DE SEÑAS: SignAvatar
   ------------------------------------------------------------
   Componente que recibe una lista de pasos (ver buildSteps) y los
   reproduce en secuencia con requestAnimationFrame, interpolando
   las poses. Dibuja torso, cabeza, dos brazos y dos manos de 5 dedos
   en SVG.

   Controles: play(), pause(), replay(), setSpeed(0.5 | 1 | 1.5).

   *** Las poses son ILUSTRATIVAS. Deben validarse con la comunidad
   *** sorda y un intérprete certificado de LSP antes de cualquier uso real.
   La app muestra SIEMPRE el subtítulo junto al avatar.

   Una pose = arreglo de 16 números:
     [uA,fA,rA, uB,fB,rB, 5 curvaturas mano A, 5 curvaturas mano B]
   ============================================================ */
const SVG_NS = 'http://www.w3.org/2000/svg';
const rad = (d) => d * Math.PI / 180;
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

function makePose(armA, armB) {
    return [armA[0], armA[1], armA[2], armB[0], armB[1], armB[2], ...CURLS[armA[3]], ...CURLS[armB[3]]];
}
const REST_POSE = makePose(REST_ARM, REST_ARM);

/* Convierte un texto (o un animacion_id) en la lista de pasos del avatar.
   - Si hay animacion_id conocido: usa su secuencia de gestos.
   - Si no: recorre las palabras; con gesto conocido lo usa, si no DELETREA. */
function buildSteps(text, animId) {
    const steps = [];
    const addGesto = (name) => (GESTOS[name] || []).forEach(fr => {
        steps.push({ pose: makePose(fr[0], fr[1]), label: `Seña: ${name.toUpperCase()}`, dur: 750 });
    });
    const fingerspell = (word) => {
        [...word].forEach(ch => {
            if (!LETRAS[ch]) return;
            const curls = LETRAS[ch];
            steps.push({
                pose: [40, 165, 180, 8, 4, 0, ...curls, ...CURLS.relax],
                label: `Deletreo: ${word.toUpperCase()} · letra ${ch.toUpperCase()}`, letter: ch.toUpperCase(), dur: 520
            });
        });
    };
    if (animId && ANIMS[animId]) {
        ANIMS[animId].forEach(addGesto);
    } else {
        const words = normalizeText(text).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
        words.forEach(w => { if (WORD_GESTOS[w]) addGesto(WORD_GESTOS[w]); else fingerspell(w); });
    }
    const MAX = 60;                                         // evita secuencias interminables
    if (steps.length > MAX) steps.length = MAX;
    steps.push({ pose: REST_POSE, label: 'Fin', dur: 500 });
    return steps;
}

class SignAvatar {
    constructor(container, { onStep, onState } = {}) {
        this.container = container;
        this.onStep = onStep || (() => {});
        this.onState = onState || (() => {});
        this.speed = 1;
        this.steps = []; this.idx = 0; this.elapsed = 0;
        this.from = REST_POSE.slice(); this.current = REST_POSE.slice();
        this.state = 'idle';       // idle | playing | paused
        this.raf = 0; this.last = 0;
        this._build();
        this._render(this.current);
    }

    /* ---- Dibujo base en SVG ---- */
    _el(tag, attrs, parent) {
        const e = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
        (parent || this.svg).appendChild(e);
        return e;
    }
    _build() {
        this.container.innerHTML = '';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 360 300');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Avatar esquemático que muestra señas. Animación ilustrativa.');
        this.container.appendChild(svg);
        this.svg = svg;

        this._el('rect', { class: 'av-skin', x: 168, y: 88, width: 24, height: 40 });   // cuello
        this._el('rect', { class: 'av-body', x: 128, y: 118, width: 104, height: 200, rx: 30 });
        this._el('circle', { class: 'av-skin av-outline', cx: 180, cy: 64, r: 34 });
        this._el('circle', { class: 'av-face', cx: 168, cy: 58, r: 3.5 });
        this._el('circle', { class: 'av-face', cx: 192, cy: 58, r: 3.5 });
        this._el('path', { class: 'av-outline', d: 'M168 76 Q180 86 192 76' });
        this.mouthHint = null;

        this.arms = [{ shX: 225, sx: 1 }, { shX: 135, sx: -1 }].map(a => {
            const arm = { ...a };
            arm.upper = this._el('line', { class: 'av-sleeve', 'stroke-width': 22, x1: a.shX, y1: 140, x2: a.shX, y2: 200 });
            arm.fore = this._el('line', { class: 'av-arm', 'stroke-width': 14 });
            arm.fingers = [0, 1, 2, 3, 4].map(() => this._el('line', { class: 'av-finger', 'stroke-width': 6 }));
            arm.palm = this._el('circle', { class: 'av-skin', r: 11 });
            return arm;
        });
        this.letter = this._el('text', { class: 'av-letter', x: 40, y: 80, 'text-anchor': 'middle' });
    }

    /* ---- Dibuja una pose (16 números) ---- */
    _render(p) {
        const FINGER_OFF = [50, 20, 0, -18, -36];       // abanico de dedos
        const FINGER_LEN = [13, 17, 19, 17, 13];
        this.arms.forEach((arm, k) => {
            const u = p[k * 3], f = p[k * 3 + 1], r = p[k * 3 + 2];
            const curls = p.slice(6 + k * 5, 11 + k * 5);
            const sx = arm.sx;
            const ex = arm.shX + sx * 62 * Math.sin(rad(u)), ey = 140 + 62 * Math.cos(rad(u));
            const wx = ex + sx * 58 * Math.sin(rad(f)),      wy = ey + 58 * Math.cos(rad(f));
            arm.upper.setAttribute('x2', ex); arm.upper.setAttribute('y2', ey);
            arm.fore.setAttribute('x1', ex);  arm.fore.setAttribute('y1', ey);
            arm.fore.setAttribute('x2', wx);  arm.fore.setAttribute('y2', wy);
            const pcx = wx + sx * 7 * Math.sin(rad(r)), pcy = wy + 7 * Math.cos(rad(r));
            arm.palm.setAttribute('cx', pcx); arm.palm.setAttribute('cy', pcy);
            arm.fingers.forEach((line, i) => {
                const a = rad(r + FINGER_OFF[i]);
                const len = FINGER_LEN[i] * (1 - 0.72 * curls[i]);
                line.setAttribute('x1', pcx); line.setAttribute('y1', pcy);
                line.setAttribute('x2', pcx + sx * len * Math.sin(a));
                line.setAttribute('y2', pcy + len * Math.cos(a));
            });
        });
    }

    /* ---- Control de reproducción ---- */
    load(steps) {
        this._stopLoop();
        this.steps = steps; this.idx = 0; this.elapsed = 0;
        this.from = this.current.slice();
        this._setLetter(steps[0]);
        this.onStep(0, steps[0]);
    }
    play() {
        if (!this.steps.length) return;
        if (this.state === 'idle') { this.idx = 0; this.elapsed = 0; this.from = REST_POSE.slice(); this.current = REST_POSE.slice(); this.onStep(0, this.steps[0]); }
        this.state = 'playing'; this.last = performance.now();
        this.onState(this.state);
        this.raf = requestAnimationFrame((t) => this._tick(t));
    }
    pause() { if (this.state !== 'playing') return; this.state = 'paused'; this._stopLoop(); this.onState(this.state); }
    replay() { this._stopLoop(); this.state = 'idle'; this.play(); }
    setSpeed(x) { this.speed = x; }
    stop() { this._stopLoop(); this.state = 'idle'; this.steps = []; this.current = REST_POSE.slice(); this._render(this.current); this._setLetter(null); this.onState(this.state); }
    _stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    _setLetter(step) { this.letter.textContent = step && step.letter ? step.letter : ''; }

    _tick(now) {
        if (this.state !== 'playing') return;
        const dt = Math.min(64, now - this.last) * this.speed;
        this.last = now;
        this.elapsed += dt;
        const step = this.steps[this.idx];
        const moveTime = step.dur * 0.55;               // 55% se mueve, 45% se mantiene la pose
        const k = easeInOut(Math.min(1, this.elapsed / moveTime));
        this.current = this.from.map((v, i) => lerp(v, step.pose[i], k));
        this._render(this.current);
        if (this.elapsed >= step.dur) {
            this.from = step.pose; this.idx++; this.elapsed = 0;
            if (this.idx >= this.steps.length) {
                this.state = 'idle'; this._setLetter(null); this.onState(this.state);
                return;
            }
            this._setLetter(this.steps[this.idx]);
            this.onStep(this.idx, this.steps[this.idx]);
        }
        this.raf = requestAnimationFrame((t) => this._tick(t));
    }
}

/* ============================================================
   7. INTERFAZ Y FLUJO DE LA SESIÓN
   ============================================================ */
let toastTimer = 0;
function showMessage(msg, isError = false) {
    const t = $('toast');
    t.textContent = (isError ? '⚠ ' : 'ℹ ') + msg;
    t.classList.toggle('error', isError);
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 6000);
}

function setScenario(scenario, broadcast = true) {
    if (!SCENARIO_NAMES[scenario]) return;
    S.scenario = scenario;
    $('scenario-patient').value = scenario;
    $('scenario-staff').value = scenario;
    if (hasPatient()) renderPatientPhrases();
    if (broadcast) Transport.send('SCENARIO', { scenario });
    S.pending = null;
    $('confirm-panel').classList.add('hidden');
    stabilizer.reset();
}

function renderPatientPhrases() {
    // Modo demostración: simula que la cámara reconoció la seña (pide confirmación)
    const demo = $('demo-signs'); demo.innerHTML = '';
    signsFor(S.scenario).forEach(sign => {
        const b = document.createElement('button');
        b.className = 'demo-sign';
        const strong = document.createElement('strong'); strong.textContent = sign.etiqueta_texto;
        const sm = document.createElement('span'); sm.textContent = '✋ ' + sign.descripcion_de_la_forma_de_mano;
        b.append(strong, sm);
        b.addEventListener('click', () => proposeSign(sign.etiqueta_texto, 0.8 + Math.random() * 0.15));
        demo.appendChild(b);
    });
    // Frases rápidas: respaldo directo (sin confirmación, el paciente elige el texto)
    const quick = $('patient-quick-phrases'); quick.innerHTML = '';
    VOCABULARY[S.scenario].forEach(p => {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = p.texto;
        b.addEventListener('click', () => sendPatientMessage(p.texto));
        quick.appendChild(b);
    });
}

function initPatient() {
    $('patient-current-text').textContent = 'Haz una seña frente a la cámara o usa una frase.';
    $('sent-status').classList.add('hidden');
    $('staff-response-text').textContent = '(Esperando respuesta…)';
    $('avatar-gloss').textContent = 'Seña: —';
    updateLiveBox(null, 0);
    S.avatar = new SignAvatar($('sign-avatar-container'), {
        onStep: (i, step) => { $('avatar-gloss').textContent = step ? step.label : 'Seña: —'; },
        onState: (st) => { $('btn-avatar-play').textContent = st === 'playing' ? '⏸ Pausar' : '▶ Reproducir'; if (st === 'idle') $('avatar-gloss').textContent = 'Seña: —'; }
    });
    $('btn-avatar-play').textContent = '▶ Reproducir';
    setAvatarSpeed(S.settings.avatarSpeed);     // evita que el navegador recuerde un valor viejo del selector
    startCamera();
}

function receiveStaffMessage({ text, anim }) {
    if (!S.avatar) return;
    $('staff-response-text').textContent = text;
    S.lastStaff = { text, anim };
    S.avatar.load(buildSteps(text, anim));
    S.avatar.play();
}

/* ---------- Personal de salud ---------- */
function initStaff() {
    $('chat-container').innerHTML = '<div class="chat-placeholder">La conversación aparecerá aquí…</div>';
    $('tts-toggle').checked = S.settings.tts;
    const box = $('staff-phrases-container'); box.innerHTML = '';
    STAFF_PHRASES.forEach(p => {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = p.texto;
        b.addEventListener('click', () => sendToPatient(p.texto, p.animacion_id));
        box.appendChild(b);
    });
    initSpeechRecognition();
}

function sendToPatient(text, anim) {
    text = (text || '').trim();
    if (!text) return;
    if (!anim) { const known = findPhraseByText(text); if (known) anim = known.animacion_id; }
    appendChat('staff', text);
    Transport.send('STAFF_MSG', { text, anim: anim || null });
}

function receivePatientMessage({ text }) {
    appendChat('patient', text);
    if (S.settings.tts) speak(text);
}

function appendChat(from, text) {
    S.conversation.push({ from, text, ts: Date.now() });
    const c = $('chat-container');
    const ph = c.querySelector('.chat-placeholder'); if (ph) ph.remove();
    const div = document.createElement('div');
    div.className = `chat-bubble chat-${from}`;
    const who = document.createElement('span'); who.className = 'who';
    who.textContent = (from === 'patient' ? '🧏 Paciente' : '🩺 Personal') + ' · ' + new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const body = document.createElement('span'); body.textContent = text;
    div.append(who, body);
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
}

/* ---------- Sesión ---------- */
function startSession() {
    S.role = document.querySelector('input[name="role"]:checked').value;
    const scenario = document.querySelector('input[name="scenario"]:checked').value;
    S.active = true; S.conversation = []; S.pending = null; S.cooldownUntil = 0;
    S.peerSeen = 0; S.peerSynced = false; S.retriedLang = false;

    const supported = Transport.open(onTransportMessage, S.role === 'both');
    if (!supported && S.role !== 'both') showMessage('Este navegador no puede comunicar las dos pestañas. Usa la opción "Demo en una sola pantalla".', true);

    $('home-screen').classList.add('hidden');
    $('app-root').classList.remove('hidden');
    $('app-root').classList.toggle('split', S.role === 'both');
    $('patient-screen').classList.toggle('hidden', !hasPatient());
    $('staff-screen').classList.toggle('hidden', !hasStaff());

    setScenario(scenario, false);
    if (hasPatient()) initPatient();
    if (hasStaff()) initStaff();

    const ping = () => { Transport.send('PING', { role: S.role, scenario: S.scenario }); updateLinkStatus(); };
    ping();
    S.pingTimer = setInterval(ping, 3000);
    window.scrollTo(0, 0);
}

function clearHistory(broadcast = true) {
    S.conversation = [];
    $('chat-container').innerHTML = '<div class="chat-placeholder">La conversación aparecerá aquí…</div>';
    $('patient-current-text').textContent = 'Haz una seña frente a la cámara o usa una frase.';
    $('sent-status').classList.add('hidden');
    $('staff-response-text').textContent = '(Esperando respuesta…)';
    $('mic-live').textContent = '';
    S.lastStaff = null; S.pending = null;
    $('confirm-panel').classList.add('hidden');
    if (S.avatar) S.avatar.stop();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (broadcast) Transport.send('CLEAR');
}

function endSession(broadcast = true) {
    if (!S.active) return;
    if (broadcast) Transport.send('END_SESSION');
    clearInterval(S.pingTimer);
    stopCamera();
    if (S.recognition) { try { S.recognition.abort(); } catch (e) { /* nada */ } S.recognition = null; }
    setMicState(false);
    clearHistory(false);
    if (S.avatar) { S.avatar.stop(); S.avatar = null; }
    S.active = false; S.role = null; S.peerSeen = 0;
    setTimeout(() => Transport.close(), 100);      // deja salir el mensaje END_SESSION
    $('app-root').classList.add('hidden');
    $('patient-screen').classList.add('hidden');
    $('staff-screen').classList.add('hidden');
    $('home-screen').classList.remove('hidden');
    showMessage('Conversación terminada y borrada de la memoria.');
}

/* ---------- Ajustes ---------- */
function openSettings() {
    S.lastFocus = document.activeElement;
    $('settings-modal').classList.remove('hidden');
    $('setting-fontsize').focus();
}
function closeSettings() {
    $('settings-modal').classList.add('hidden');
    if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
}
function setAvatarSpeed(v) {
    S.settings.avatarSpeed = v;
    $('avatar-speed').value = String(v);
    $('setting-speed').value = String(v);
    if (S.avatar) S.avatar.setSpeed(v);
}

/* ---------- Arranque ---------- */
document.addEventListener('DOMContentLoaded', () => {
    $('btn-accept-consent').addEventListener('click', () => {
        $('consent-modal').classList.add('hidden');
        $('home-screen').classList.remove('hidden');
        $('btn-start').focus();
    });
    $('btn-start').addEventListener('click', startSession);
    document.querySelectorAll('.btn-end').forEach(b => b.addEventListener('click', () => endSession(true)));

    // Ajustes
    ['btn-settings-home', 'btn-settings-patient', 'btn-settings-staff'].forEach(id => $(id).addEventListener('click', openSettings));
    $('btn-close-settings').addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settings-modal').classList.contains('hidden')) closeSettings(); });
    $('setting-fontsize').addEventListener('change', (e) => {
        S.settings.fontSize = e.target.value;
        document.documentElement.style.fontSize = { normal: '100%', large: '118%', xlarge: '135%' }[e.target.value];
    });
    $('setting-contrast').addEventListener('change', (e) => {
        S.settings.highContrast = e.target.checked;
        document.body.setAttribute('data-theme', e.target.checked ? 'high-contrast' : 'default');
    });
    $('setting-speed').addEventListener('change', (e) => setAvatarSpeed(parseFloat(e.target.value)));
    $('avatar-speed').addEventListener('change', (e) => setAvatarSpeed(parseFloat(e.target.value)));
    $('setting-voice').addEventListener('change', (e) => {
        S.settings.voiceLang = e.target.value; S.retriedLang = false;
        if (S.recognition) S.recognition.lang = e.target.value;
    });
    $('btn-clear-history').addEventListener('click', () => { if (S.active) { clearHistory(true); showMessage('Historial borrado.'); } else showMessage('No hay conversación activa.'); });

    // Área (escenario) en ambas vistas
    $('scenario-patient').addEventListener('change', (e) => setScenario(e.target.value, true));
    $('scenario-staff').addEventListener('change', (e) => setScenario(e.target.value, true));

    // Paciente
    $('btn-confirm-yes').addEventListener('click', () => resolveConfirmation(true));
    $('btn-confirm-no').addEventListener('click', () => resolveConfirmation(false));
    $('btn-avatar-play').addEventListener('click', () => {
        if (!S.avatar) return;
        if (S.avatar.state === 'playing') S.avatar.pause(); else if (S.avatar.state === 'paused') S.avatar.play(); else S.avatar.replay();
    });
    $('btn-avatar-replay').addEventListener('click', () => { if (S.avatar && S.lastStaff) S.avatar.replay(); });
    // Probar el avatar sin el personal: simula una respuesta recibida
    $('btn-avatar-test').addEventListener('click', () => {
        const p = STAFF_PHRASES[S.avatarTestIdx = ((S.avatarTestIdx || 0) + 1) % STAFF_PHRASES.length];
        receiveStaffMessage({ text: p.texto, anim: p.animacion_id });
    });

    // Personal
    $('btn-mic').addEventListener('click', toggleMic);
    $('tts-toggle').addEventListener('change', (e) => { S.settings.tts = e.target.checked; if (!e.target.checked && 'speechSynthesis' in window) speechSynthesis.cancel(); });
    const sendTyped = () => { const i = $('staff-text-input'); sendToPatient(i.value); i.value = ''; i.focus(); };
    $('btn-send-text').addEventListener('click', sendTyped);
    $('staff-text-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTyped(); });

    // Las voces se cargan de forma asíncrona en Chrome
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};

    // Salir sin dejar nada: apaga la cámara y borra memoria
    window.addEventListener('pagehide', () => { stopCamera(); });
});
