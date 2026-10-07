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
const REST_ARM = [14, 330, 0, 'relax'];

// Cada gesto = lista de fotogramas [brazoA, brazoB]. Brazo A = derecha del avatar en pantalla.
const GESTOS = {
    reposo:   [[REST_ARM, REST_ARM]],
    saludo:   [[[50,165,175,'open'], REST_ARM], [[50,160,150,'open'], REST_ARM], [[50,165,195,'open'], REST_ARM], [[50,160,155,'open'], REST_ARM]],
    yo:       [[[10,250,250,'point'], REST_ARM], [[12,246,246,'point'], REST_ARM]],
    tu:       [[[45,150,150,'point'], REST_ARM], [[48,145,145,'point'], REST_ARM]],
    cita:     [[[25,235,235,'flat'], [25,240,240,'flat']], [[25,228,228,'flat'], [25,240,240,'flat']], [[25,235,235,'flat'], [25,240,240,'flat']]],
    hoy:      [[[22,230,215,'flat'], [22,230,215,'flat']], [[22,238,225,'flat'], [22,238,225,'flat']]],
    hora:     [[[25,235,235,'point'], [25,242,242,'flat']], [[25,240,240,'point'], [25,242,242,'flat']]],
    pulso:    [[[25,235,235,'flat'], [25,242,242,'flat']], [[25,240,242,'flat'], [25,242,242,'flat']]],
    dolor:    [[[30,245,250,'point'], [30,245,250,'point']], [[30,235,240,'point'], [30,235,240,'point']], [[30,245,250,'point'], [30,245,250,'point']]],
    fiebre:   [[[115,225,225,'open'], REST_ARM], [[115,230,235,'open'], REST_ARM]],
    mareo:    [[[115,215,200,'open'], [115,215,200,'open']], [[115,215,240,'open'], [115,215,240,'open']], [[115,215,200,'open'], [115,215,200,'open']]],
    gracias:  [[[100,230,225,'flat'], REST_ARM], [[65,175,170,'flat'], REST_ARM]],
    si:       [[[25,200,200,'fist'], REST_ARM], [[25,185,185,'fist'], REST_ARM], [[25,205,205,'fist'], REST_ARM]],
    no:       [[[40,175,160,'point'], REST_ARM], [[40,175,200,'point'], REST_ARM], [[40,175,160,'point'], REST_ARM], [[40,175,200,'point'], REST_ARM]],
    entender: [[[110,215,200,'point'], REST_ARM], [[110,215,215,'point'], REST_ARM]],
    sordo:    [[[110,215,200,'point'], REST_ARM], [[90,235,235,'point'], REST_ARM]],
    pregunta: [[[50,165,165,'open'], REST_ARM], [[50,158,150,'open'], REST_ARM]],
    esperar:  [[[20,235,235,'open'], [20,235,235,'open']], [[20,226,226,'open'], [20,226,226,'open']]],
    firmar:   [[[25,235,225,'pinch'], [25,245,245,'flat']], [[25,240,232,'pinch'], [25,245,245,'flat']], [[25,235,225,'pinch'], [25,245,245,'flat']]],
    pase:     [[[40,160,160,'open'], REST_ARM], [[40,160,160,'hook'], REST_ARM], [[40,160,160,'open'], REST_ARM]],
    medicina: [[[100,230,225,'pinch'], REST_ARM], [[100,225,220,'pinch'], REST_ARM]],
    dinero:   [[[25,230,230,'pinch'], REST_ARM], [[25,230,235,'open'], REST_ARM], [[25,230,230,'pinch'], REST_ARM]],
    repetir:  [[[40,170,150,'open'], REST_ARM], [[40,170,170,'open'], REST_ARM], [[40,170,200,'open'], REST_ARM]],
    cambiar:  [[[25,215,215,'fist'], [25,245,245,'fist']], [[25,245,245,'fist'], [25,215,215,'fist']]],
    ayuda:    [[[25,240,240,'flat'], [25,240,240,'flat']], [[15,225,225,'flat'], [15,225,225,'flat']]],
    alergia:  [[[40,205,210,'hook'], [25,245,245,'flat']], [[40,210,225,'hook'], [25,245,245,'flat']], [[40,205,210,'hook'], [25,245,245,'flat']]],
    grave:    [[[25,235,235,'fist'], [25,235,235,'fist']], [[25,228,228,'fist'], [25,242,242,'fist']], [[25,235,235,'fist'], [25,235,235,'fist']]]
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
// Se traduce PALABRA POR PALABRA: cada palabra conocida usa su gesto; solo las
// términos sin gesto se deletrean con el alfabeto dactilológico.
const WORD_GESTOS = {
    hola: 'saludo', buenos: 'saludo', buenas: 'saludo', dias: 'saludo', tardes: 'saludo', noches: 'saludo',
    cita: 'cita', citas: 'cita', turno: 'cita', hora: 'hora', horas: 'hora', dia: 'hoy', hoy: 'hoy',
    gracias: 'gracias', si: 'si', claro: 'si', no: 'no', nada: 'no',
    espere: 'esperar', esperar: 'esperar', espera: 'esperar', momento: 'esperar', minutos: 'esperar', favor: 'esperar', rato: 'esperar',
    pase: 'pase', pasar: 'pase',
    firme: 'firmar', firmar: 'firmar', firma: 'firmar', receta: 'firmar', documento: 'firmar', escrito: 'firmar',
    dolor: 'dolor', duele: 'dolor',
    fiebre: 'fiebre', calentura: 'fiebre', temperatura: 'fiebre',
    medicina: 'medicina', medicinas: 'medicina', pastilla: 'medicina', pastillas: 'medicina', remedio: 'medicina', remedios: 'medicina', jarabe: 'medicina',
    tomar: 'medicina', toma: 'medicina',
    doctor: 'pulso', doctora: 'pulso', medico: 'pulso', medica: 'pulso', enfermero: 'pulso', enfermera: 'pulso', personal: 'pulso',
    repita: 'repetir', repetir: 'repetir', repite: 'repetir',
    ayuda: 'ayuda', ayudar: 'ayuda', auxilio: 'ayuda', apoyo: 'ayuda',
    cuesta: 'dinero', precio: 'dinero', soles: 'dinero', pagar: 'dinero', pago: 'dinero', costo: 'dinero', cuanto: 'dinero',
    mareo: 'mareo', mareos: 'mareo', mareada: 'mareo', mareado: 'mareo',
    alergia: 'alergia', alergico: 'alergia', alergica: 'alergia',
    entiendo: 'entender', entiende: 'entender', entender: 'entender', comprender: 'entender', comprende: 'entender',
    cambiar: 'cambiar', cambio: 'cambiar', cambia: 'cambiar', cancela: 'cambiar',
    usted: 'tu', tu: 'tu', yo: 'yo', mi: 'yo',
    sordo: 'sordo', sorda: 'sordo',
    pregunta: 'pregunta', preguntas: 'pregunta', duda: 'pregunta', dudas: 'pregunta',
    grave: 'grave', serio: 'grave'
};

// Palabras de relleno (artículos, preposiciones, conjunciones y auxiliares) sin gesto:
// se omiten para que la traducción sea palabra por palabra sin deletrear letras.
const STOPWORDS = new Set(('el la los las un una unos unas de del a al y e o u en con por para que se te le les es son su sus esta este donde como cual pues pero mas ya bien aqui aqui no debe debo debes puede puedo cuando cada cuantas'.split(/\s+/)));

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
    settings: { fontSize: 'normal', highContrast: false, avatarSpeed: 1, voiceLang: 'es-PE', tts: true, ttsPatient: true },
    // paciente
    cooldownUntil: 0,
    camToken: 0, camRunning: false, stream: null, hands: null,
    avatar: null, lastStaff: null, lastPatientText: null,
    autoReplyTimer: 0, autoReplyIdx: 0, voiceTimer: 0,
    // personal
    recognition: null, listening: false, retriedLang: false,
    // conexión
    peerSeen: 0, peerRole: null, peerSynced: false, pingTimer: null
};
const hasPatient = () => S.role === 'patient' || S.role === 'both';
const hasStaff = () => S.role === 'staff' || S.role === 'both';
const $ = (id) => document.getElementById(id);
const ico = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;

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
            const wasAway = Date.now() - S.peerSeen > 6000;
            S.peerSeen = Date.now(); S.peerRole = payload.role;
            // Apretón de manos: si es la primera vez que lo vemos, respondemos al instante
            if (wasAway) Transport.send('PING', { role: S.role, scenario: S.scenario });
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

