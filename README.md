# AudioLink: transmisión de datos por ondas audibles

Aplicación web (HTML/CSS/JS puro, sin dependencias) que transmite archivos o texto entre dos dispositivos usando solo parlante y micrófono. Modulación M-FSK (8 o 16 tonos), sincronización por chirp, CRC-16 por trama y SHA-256 del archivo completo.

## Ejecutar
1. En la carpeta del proyecto: `python3 -m http.server 8000`
2. Abrir `http://localhost:8000` en Chrome o Edge (el micrófono exige **HTTPS o localhost**; `file://` no funciona).
3. **Celular:** hay que servir la app por HTTPS. Opciones: publicarla en un hosting estático (el servidor solo entrega la app, nunca los datos transmitidos) o usar un servidor local con certificado de `mkcert`. Tras la primera carga, la PWA funciona sin Internet.
4. Al pulsar "Activar micrófono" el navegador pedirá permiso. Se desactivan la cancelación de eco, la supresión de ruido y el AGC, porque destruyen los tonos.

## Demostración entre dos dispositivos
- **B (receptor):** pestaña *Recibir* → dejar marcada la confirmación (ACK) → *Activar micrófono*.
- **A (emisor):** pestaña *Transmitir* → elegir archivo o escribir texto → perfil *Robusto* para empezar → marcar *Esperar confirmación (ARQ)* → *Enviar por sonido*.
- Distancia inicial de 20–50 cm, volumen medio-alto, ambiente silencioso. Sin ARQ se usa modo carrusel (repite rondas, sin confirmación).
- B solo ofrece la descarga si CRC y SHA-256 coinciden. Si no, muestra error y no entrega el archivo.

## Arquitectura
`modem.js` (física: chirp, M-FSK, Goertzel) → `protocol.js` (tramas META/DATA/ACK/END, compresión, hash, reensamblado) → `main.js` (UI, audio, ARQ semidúplex). Detalles del protocolo en el artículo (Etapa 5). El micrófono se ignora mientras el dispositivo emite y 1,5 s después.

## Pruebas
`node tests/loopback.mjs` (modem simulado con ruido y desajuste de reloj) y `node tests/arq.mjs` (sesión, ACK, hash corrupto). **Son simulaciones, no mediciones acústicas.**

## Registro de pruebas reales (completar)
| Dispositivos | Perfil | Archivo/tamaño | Distancia | Ruido | Tiempo | Tramas válidas/descartadas | ¿Hash OK? |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Limitaciones conocidas
Tasa útil baja (decenas de bps); sin corrección de errores (solo detección y reenvío); umbrales de calidad provisionales; comportamiento en iOS/Safari sin verificar.

## Contenido adicional
- `docs/Articulo_IEEE_AudioLink.docx` y `.pdf`: artículo en formato IEEE (autores y resultados reales por completar).
- `tests/sim_sweep.mjs`: barrido de simulación (ruido, eco, pérdida de tramas, archivo binario). Ejecutar con `node tests/sim_sweep.mjs`.
