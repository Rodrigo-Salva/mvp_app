# SeñasYa – prototipo web

Prototipo en HTML + CSS + JavaScript vanilla. Sin compilar, sin frameworks.

## Decisiones técnicas
- MediaPipe Hands (CDN) detecta los 21 puntos; `recognizeSign()` clasifica por reglas (dedos extendidos/doblados).
- `SIGNS` es un archivo de datos reemplazable; `recognizeSign` tiene una interfaz fija para cambiarla por TensorFlow.js.
- El módulo `Transport` aísla `BroadcastChannel`; el comentario indica dónde poner un WebSocket.
- `SignAvatar` anima manos y torso en SVG con `requestAnimationFrame`; lo que no tiene gesto se deletrea.
- Todo en memoria: sin `localStorage`, sin subir video.

## Cómo ejecutarlo
La cámara exige `localhost` o HTTPS, así que no abras el archivo con doble clic.

```
cd senasya
npx serve
```
Abre `http://localhost:3000` en Chrome (la primera vez necesita internet para MediaPipe, y Chrome necesita internet para la voz a texto).

## Cómo probar las dos tablets
**Opción A – dos pestañas (mismo navegador):**
1. Pestaña 1: elige *Paciente* → Iniciar. Permite la cámara.
2. Pestaña 2: elige *Personal de salud* → Iniciar. Permite el micrófono.
3. En ambas debe aparecer "🔗 Conectado". El personal adopta el área del paciente.
4. Paciente: haz una seña (o toca una en *Modo demostración*) → confirma "Sí, enviar". El personal la ve (y la oye si el interruptor está activo).
5. Personal: responde por voz, texto o botón rápido. El paciente ve el subtítulo y la animación.

**Opción B – una sola pantalla:** en el inicio elige *Demo en una sola pantalla*. Muestra ambas vistas lado a lado y funciona sin cámara. Cambia el *Área* arriba para recorrer Recepción, Consultorio y Farmacia.

## Señas de demostración (formas de mano)
Pulgar-índice-medio-anular-meñique. La guía por escenario aparece en el *Modo demostración*.
Ejemplo (Recepción): mano abierta = "Quiero sacar una cita"; solo índice = "Tengo cita hoy"; V = "¿A qué hora es mi cita?"; puño = "Necesito cambiar mi cita"; pulgar = "Sí"; meñique = "No"; L = "Soy sordo, necesito ayuda"; Y = "Gracias".

## Limitaciones conocidas
- **No es Lengua de Señas Peruana.** Solo reconoce formas de mano estáticas, una mano, definidas en `SIGNS`.
- La detección depende de luz, distancia (~40–60 cm) y fondo. El pulgar es el dedo menos fiable.
- Las poses del avatar son **ilustrativas** y no están validadas por la comunidad sorda ni por un intérprete certificado.
- `BroadcastChannel` solo conecta pestañas del mismo navegador y equipo; dos tablets reales requieren WebSocket.
- La voz a texto y las voces de síntesis dependen de Chrome/Android y de internet.
- Los ajustes no se recuerdan al recargar (a propósito, no se usa almacenamiento).

## Siguientes pasos para producción
1. Modelo propio de LSP (datos recogidos con la comunidad sorda; TensorFlow.js sobre los landmarks o el video).
2. Avatar 3D con señas validadas por intérpretes certificados de LSP.
3. Backend con WebSocket (sala por cita, wss, autenticación, cifrado).
4. Validación de usabilidad con personas sordas, personal de EsSalud y pruebas en tablets reales.
5. Cumplimiento de la Ley N.º 29733 de Protección de Datos Personales (datos de salud son sensibles), consentimiento informado y evaluación de impacto.