const peerConnected = () => Date.now() - S.peerSeen < 6000;

function updateLinkStatus() {
    const connected = S.role === 'both' || (Date.now() - S.peerSeen < 6000);
    if (!connected) S.peerSynced = false;
    $('link-status-patient').textContent = connected ? 'Conectado con el personal' : 'Una sola pantalla (sin otra tablet)';
    $('link-status-staff').textContent = connected ? 'Conectado con el paciente' : 'Esperando al paciente…';
    $('link-status-patient').classList.toggle('on', connected);
    // La caja "Responde aquí" solo aparece si el paciente usa una sola pantalla
    const hideDock = connected || S.role !== 'patient';
    $('staff-dock').classList.toggle('hidden', hideDock);
    document.querySelector('.patient-layout').classList.toggle('no-dock', hideDock);
    $('link-status-staff').classList.toggle('on', connected);
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
        $('mic-status').textContent = 'Voz no disponible en este navegador. Escribe la respuesta.';
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
    b.innerHTML = ico(on ? 'stop' : 'mic');
    $('mic-status').textContent = on ? '● Escuchando… habla ahora' : 'Toca para hablar';
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
     (estabilizador y envío) no cambia.

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
function createStabilizer(frames = 7, minConfidence = 0.45) {
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
        setCameraStatus('Cámara no disponible. Usa las frases rápidas.');
        showMessage('Este navegador no permite usar la cámara. Abre la página con localhost o https. Puedes seguir con las frases rápidas.', true);
        return;
    }
    setCameraStatus('Pidiendo permiso de cámara…');
    try {
        S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 960, height: 600 }, audio: false });
    } catch (err) {
        const msg = (err.name === 'NotAllowedError' || err.name === 'SecurityError')
            ? 'No pudimos usar la cámara porque no se dio permiso. Permítela en el navegador. Mientras tanto usa las frases rápidas.'
            : (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')
                ? 'No se encontró una cámara en este equipo. Usa las frases rápidas.'
                : 'No se pudo abrir la cámara (puede estar en uso por otra aplicación). Usa las frases rápidas.';
        setCameraStatus('Sin cámara. Usa las frases rápidas.');
        showMessage(msg, true);
        return;
    }
    if (token !== S.camToken) { stopCamera(); return; }      // la sesión terminó mientras esperábamos
    video.srcObject = S.stream;
    try { await video.play(); } catch (e) { /* se reintenta con los cuadros */ }

    if (typeof Hands === 'undefined') {
        setCameraStatus('Detector de manos no cargado (sin internet). Usa las frases rápidas.');
        showMessage('No se pudo cargar el detector de manos (necesita internet la primera vez). Usa las frases rápidas.', true);
        return;
    }
    try {
        setCameraStatus('Cargando detector de manos…');
        const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
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
        setCameraStatus('No se pudo iniciar el detector. Usa las frases rápidas.');
        showMessage('No se pudo iniciar el detector de manos. Usa las frases rápidas.', true);
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
    const handsList = (results.multiHandLandmarks || []).filter(lm => lm && lm.length >= 21);
    if (typeof drawConnectors !== 'undefined') {
        handsList.forEach(lm => {
            drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: '#7ee0c3', lineWidth: 4 });
            drawLandmarks(ctx, lm, { color: '#ffffff', fillColor: '#0b6e8a', lineWidth: 2, radius: 4 });
        });
    }
    ctx.restore();

    // Se leen las DOS manos y se elige la más clara (que coincida con una seña o de mayor confianza)
    const aspect = canvas.width / canvas.height;
    let res = null;
    handsList.forEach(lm => {
        const r = recognizeSign(lm, signsFor(S.scenario), aspect);
        if (!r) return;
        if (!res || handScore(r) > handScore(res)) res = r;
    });

    let progress = 0;
    if (Date.now() >= S.cooldownUntil) {
        const out = stabilizer.push(res);
        progress = out.progress;
        if (out.fired) sendRecognizedSign(out.fired.texto);
    } else {
        stabilizer.reset();
    }
    updateLiveBox(res, progress, handsList.length);
}

