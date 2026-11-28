/** Developer notices & release advisories */

export type LocalizedText = string | Record<string, string>;

export interface DeveloperNoticeAction {
  label: LocalizedText;
  target: "models" | "settings";
}

export interface DeveloperNotice {
  id: string;
  version?: string;
  type: "warning" | "info" | "critical";
  badge?: LocalizedText;
  title: LocalizedText;
  message: LocalizedText;
  action?: DeveloperNoticeAction;
}

export const changelogEs: Record<string, { title: string; desc: string }> = {
  "Adaptive paint cursor.": {
    title: "Cursor adaptable para el pincel.",
    desc: "El círculo del pincel y la cruz invierten automáticamente sus colores según el fondo del canvas para permanecer visibles sobre páginas claras.",
  },
  "Movable text format bar.": {
    title: "Barra de formato de texto móvil.",
    desc: "Se puede arrastrar y voltear, y se oculta automáticamente mientras escribes.",
  },
  "Text behind objects.": {
    title: "Texto detrás de objetos.",
    desc: "Permite recortar objetos del primer plano de las selecciones para colocar capas de texto detrás de la ilustración.",
  },
  "Selection auto-scroll.": {
    title: "Desplazamiento automático de selección.",
    desc: "Desplaza la vista automáticamente al arrastrar selecciones rectangulares o de lazo cerca de los bordes del canvas.",
  },
  "Pen tool with vector shapes.": {
    title: "Herramienta Pluma con formas vectoriales.",
    desc: "Añade la herramienta Pluma Bézier (P) para crear selecciones o capas de formas vectoriales editables con relleno, trazo y edición directa de nodos y manejadores.",
  },
  "Individual model unloading.": {
    title: "Descarga individual de modelos.",
    desc: "Añade un botón para descargar modelos individualmente desde sus etiquetas activas en el monitor de recursos.",
  },
  "Nightly update channel.": {
    title: "Canal de actualizaciones Nightly.",
    desc: "Añade un selector de canales Estable/Nightly en los ajustes generales y compilaciones nightly automáticas con cada cambio en la rama main.",
  },
  "Layer locking.": {
    title: "Bloqueo de capas.",
    desc: "Añade un control para bloquear o desbloquear cada capa y evitar selecciones, movimientos, ediciones o eliminaciones accidentales.",
  },
  "Project thumbnails on landing page.": {
    title: "Miniaturas de proyectos en la pantalla de inicio.",
    desc: "Los proyectos recientes `.lmi` ahora muestran una miniatura de la vista del proyecto, capturada al guardarlo.",
  },
  "Visible update installation progress.": {
    title: "Progreso visible de instalación de actualizaciones.",
    desc: "Las actualizaciones ahora muestran una barra de progreso durante la instalación y ofrecen información de estado dentro de la aplicación.",
  },
  "Photoshop-style object rotation.": {
    title: "Rotación de objetos al estilo Photoshop.",
    desc: "Sustituye el controlador de rotación dedicado por una zona de rotación alrededor de los cuadros seleccionados; mantén Mayús para ajustar en incrementos de 15°.",
  },
  "False text rotation.": {
    title: "Rotación de texto incorrecta.",
    desc: "Corrige la detección de inclinación excesiva que rotaba diálogos que debían permanecer rectos.",
  },
  "Update installer freeze on Windows.": {
    title: "Bloqueo del instalador de actualizaciones en Windows.",
    desc: "Corrige las instalaciones de actualizaciones que se detenían o fallaban debido a bloqueos de archivos de procesos en segundo plano.",
  },
  "Settings reset on update.": {
    title: "Ajustes restablecidos tras una actualización.",
    desc: "Corrige el restablecimiento de los ajustes de la aplicación a sus valores predeterminados después de actualizar.",
  },
  "Manual clean over inpainted areas.": {
    title: "Limpieza manual sobre áreas de inpainting.",
    desc: "Corrige la acción «Limpiar área», que muestreaba la imagen original en lugar de las capas de inpainting o limpieza existentes.",
  },
  "Selection persistence on Select tool.": {
    title: "Persistencia de selección en la herramienta Selección.",
    desc: "Corrige las selecciones activas que no se borraban al hacer clic en el canvas o en objetos con la herramienta Selección.",
  },
  "Tool cursor color inversion.": {
    title: "Inversión del color del cursor de herramientas.",
    desc: "Corrige la inversión de color de los cursores de pincel, selección y pluma sobre fondos claros o blancos.",
  },
  "Image layer export failure.": {
    title: "Error al exportar capas de imagen.",
    desc: "Corrige un error `drawImage` al exportar proyectos guardados que contienen objetos en capas.",
  },
};

