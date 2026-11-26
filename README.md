# Detector Láser

App web instalable (PWA, empaquetable como APK) que usa la cámara del celular para detectar un puntero láser rojo en interiores. Cuando el punto se mantiene unos 0,3 segundos en el mismo lugar, guarda la foto con un círculo alrededor y permite adjuntarle información editable.

## Funciones
- Detección de un punto rojo chico y brillante; descarta manchas alargadas, objetos grandes y objetos rojos que están fijos.
- Captura con círculo verde (con borde negro) y vibración; pausa de 2,5 s entre fotos.
- Ficha por foto: título, descripción, lugar u objeto señalado y etiquetas, editables cuando quieras.
- Galería con buscador, descarga, compartir, eliminar y exportación de los datos a JSON.
- Selector de cámara (para evitar el gran angular 0.5), zoom, sensibilidad, modo prueba y reducción de exposición.

## Archivos
`index.html`, `estilos.css`, `config.js`, `detector.js`, `app.js`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png`.

## Publicar y generar el APK
1. Creá un repositorio público en GitHub y subí los archivos sueltos (sin carpeta).
2. Settings > Pages: rama `main`, carpeta `/ (root)`.
3. Abrí la dirección `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` en el celular y probá la cámara.
4. En pwabuilder.com pegá esa dirección, elegí Android, definí tu Package ID y generá el paquete. Instalá el `.apk` firmado y guardá la clave (`signing.keystore`).

## Calibración
| Problema | Qué hacer |
|---|---|
| No detecta el láser | Activá el modo prueba y subí la sensibilidad de a un punto |
| Detecta cosas rojas que no son el láser | Bajá la sensibilidad; en `config.js` bajá `elongMax` (ej. 1.3) |
| Pierde el láser real | Subí `elongMax` un poco |
| Mucha luz en la habitación | Usá luz moderada, superficie mate y "Reducir exposición" |

## Limitaciones
- Pensada para interiores y superficies mate; no es fiable con sol ni sobre superficies brillantes.
- Si apuntás el láser sobre un objeto rojo que ya estaba quieto, no lo detecta.
- Las fotos se guardan dentro de la app (no en la galería del sistema) hasta que las descargues.
- La lógica de detección se probó con imágenes sintéticas; la calibración final se hace con un láser real.