// Prioriza una mano que coincida con una seña y luego la confianza del reconocimiento.
function handScore(r) {
    return (r.signId ? 10 : 0) + r.confidence;
}

/* Seña reconocida y estable: se envía SOLA (sin pedir confirmación).
   Se aplica una pausa para que la seña termine antes de volver a leer. */
function sendRecognizedSign(texto) {
    S.cooldownUntil = Date.now() + 2500;
    stabilizer.reset();
    sendPatientMessage(texto);
}

function updateLiveBox(res, progress, handsCount = 0) {
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
    let label = 'Sin manos a la vista';
    if (res && res.signId) {
        const n = handsCount > 1 ? ` · ${handsCount} manos` : '';
        label = `✔ ${res.texto} (${Math.round(res.confidence * 100)}%)${n}`;
    }
    else if (res) label = 'Forma de mano sin seña asignada';
    $('live-label').textContent = label;
}

/* Seña reconocida y enviada (sin confirmación). La voz se reproduce con un
   pequeño retraso para que termine el gesto, y el avatar responde después. */
function sendPatientMessage(texto) {
    $('patient-current-text').textContent = texto;
    const st = $('sent-status');
    st.innerHTML = ico('check') + (S.role === 'patient' && !peerConnected() ? ' Dicho al personal' : ' Enviado al personal');
    st.classList.remove('hidden');
    S.lastPatientText = texto;
    Transport.send('PATIENT_MSG', { text: texto });
    // Lo que dice el paciente se LEE EN VOZ ALTA aquí si no hay otra tablet del personal.
    // La voz suena tras una pausa (para que el gesto termine), no al instante.
    if (S.role === 'patient' && S.settings.ttsPatient && !peerConnected()) speakDelayed(texto);
    scheduleAutoReply();
}

// Voz del paciente: se retrasa ~1.5 s para que termine la seña antes de sonar.
function speakDelayed(text) {
    clearTimeout(S.voiceTimer);
    S.voiceTimer = setTimeout(() => {
        if (!S.active) return;
        speak(text);
    }, 1500);
}

/* El avatar simula la respuesta del personal tras cada seña del paciente
   cuando no hay un tablet real del personal conectado (solo pantalla o demo).
   Cada área (recepción, consultorio, farmacia) responde con SU propio estilo:
   `rules` son respuestas por palabra clave y `pool` la reserva para lo demás.
   El texto de una regla puede ser una función (recibe la seña escrita). */
const SYMPTOM_RE = /\b(fiebre|calentura|duele|dolor|mareos?|tos|cabeza|pecho|estomago|garganta|vomito|alergia)\b/;
const SYMPTOM_LABEL = {
    calentura: 'fiebre', duele: 'dolor',
    tos: 'tos', cabeza: 'dolor de cabeza', pecho: 'dolor de pecho',
    estomago: 'dolor de estómago', garganta: 'dolor de garganta', vomito: 'vómitos'
};
const SYMPTOM_ANIM = {
    fiebre: 'fiebre', calentura: 'fiebre', dolor: 'dolor', duele: 'dolor',
    mareo: 'mareos', mareos: 'mareos', alerta: 'mareos'
};

