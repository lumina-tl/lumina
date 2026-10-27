/** Bilingual model descriptions — Inpainting. */
import type { ModelDescMap } from "./index";

export const INPAINT_DESCS: ModelDescMap = {
  lama: {
    en: `Big-LaMa general-purpose inpainting (OpenCV build, Jan 2025 ONNX).

• Trained on natural/real imagery — solid all-round quality for removing text on any artwork.
• On manga screentones and line art, the LaMa Manga fine-tune below usually reconstructs cleaner.
• Good fallback when you want a smaller, faster download.
• Source: huggingface.co/opencv/inpainting_lama`,
    es: `Big-LaMa, modelo de relleno de propósito general (versión de OpenCV, ONNX de enero de 2025).

• Entrenado con imágenes naturales; ofrece resultados sólidos para eliminar texto de distintos tipos de ilustración.
• En las tramas y el arte lineal del manga, el ajuste de LaMa Manga suele reconstruir la imagen con mayor limpieza.
• Buena alternativa si prefieres una descarga más pequeña y rápida.
• Fuente: huggingface.co/opencv/inpainting_lama`,
    id: `Big-LaMa inpainting serba-guna (build OpenCV, ONNX Jan 2025).

• Dilatih pada citra natural/nyata — kualitas andal untuk menghapus teks di gambar apa pun.
• Pada screentone dan line-art manga, fine-tune LaMa Manga di bawah biasanya merekonstruksi lebih bersih.
• Pilihan cadangan yang baik saat ingin file lebih kecil dan download lebih cepat.
• Sumber: huggingface.co/opencv/inpainting_lama`,
  },
  lama_manga: {
    en: `Big-LaMa fine-tuned on ~300K manga & anime images (Sanster AnimeMangaInpainting checkpoint, ONNX conversion by koharu).

• Best-in-class for manga pages: reconstructs screentones, line art, and textures around removed text so patches blend into the artwork.
• The recommended default for inpainting.
• Larger file — the first download takes a bit longer.
• Source: huggingface.co/mayocream/lama-manga-onnx`,
    es: `Big-LaMa ajustado con unas 300 000 imágenes de manga y anime (checkpoint AnimeMangaInpainting de Sanster, conversión a ONNX de koharu).

• Especializado en páginas de manga: reconstruye las tramas, el arte lineal y las texturas alrededor del texto eliminado para que los parches se integren con la ilustración.
• Opción predeterminada recomendada para la limpieza.
• El archivo es más grande; la primera descarga puede tardar un poco más.
• Fuente: huggingface.co/mayocream/lama-manga-onnx`,
    id: `Big-LaMa yang di-fine-tune pada ~300 ribu gambar manga & anime (checkpoint Sanster AnimeMangaInpainting, konversi ONNX oleh koharu).

• Terbaik untuk halaman manga: merekonstruksi screentone, line-art, dan tekstur di sekitar teks yang dihapus sehingga patch menyatu dengan gambar.
• Default yang direkomendasikan untuk inpainting.
• File lebih besar — unduhan pertama agak lebih lama.
• Sumber: huggingface.co/mayocream/lama-manga-onnx`,
  },
};
