// Parámetros de la app. Se pueden ajustar editando este archivo.
const CONFIG = {
  version: "v1",
  anchoProceso: 320,        // ancho (px) de la imagen analizada
  fpsProceso: 15,           // análisis por segundo
  sensibilidadInicial: 6,   // 1 (estricto) a 10 (permisivo)
  confirmarMs: 300,         // tiempo que el punto debe estar quieto para capturar
  fijoMs: 1500,             // una mancha quieta más que esto se considera objeto fijo
  calentamientoMs: 2000,    // al iniciar la cámara no captura (aprende objetos rojos fijos)
  descansoMs: 2500,         // pausa tras cada captura
  areaMin: 3,               // tamaño mínimo de la mancha (px en imagen analizada)
  areaMax: 150,             // tamaño máximo
  elongMax: 1.8,            // 1 = círculo perfecto; más alto = tolera formas alargadas
  rellenoMin: 0.4,          // proporción mínima de relleno del rectángulo que la contiene
  radioSeguimiento: 10,     // cuánto puede moverse (px) y seguir siendo "el mismo punto"
  perdidaMs: 500,           // tiempo que se tolera sin ver una mancha antes de olvidarla
  radioCirculoPct: 0.04,    // radio del círculo marcado, como fracción del ancho de la foto
  calidadJpeg: 0.9
};