const AUTO_REPLIES = {
    reception: {
        rules: [
            { re: /\bespecialista\b/, out: { text: 'Lo redirigiré al área de pediatría.', anim: 'pase' } },
            { re: /\b(cambiar|cambio|reprogramar|mover|adelantar|atrasar)\b/, out: { text: 'Claro, puedo programarle otra cita.', anim: 'espere' } },
            { re: /\b(cita|turno|hora|sacar|agendar)\b/, out: { text: 'Su cita a dermatología será dentro de 10 minutos.', anim: 'cita_a_las' } },
            { re: /\b(sordo|ayuda|ayudar|no entiendo|entiendo|entender)\b/, out: { text: 'Le explico por escrito.', anim: 'escrito' } },
            { re: /\b(repita|repetir)\b/, out: { text: '¿Puede repetir?', anim: 'repetir_staff' } },
            { re: /\bgracias\b/, out: { text: 'De nada.', anim: 'gracias' } },
            { re: /\bsi\b/, out: { text: 'Perfecto, lo anoto.', anim: 'si' } },
            { re: /\bno\b/, out: { text: '¿Puede repetir?', anim: 'repetir_staff' } }
        ],
        pool: [
            { text: 'Su cita a dermatología será dentro de 10 minutos.', anim: 'cita_a_las' },
            { text: 'Lo redirigiré al área de pediatría.', anim: 'pase' },
            { text: 'Espere un momento, por favor.', anim: 'espere' },
            { text: '¿Puede repetir?', anim: 'repetir_staff' }
        ]
    },
    consulting: {
        rules: [
            { re: /\b(es grave|grave|peligroso|preocup|serio)\b/, out: { text: 'Está bien de salud, tiene un buen nivel de sangre.', anim: null } },
            { re: SYMPTOM_RE, out: (t) => {
                const m = SYMPTOM_RE.exec(t);
                const label = SYMPTOM_LABEL[m[1]] || m[1];
                return { text: `Ha sido diagnosticado con ${label}.`, anim: SYMPTOM_ANIM[label] || SYMPTOM_ANIM[m[1]] || null };
            } },
            { re: /\b(medicina|medicamento|remedio|pastilla|tomar|jarabe)\b/, out: { text: 'Le receto un medicamento; se toma una pastilla cada ocho horas.', anim: 'medicina_que' } },
            { re: /\b(cuando|vuelvo|volver|regresar)\b/, out: { text: 'Vuelva en una semana, por favor.', anim: 'cuando_vuelvo' } },
            { re: /\balergia\b/, out: { text: 'Anotado su alergia. Le cambio el medicamento.', anim: 'alergia' } },
            { re: /\b(no entiendo|entiendo|entender)\b/, out: { text: 'Le explico por escrito.', anim: 'escrito' } },
            { re: /\bgracias\b/, out: { text: 'De nada, cuídese.', anim: 'gracias' } },
            { re: /\bsi\b/, out: { text: 'Muy bien, siga así.', anim: 'si' } },
            { re: /\bno\b/, out: { text: '¿Puede repetir?', anim: 'repetir_staff' } }
        ],
        pool: [
            { text: 'Está bien de salud, tiene un buen nivel de sangre.', anim: null },
            { text: 'Le receto un medicamento; se toma una pastilla cada ocho horas.', anim: 'medicina_que' },
            { text: 'Vuelva en una semana, por favor.', anim: 'cuando_vuelvo' },
            { text: '¿Puede repetir?', anim: 'repetir_staff' }
        ]
    },
    pharmacy: {
        rules: [
            { re: /\breceta\b/, out: { text: 'Podría darme su receta médica, estimado(a).', anim: 'receta' } },
            { re: /\b(recoger|medicinas?|medicamento|remedio)\b/, out: { text: 'Sí tenemos todos esos medicamentos, ahora lo empaquetamos.', anim: 'recoger_med' } },
            { re: /\b(cuesta|precio|cuanto|costo|soles|pagar)\b/, out: { text: 'Son quince soles.', anim: 'costo' } },
            { re: /\b(como se toma|tomar|toma|cuando se toma)\b/, out: { text: 'Se toma una pastilla cada ocho horas, después de comer.', anim: 'como_tomar' } },
            { re: /\b(cada|horas)\b/, out: { text: 'Cada ocho horas, después de comer.', anim: 'cada_horas' } },
            { re: /\b(presentacion|presentación)\b/, out: { text: 'Sí, tenemos jarabe en lugar de pastilla.', anim: 'otra_presentacion' } },
            { re: /\b(sordo|ayuda|ayudar|no entiendo|entiendo)\b/, out: { text: 'Le explico por escrito.', anim: 'escrito' } },
            { re: /\b(repita|repetir)\b/, out: { text: '¿Puede repetir?', anim: 'repetir_staff' } },
            { re: /\bgracias\b/, out: { text: 'De nada, buen día.', anim: 'gracias' } },
            { re: /\bsi\b/, out: { text: 'Perfecto, enseguida lo despacho.', anim: 'si' } },
            { re: /\bno\b/, out: { text: '¿Puede repetir?', anim: 'repetir_staff' } }
        ],
        pool: [
            { text: 'Sí tenemos todos esos medicamentos, ahora lo empaquetamos.', anim: 'recoger_med' },
            { text: 'Podría darme su receta médica, estimado(a).', anim: 'receta' },
            { text: 'Son quince soles.', anim: 'costo' },
            { text: '¿Puede repetir?', anim: 'repetir_staff' }
        ]
    }
};

function pickAutoReply(patientText) {
    const t = normalizeText(patientText || '');
    const set = AUTO_REPLIES[S.scenario] || AUTO_REPLIES.reception;
    for (const r of set.rules) {
        if (!r.re.test(t)) continue;
        const out = typeof r.out === 'function' ? r.out(t) : r.out;
        return { text: out.text, anim: out.anim };
    }
    const pool = set.pool;
    S.autoReplyIdx = (S.autoReplyIdx || 0) + 1;
    return { ...pool[S.autoReplyIdx % pool.length] };
}

function scheduleAutoReply() {
    clearTimeout(S.autoReplyTimer);
    if (S.role === 'staff') return;
    if (S.role === 'patient' && peerConnected()) return;   // el personal real va a responder
    const panel = $('staff-response-text');
    if (panel) panel.textContent = 'El personal está escribiendo…';
    S.autoReplyTimer = setTimeout(() => {
        if (!S.active || !S.avatar) return;
        const reply = pickAutoReply(S.lastPatientText || '');
        receiveStaffMessage(reply);
        if (hasStaff()) appendChat('staff', reply.text);
    }, 2800);
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
const easeInOut = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

function makePose(armA, armB) {
    return [armA[0], armA[1], armA[2], armB[0], armB[1], armB[2], ...CURLS[armA[3]], ...CURLS[armB[3]]];
}
const REST_POSE = makePose(REST_ARM, REST_ARM);

/* Silueta de un dedo: polygon() de los puntos con un grosor por punta,
   formando un trapezoide redondeado que se afina hacia la punta. */
function fingerOutline(pts, widths) {
    const n = pts.length;
    if (n < 2) return '';
    const perp = (i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1;
        return { x: -dy / L, y: dx / L };
    };
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
        const p = pts[i], w = widths[i], nv = perp(i);
        left.push(`${(p.x + nv.x * w).toFixed(2)},${(p.y + nv.y * w).toFixed(2)}`);
        right.push(`${(p.x - nv.x * w).toFixed(2)},${(p.y - nv.y * w).toFixed(2)}`);
    }
    let d = `M${left[0]}L` + left.slice(1).join('L');
    for (let i = n - 1; i >= 0; i--) d += `L${right[i]}`;
    return d + 'Z';
}

