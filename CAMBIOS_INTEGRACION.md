# Cambios de integración

## Alcance

Este documento resume las funciones de la edición propia integradas con la rama oficial `main` de Lumina y las correcciones posteriores realizadas durante la integración. El trabajo está en `integrate-luminapropio`; todavía no se ha incorporado a la rama oficial `main`.

## Funciones y mejoras

### Imágenes y flujo de trabajo

- Se agregó la importación de varias imágenes y carpetas, la carga diferida de páginas inactivas y la navegación/reorganización desde la tira de páginas. Al hacer clic derecho en una página aparecen las opciones **Cerrar esta**, **Cerrar las demás** y **Cerrar todas**.
- Se incorporó detección y OCR por lotes en las páginas abiertas.
- **Flujo completo** y **Solo limpieza** procesan todas las imágenes abiertas y, al terminar, regresan a la página que estaba activa.
- **Solo limpieza** permite ejecutarse con o sin OCR. Si se elige OCR, también se ejecuta la traducción.
- Se agregaron marcas internas de finalización por página para detección, OCR, traducción y limpieza. En ejecuciones posteriores se omiten las etapas terminadas, así que las imágenes nuevas se pueden procesar sin repetir el trabajo de las anteriores. Las marcas se guardan en el proyecto y forman parte de deshacer/rehacer.
- Las acciones individuales del flujo siguen permitiendo repetir explícitamente una etapa.

### Detección, selección y limpieza

- Se agregó detección por mosaicos para imágenes largas o de alta resolución, junto con pruebas de detección.
- Se mejoraron el preprocesamiento de detección y la gestión de proveedores y runtimes.
- Se integraron herramientas de selección con lazo, rectángulo, selección múltiple y pluma, incluida la conversión de selecciones en cuadros de detección.
- Se añadieron herramientas para pintar la máscara de limpieza y editar máscaras de limpieza generadas.
- Se sincronizaron los resultados de detección con las capas de diálogo, se conservaron las capas manuales y se mejoró la visibilidad de los cuadros tras la detección por lotes y la limpieza.

### Traducción, modelos y exportación

- Se agregaron los archivos de localización al español y versiones en español del README y de la guía de contribución.
- Se restituyó la pestaña de ajustes de Traducción y se añadió una acción independiente **Traducir** en la barra del flujo.
- La acción independiente de traducción y la exportación del texto OCR abarcan todas las imágenes abiertas.
- La exportación OCR genera un solo archivo `.txt` con encabezados por página y el texto original/traducido cuando hay traducciones.
- Se mejoraron la interfaz de administración de modelos, sus descripciones, el soporte de GPU/runtime, la cancelación de descargas y la eliminación de modelos.
- Se añadió exportación organizada por carpetas y se ampliaron los flujos de exportación, incluidos texto OCR, PDF y PSD.

### Correcciones de integración

- Se mejoró el inicio del backend Python, con validación del intérprete y errores de inicio más claros.
- Se reenganchan los eventos del cursor cada vez que se recrea el canvas, incluso después de cerrar todas las imágenes abiertas.
- Se eliminó una propiedad `deleteModel` duplicada que provocaba un error del compilador TypeScript.
- Los errores al cargar el registro de modelos ahora se muestran en Ajustes → Modelos en lugar de dejar la lista vacía sin explicación.
- Se agregaron etiquetas para los ajustes de modelos y traducción en inglés y español.
- Se limitaron los cambios de documentación del proyecto; las guías en español se mantienen en archivos separados.

## Revisión de TODO.md

- Se marcó como completada la **detección por mosaicos para páginas largas o de alta resolución**; la implementación y las pruebas enfocadas están presentes.
- Ninguna otra tarea pendiente quedó claramente completada por esta integración. Siguen abiertas: desinstalador NSIS personalizado, empaquetado de `tokenizers` para PaddleOCR-VL, herramienta de máscara de limpieza, crear una máscara al convertir selecciones en detecciones, vista antes/después, modo de líneas en la pluma, cursor predeterminado invertido para la herramienta de texto, copiar objetos entre páginas y la búsqueda continua de errores.

## Validación

- `npm run build` — correcto.
- `git diff --check` — correcto.
- La última ejecución de pruebas Python no pudo iniciarse porque `pytest` no está instalado en el entorno virtual del proyecto.