export function resolveLocalized(text: LocalizedText | undefined, lang: string): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[lang] || text.en || Object.values(text)[0] || "";
}

export const developerNotices: DeveloperNotice[] = [
  {
    id: "notice-rfdetr-seg-fp16-v050",
    version: "0.5.0",
    type: "info",
    badge: {
      en: "Model Update",
      es: "Actualización de modelo",
      id: "Pembaruan Model",
    },
    title: {
      en: "Koharu Layout RF-DETR Seg Updated to FP16",
      es: "Koharu Layout RF-DETR Seg actualizado a FP16",
      id: "Koharu Layout RF-DETR Seg Diperbarui ke FP16",
    },
    message: {
      en: "Koharu Layout RF-DETR Seg has been upgraded to an optimized FP16 model (koharu-layout-rfdetr-seg-2xl-1152-fp16.onnx). This cuts VRAM usage by ~45% (down from ~6GB to ~3.2GB), keeps all tensor buffers inside dedicated GPU memory, and doubles inference speed.\n\nBecause the model file name changed, previously installed weights are no longer detected. Open Settings → Models and click Download on Koharu Layout RF-DETR Seg to install the new model.",
      es: "Koharu Layout RF-DETR Seg se actualizó a un modelo FP16 optimizado (koharu-layout-rfdetr-seg-2xl-1152-fp16.onnx). Reduce el uso de VRAM aproximadamente un 45 % (de ~6 GB a ~3,2 GB), mantiene los búferes de tensores en la memoria dedicada de la GPU y duplica la velocidad de inferencia.\n\nComo cambió el nombre del archivo, la aplicación ya no detectará los pesos instalados anteriormente. Abre Ajustes → Modelos y pulsa Descargar en Koharu Layout RF-DETR Seg para instalar el modelo nuevo.",
      id: "Koharu Layout RF-DETR Seg telah diperbarui ke format FP16 (koharu-layout-rfdetr-seg-2xl-1152-fp16.onnx). Pembaruan ini menghemat pemakaian VRAM ~45% (turun dari ~6GB ke ~3.2GB), mencegah alokasi memory luber ke RAM sistem, serta mempercepat proses deteksi hingga 2x lipat.\n\nKarena nama berkas model berubah, model versi lama tidak lagi terdeteksi. Silakan buka Settings → Models dan klik Unduh (Download) pada Koharu Layout RF-DETR Seg untuk memasang model terbaru.",
    },
    action: {
      label: {
        en: "Open Models Settings",
        es: "Abrir ajustes de modelos",
        id: "Buka Pengaturan Model",
      },
      target: "models",
    },
  },
  {
    id: "notice-baberu-ocr-weights-v050",
    version: "0.5.0",
    type: "info",
    badge: {
      en: "Model Update",
      es: "Actualización de modelo",
      id: "Pembaruan Model",
    },
    title: {
      en: "Baberu OCR Updated (256-Token Support)",
      es: "Baberu OCR actualizado (compatible con 256 tokens)",
      id: "Pembaruan Baberu OCR (Dukungan 256 Karakter)",
    },
    message: {
      en: "Baberu OCR has been updated to v1.2 with support for up to 256 characters per bubble, resolving cut-offs in long dialogue and improving handwriting recognition.\n\nIf you downloaded Baberu OCR previously, open Settings → Models, click Delete on Baberu OCR, then click Download to get the updated weights.",
      es: "Baberu OCR se actualizó a la versión 1.2 y ahora admite hasta 256 caracteres por bocadillo. Esto evita que se corten los diálogos largos y mejora el reconocimiento de escritura a mano.\n\nSi ya habías descargado Baberu OCR, abre Ajustes → Modelos, pulsa Eliminar en Baberu OCR y luego Descargar para obtener los pesos actualizados.",
      id: "Baberu OCR telah diperbarui ke v1.2 dengan batas pembacaan hingga 256 karakter per gelembung, mengatasi teks dialog panjang yang terpotong serta meningkatkan akurasi tulisan tangan.\n\nBagi yang sudah mengunduh Baberu OCR sebelumnya, silakan buka Settings → Models, klik Hapus (Delete) pada Baberu OCR, lalu klik Unduh (Download) untuk mendapatkan model terbaru.",
    },
    action: {
      label: {
        en: "Open Models Settings",
        es: "Abrir ajustes de modelos",
        id: "Buka Pengaturan Model",
      },
      target: "models",
    },
  },
];