/* Convierte un texto (o un animacion_id) en la lista de pasos del avatar.
   - Si hay animacion_id conocido: usa su secuencia de gestos.
   - Si no: recorre las palabras; con gesto conocido lo usa, si no DELETREA. */
function buildSteps(text, animId) {
    const steps = [];
    const addGesto = (name) => (GESTOS[name] || []).forEach(fr => {
        steps.push({ pose: makePose(fr[0], fr[1]), label: `Seña: ${name.toUpperCase()}`, dur: 640 });
    });
    const fingerspell = (word) => {
        [...word].forEach(ch => {
            if (!LETRAS[ch]) return;
            const curls = LETRAS[ch];
            steps.push({
                pose: [45, 170, 180, 14, 330, 0, ...curls, ...CURLS.relax],
                label: `Deletreo: ${word.toUpperCase()} · letra ${ch.toUpperCase()}`, letter: ch.toUpperCase(), dur: 520
            });
        });
    };
    if (animId && ANIMS[animId]) {
        ANIMS[animId].forEach(addGesto);
    } else {
        const words = normalizeText(text).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
        words.forEach(w => { if (WORD_GESTOS[w]) addGesto(WORD_GESTOS[w]); else if (!STOPWORDS.has(w)) fingerspell(w); });
    }
    const MAX = 60;                                         // evita secuencias interminables
    if (steps.length > MAX) steps.length = MAX;
    steps.push({ pose: REST_POSE, label: 'Fin', dur: 380 });
    steps.question = /[?¿]/.test(text || '');
    return steps;
}

/* ------------------------------------------------------------
   VESTIMENTA DEL AVATAR según el área de atención:
   - reception: uniforme de recepcionista (polo + gafete)
   - consulting: bata de doctor abierta + estetoscopio
   - pharmacy: bata de científico cerrada, con botones y bolsillo
   Cada función dibuja dentro del grupo `.av-outfit` (sobre el torso,
   debajo de los brazos). Todas las formas son ilustrativas.
   ------------------------------------------------------------ */
const OUTFIT_TORSO = 'M116 165 Q116 118 160 116 L200 116 Q244 118 244 165 L244 330 L116 330 Z';
const OUTFITS = {
    reception(add) {
        add('path', { class: 'of-top', d: OUTFIT_TORSO });
        add('path', { class: 'of-line', d: 'M160 117 L180 146 L200 117' });          // escote en V del polo
        add('path', { class: 'of-line', d: 'M160 117 L172 132 M200 117 L188 132' }); // ribete del cuello
        add('path', { class: 'of-line', d: 'M196 122 L214 186' });                   // cordón del gafete
        add('rect', { class: 'of-badge', x: 208, y: 184, width: 38, height: 26, rx: 5 });
        add('path', { class: 'of-badge-line', d: 'M214 193h26 M214 200h18' });
    },
    consulting(add) {
        add('path', { class: 'of-shirt', d: OUTFIT_TORSO });                         // camisa interior
        add('path', { class: 'of-coat', d: 'M116 165 Q116 118 160 116 L180 152 L180 330 L116 330 Z' });
        add('path', { class: 'of-coat', d: 'M244 165 Q244 118 200 116 L180 152 L180 330 L244 330 Z' });
        add('path', { class: 'of-line', d: 'M160 116 L180 152 M200 116 L180 152' }); // abertura de la bata
        add('path', { class: 'of-pocket', x: 206, y: 206, width: 32, height: 30, rx: 4 });
        add('path', { class: 'of-pen', d: 'M218 200 L222 224' });
        add('path', { class: 'of-steth', d: 'M166 119 C150 152 154 196 172 211' });
        add('path', { class: 'of-steth', d: 'M196 119 C212 150 208 186 194 200' });
        add('circle', { class: 'of-steth-head', cx: 176, cy: 214, r: 9 });
    },
    pharmacy(add) {
        add('path', { class: 'of-coat', d: OUTFIT_TORSO });                          // bata cerrada
        add('path', { class: 'of-line', d: 'M164 116 L180 138 L196 116' });          // cuello
        add('path', { class: 'of-line', d: 'M180 138 L180 330' });                   // cierre central
        [170, 205, 240, 275].forEach(y => add('circle', { class: 'of-btn', cx: 187, cy: y, r: 4.5 }));
        add('rect', { class: 'of-pocket', x: 206, y: 210, width: 34, height: 34, rx: 4 });
        add('path', { class: 'of-pen', d: 'M219 204 L222 230 M230 204 L233 226' });
    }
};

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
        this.setOutfit('reception');
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
        svg.setAttribute('viewBox', '18 0 330 300');          // encuadre acercado: cabeza, torso y manos
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Avatar esquemático que muestra señas. Animación ilustrativa.');
        this.container.appendChild(svg);
        this.svg = svg;

        // Torso con "respiración" (animación CSS)
        const body = this._el('g', { class: 'av-breathe' });
        this._el('path', { class: 'av-body', d: 'M116 165 Q116 118 160 116 L200 116 Q244 118 244 165 L244 330 L116 330 Z' }, body);
        this._el('path', { class: 'av-collar', d: 'M164 116 Q180 134 196 116', fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, body);

        // Cuello y cabeza (la cabeza se inclina un poco al "hablar")
        this._el('rect', { class: 'av-skin', x: 168, y: 88, width: 24, height: 36, rx: 8 }, body);
        const head = this._el('g', { class: 'av-head' }, body);
        this._el('ellipse', { class: 'av-skin', cx: 144, cy: 68, rx: 7, ry: 10 }, head);   // orejas
        this._el('ellipse', { class: 'av-skin', cx: 216, cy: 68, rx: 7, ry: 10 }, head);
        this._el('ellipse', { class: 'av-skin', cx: 180, cy: 62, rx: 34, ry: 38 }, head);   // cara
        this._el('path', { class: 'av-hair', d: 'M145 62 Q140 20 181 20 Q222 20 215 62 Q206 40 184 38 Q158 38 145 62 Z' }, head);
        this._el('ellipse', { class: 'av-cheek', cx: 158, cy: 76, rx: 7, ry: 4 }, head);
        this._el('ellipse', { class: 'av-cheek', cx: 202, cy: 76, rx: 7, ry: 4 }, head);
        this.brows = this._el('path', { class: 'av-brows', d: 'M156 48 Q165 43 174 48 M186 48 Q195 43 204 48', fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, head);
        const eyes = this._el('g', { class: 'av-eyes' }, head);
        this._el('ellipse', { class: 'av-face', cx: 165, cy: 61, rx: 3.8, ry: 4.6 }, eyes);
        this._el('ellipse', { class: 'av-face', cx: 195, cy: 61, rx: 3.8, ry: 4.6 }, eyes);
        this._el('path', { class: 'av-mouth', d: 'M169 80 Q180 89 191 80', fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, head);

        // Vestimenta según el área: recepción, consultorio o farmacia (se dibuja en setOutfit)
        this.outfit = this._el('g', { class: 'av-outfit' }, body);

        // Brazos: manga, antebrazo y mano con dedos de dos segmentos
        this.arms = [{ shX: 228, sx: 1 }, { shX: 132, sx: -1 }].map(a => {
            const arm = { ...a };
            arm.upperO = this._el('line', { class: 'av-sleeve-o', 'stroke-width': 34, x1: a.shX, y1: 142, x2: a.shX, y2: 200 });
            arm.upper = this._el('line', { class: 'av-sleeve', 'stroke-width': 30, x1: a.shX, y1: 142, x2: a.shX, y2: 200 });
            arm.foreO = this._el('line', { class: 'av-skin-line', 'stroke-width': 20 });
            arm.fore = this._el('line', { class: 'av-arm', 'stroke-width': 16 });
            arm.fingersO = [0, 1, 2, 3, 4].map(() => this._el('path', { class: 'av-finger-o' }));
            arm.nails = [0, 1, 2, 3, 4].map(() => this._el('circle', { class: 'av-nail' }));
            arm.fingers = [0, 1, 2, 3, 4].map(() => this._el('path', { class: 'av-finger' }));
            arm.palmO = this._el('ellipse', { class: 'av-skin av-palm-o', rx: 15, ry: 16 });
            arm.palm = this._el('ellipse', { class: 'av-skin', rx: 13, ry: 14 });
            return arm;
        });
        this.letter = this._el('text', { class: 'av-letter', x: 78, y: 70, 'text-anchor': 'middle' });
    }

    setOutfit(name) {
        const key = OUTFITS[name] ? name : 'reception';
        this.outfitName = key;
        if (!this.outfit) return;
        this.outfit.innerHTML = '';
        ['reception', 'consulting', 'pharmacy'].forEach(k => this.svg.classList.toggle('outfit-' + k, k === key));
        OUTFITS[key]((tag, attrs) => this._el(tag, attrs, this.outfit));
        this._render(this.current);
    }

    /* ---- Dibuja una pose (16 números) ---- */
    _render(p) {
        const FINGER_OFF = [52, 20, 2, -16, -34];        // abanico de dedos (grados)
        const FINGER_LEN = [24, 32, 36, 32, 24];         // largo total de cada dedo
        const FINGER_W = [7.5, 8, 8.5, 8.5, 8];          // grosor de la base de cada dedo
        const pt = (x, y, ang, len, sx) => [x + sx * len * Math.sin(ang), y + len * Math.cos(ang)];
        this.arms.forEach((arm, k) => {
            const u = p[k * 3], f = p[k * 3 + 1], r = p[k * 3 + 2];
            const curls = p.slice(6 + k * 5, 11 + k * 5);
            const sx = arm.sx;
            const ex = arm.shX + sx * 62 * Math.sin(rad(u)), ey = 142 + 62 * Math.cos(rad(u));
            const wx = ex + sx * 58 * Math.sin(rad(f)),      wy = ey + 58 * Math.cos(rad(f));
            arm.upper.setAttribute('x2', ex); arm.upper.setAttribute('y2', ey);
            arm.upperO.setAttribute('x2', ex); arm.upperO.setAttribute('y2', ey);
            [arm.fore, arm.foreO].forEach(l => { l.setAttribute('x1', ex); l.setAttribute('y1', ey); l.setAttribute('x2', wx); l.setAttribute('y2', wy); });
            // palma: elipse orientada según la mano
            const pcx = wx + sx * 10 * Math.sin(rad(r)), pcy = wy + 10 * Math.cos(rad(r));
            [arm.palm, arm.palmO].forEach(e => {
                e.setAttribute('cx', pcx); e.setAttribute('cy', pcy);
                e.setAttribute('transform', `rotate(${-sx * r} ${pcx} ${pcy})`);
            });
            // dedos: dos segmentos que se afinan hacia la punta, con uña en los extendidos
            for (let i = 0; i < 5; i++) {
                const a = rad(r + FINGER_OFF[i]);
                const c = curls[i];
                const bx = pcx + sx * 7 * Math.sin(a), by = pcy + 7 * Math.cos(a);
                const l1 = FINGER_LEN[i] * 0.55 * (1 - 0.32 * c);
                const l2 = FINGER_LEN[i] * 0.45 * (1 - 0.8 * c);
                const bend = rad(-Math.sign(FINGER_OFF[i]) * c * 34);
                const [kx, ky] = pt(bx, by, a, l1, sx);
                const [tx, ty] = pt(kx, ky, a + bend, l2, sx);
                const pts = [{ x: bx, y: by }, { x: kx, y: ky }, { x: tx, y: ty }];
                const w0 = FINGER_W[i];
                const outline = fingerOutline(pts, [w0, w0 * 0.78, w0 * 0.44]);
                arm.fingers[i].setAttribute('d', outline);
                arm.fingersO[i].setAttribute('d', fingerOutline(pts, [w0 + 1.7, w0 * 0.78 + 1.7, w0 * 0.44 + 1.7]));
                const sxv = tx - kx, syv = ty - ky;
                const sl = Math.hypot(sxv, syv);
                const showNail = c < 0.35 && sl > 2;
                arm.nails[i].setAttribute('cx', tx + (sl ? sxv / sl * 1.8 : 0));
                arm.nails[i].setAttribute('cy', ty + (sl ? syv / sl * 1.8 : 0));
                arm.nails[i].setAttribute('r', showNail ? 1.7 : 0);
            }
        });
    }

    /* ---- Control de reproducción ---- */
    load(steps) {
        this._stopLoop();
        this.steps = steps; this.idx = 0; this.elapsed = 0;
        this.svg.classList.toggle('question', !!steps.question);   // cejas arriba en preguntas
        this.from = this.current.slice();
        this._setLetter(steps[0]);
        this.onStep(0, steps[0]);
    }
    _talk(on) { this.svg.classList.toggle('talking', on); }
    play() {
        if (!this.steps.length) return;
        if (this.state === 'idle') { this.idx = 0; this.elapsed = 0; this.from = REST_POSE.slice(); this.current = REST_POSE.slice(); this.onStep(0, this.steps[0]); }
        this.state = 'playing'; this.last = performance.now(); this._talk(true);
        this.onState(this.state);
        this.raf = requestAnimationFrame((t) => this._tick(t));
    }
    pause() { if (this.state !== 'playing') return; this.state = 'paused'; this._stopLoop(); this._talk(false); this.onState(this.state); }
    replay() { this._stopLoop(); this.state = 'idle'; this.play(); }
    setSpeed(x) { this.speed = x; }
    stop() { this._stopLoop(); this._talk(false); this.svg.classList.remove('question'); this.state = 'idle'; this.steps = []; this.current = REST_POSE.slice(); this._render(this.current); this._setLetter(null); this.onState(this.state); }
    _stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    _setLetter(step) { this.letter.textContent = step && step.letter ? step.letter : ''; }

    _tick(now) {
        if (this.state !== 'playing') return;
        const dt = Math.min(64, now - this.last) * this.speed;
        this.last = now;
        this.elapsed += dt;
        const step = this.steps[this.idx];
        const moveTime = step.dur * 0.6;                // 60% se mueve, 40% se mantiene la pose
        const k = easeInOut(Math.min(1, this.elapsed / moveTime));
        this.current = this.from.map((v, i) => lerp(v, step.pose[i], k));
        this._render(this.current);
        if (this.elapsed >= step.dur) {
            this.from = step.pose; this.idx++; this.elapsed = 0;
            if (this.idx >= this.steps.length) {
                this.state = 'idle'; this._setLetter(null); this._talk(false); this.onState(this.state);
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
    t.innerHTML = ico(isError ? 'alert' : 'check');
    const m = document.createElement('span'); m.textContent = msg; t.appendChild(m);
    t.classList.toggle('error', isError);
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 6000);
}

function setScenario(scenario, broadcast = true) {
    if (!SCENARIO_NAMES[scenario]) return;
    S.scenario = scenario;
    S.autoReplyIdx = 0;
    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scenario === scenario)));
    if (hasPatient()) renderPatientPhrases();
    if (S.avatar) S.avatar.setOutfit(scenario);
    if (broadcast) Transport.send('SCENARIO', { scenario });
    stabilizer.reset();
}

function renderPatientPhrases() {
    // Frases rápidas: el paciente toca una frase y se envía directo
    const quick = $('patient-quick-phrases'); quick.innerHTML = '';
    VOCABULARY[S.scenario].forEach(p => {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = p.texto;
        b.addEventListener('click', () => sendPatientMessage(p.texto));
        quick.appendChild(b);
    });
}

function initPatient() {
    $('patient-current-text').textContent = 'Haz una seña o toca una frase.';
    $('sent-status').classList.add('hidden');
    $('staff-response-text').textContent = '(Esperando respuesta…)';
    $('avatar-gloss').textContent = 'Seña: —';
    updateLiveBox(null, 0);
    S.avatar = new SignAvatar($('sign-avatar-container'), {
        onStep: (i, step) => { $('avatar-gloss').textContent = step ? step.label : 'Seña: —'; },
        onState: (st) => { $('btn-avatar-play').innerHTML = st === 'playing' ? ico('pause') + ' Pausar' : ico('play') + ' Reproducir'; if (st === 'idle') $('avatar-gloss').textContent = 'Seña: —'; }
    });
    $('btn-avatar-play').innerHTML = ico('play') + ' Reproducir';
    S.avatar.setOutfit(S.scenario);
    initDock();
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

/* ---------- Caja "Responde aquí" (el personal usa la misma pantalla del paciente) ---------- */
function dockSend(text) {
    text = (text || '').trim();
    if (!text) return;
    clearTimeout(S.autoReplyTimer);   // el personal respondió de verdad
    const known = findPhraseByText(text);
    receiveStaffMessage({ text, anim: known ? known.animacion_id : null });   // el avatar traduce a señas
}

function setDockMic(on) {
    S.dockListening = on;
    const b = $('btn-dock-mic');
    b.classList.toggle('recording', on);
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = ico(on ? 'stop' : 'mic') + (on ? ' Escuchando…' : ' Hablar');
}

function toggleDockMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showMessage('Este navegador no entiende la voz. Usa Chrome, o escribe la respuesta.', true); return; }
    if (S.dockRec && S.dockListening) { S.dockRec.stop(); return; }
    const r = new SR();
    r.lang = S.settings.voiceLang; r.interimResults = true; r.continuous = false;
    r.onstart = () => setDockMic(true);
    r.onend = () => setDockMic(false);
    r.onresult = (e) => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t; else interim += t;
        }
        $('dock-live').textContent = interim || final;
        if (final.trim()) { dockSend(final); $('dock-live').textContent = ''; }
    };
    r.onerror = (e) => {
        setDockMic(false);
        const m = { 'not-allowed': 'No tenemos permiso para usar el micrófono. Permítelo en el navegador, o escribe.',
                    'audio-capture': 'No se encontró un micrófono. Escribe la respuesta.',
                    'no-speech': 'No se escuchó nada. Intenta otra vez.',
                    'network': 'La voz necesita internet en este navegador. Escribe la respuesta.' };
        if (e.error !== 'aborted') showMessage(m[e.error] || 'No se pudo escuchar. Escribe la respuesta.', true);
    };
    S.dockRec = r;
    try { r.start(); } catch (err) { /* ya estaba iniciado */ }
}

function initDock() {
    const box = $('dock-phrases'); box.innerHTML = '';
    STAFF_PHRASES.forEach(p => {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = p.texto;
        b.addEventListener('click', () => receiveStaffMessage({ text: p.texto, anim: p.animacion_id }));
        box.appendChild(b);
    });
    setDockMic(false);
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
    clearTimeout(S.autoReplyTimer);   // ya respondió el personal; no hace falta la respuesta simulada
    if (!anim) { const known = findPhraseByText(text); if (known) anim = known.animacion_id; }
    appendChat('staff', text);
    Transport.send('STAFF_MSG', { text, anim: anim || null });
}

function receivePatientMessage({ text }) {
    appendChat('patient', text);
    if (S.settings.tts) speakDelayed(text);   // misma pausa: no sonar al instante
}

function appendChat(from, text) {
    S.conversation.push({ from, text, ts: Date.now() });
    const c = $('chat-container');
    const ph = c.querySelector('.chat-placeholder'); if (ph) ph.remove();
    const div = document.createElement('div');
    div.className = `chat-bubble chat-${from}`;
    const who = document.createElement('span'); who.className = 'who';
    who.textContent = (from === 'patient' ? 'Paciente' : 'Personal') + ' · ' + new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const body = document.createElement('span'); body.textContent = text;
    div.append(who, body);
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
}

/* ---------- Sesión ---------- */
function startSession() {
    S.role = document.querySelector('input[name="role"]:checked').value;
    const scenario = document.querySelector('input[name="scenario"]:checked').value;
    S.active = true; S.conversation = []; S.cooldownUntil = 0;
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
    S.pingTimer = setInterval(ping, 2000);
    window.scrollTo(0, 0);
}

function clearHistory(broadcast = true) {
    S.conversation = [];
    $('chat-container').innerHTML = '<div class="chat-placeholder">La conversación aparecerá aquí…</div>';
    $('patient-current-text').textContent = 'Haz una seña o toca una frase.';
    $('sent-status').classList.add('hidden');
    $('staff-response-text').textContent = '(Esperando respuesta…)';
    $('mic-live').textContent = '';
S.lastStaff = null; S.lastPatientText = null;
    clearTimeout(S.autoReplyTimer);
    clearTimeout(S.voiceTimer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (broadcast) Transport.send('CLEAR');
}

function endSession(broadcast = true) {
    if (!S.active) return;
    if (broadcast) Transport.send('END_SESSION');
    clearInterval(S.pingTimer);
    stopCamera();
    if (S.recognition) { try { S.recognition.abort(); } catch (e) { /* nada */ } S.recognition = null; }
    if (S.dockRec) { try { S.dockRec.abort(); } catch (e) { /* nada */ } S.dockRec = null; }
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
    document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setScenario(b.dataset.scenario, true)));

    // Paciente
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

    // Pestañas: frases rápidas / simular señas (se eliminó el modo simular)

    // Caja "Responde aquí" y lectura en voz alta del paciente
    $('btn-dock-mic').addEventListener('click', toggleDockMic);
    const dockTyped = () => { const i = $('dock-input'); dockSend(i.value); i.value = ''; i.focus(); };
    $('btn-dock-send').addEventListener('click', dockTyped);
    $('dock-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') dockTyped(); });
    $('tts-patient').addEventListener('change', (e) => { S.settings.ttsPatient = e.target.checked; if (!e.target.checked && 'speechSynthesis' in window) speechSynthesis.cancel(); });

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
