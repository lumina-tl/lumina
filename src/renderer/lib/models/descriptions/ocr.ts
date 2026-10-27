/** Bilingual model descriptions — OCR. */
import type { ModelDescMap } from "./index";

export const OCR_DESCS: ModelDescMap = {
  manga_ocr: {
    en: `Japanese text recognition trained on manga (original by kha-white, ONNX port by mayocream).

• The most accurate Japanese recognizer of the three — handles vertical, horizontal, stylized, and even handwritten typesetting.
• Japanese only: use it when the source language is Japanese; it won't help for other languages.
• Lightweight and fast.
• Source: huggingface.co/mayocream/manga-ocr-onnx`,
    es: `Reconocimiento de texto japonés entrenado con manga (original de kha-white, conversión a ONNX de mayocream).

• El reconocedor más preciso de japonés de los tres; admite texto vertical, horizontal, estilizado e incluso tipografía manuscrita.
• Solo japonés: úsalo cuando el idioma de origen sea japonés; no sirve para otros idiomas.
• Ligero y rápido.
• Fuente: huggingface.co/mayocream/manga-ocr-onnx`,
    id: `Pengenalan teks bahasa Jepang yang dilatih pada manga (asli oleh kha-white, port ONNX oleh mayocream).

• Paling akurat untuk bahasa Jepang di antara ketiganya — menangani teks vertikal, horizontal, bergaya, bahkan tulisan tangan.
• Khusus Jepang: pakai saat bahasa sumbernya Jepang; tidak membantu untuk bahasa lain.
• Ringan dan cepat.
• Sumber: huggingface.co/mayocream/manga-ocr-onnx`,
  },
  ppocrv6: {
    en: `PP-OCRv6 medium by PaddlePaddle — recognition for 50+ languages including Japanese. Very fast on CPU (~5 ms/line).

• Reads whole lines at once — handles long / multi-line horizontal text better than Baberu OCR.
• For Japanese manga typesetting, manga-ocr or Baberu OCR are still the better choice.
• ⚠ Model limitation: not trained on manga text rendered at an angle, so rotated / skewed text is rarely recognized accurately. When in doubt, try manga-ocr or Baberu OCR.
• Source: huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
    es: `PP-OCRv6 medium de PaddlePaddle: reconoce más de 50 idiomas, incluido el japonés. Muy rápido en CPU (aprox. 5 ms por línea).

• Lee líneas completas; maneja mejor que Baberu OCR el texto horizontal largo o distribuido en varias líneas.
• Para la tipografía de manga japonés, manga-ocr o Baberu OCR suelen dar mejores resultados.
• ⚠ Limitación: no se entrenó con texto de manga inclinado o girado, por lo que rara vez lo reconoce con precisión. Si tienes dudas, prueba manga-ocr o Baberu OCR.
• Fuente: huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
    id: `PP-OCRv6 medium oleh PaddlePaddle — pengenalan untuk 50+ bahasa termasuk Jepang. Sangat cepat di CPU (~5 ms/baris).

• Membaca seluruh baris sekaligus — menangani teks horizontal panjang / multi-baris lebih baik daripada Baberu OCR.
• Untuk tata letak manga Jepang, manga-ocr atau Baberu OCR tetap pilihan yang lebih baik.
• ⚠ Keterbatasan model: tidak dilatih pada teks manga yang dirender miring/berotasi, jadi teks miring jarang terbaca akurat. Jika ragu, coba manga-ocr atau Baberu OCR.
• Sumber: huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx`,
  },
  baberu: {
    en: `Baberu OCR (by genshiai-daichi) — a 115M-parameter multilingual model (Japanese / Chinese / English) purpose-built for manga speech bubbles.

• Trained on real manga typesetting: vertical text, horizontal text, and sound effects (SFX).
• Reads up to 256 characters per bubble — long narration and dense dialogue no longer cut off mid-sentence.
• High recognition accuracy on stylized fonts, sound effects, and handwriting via Manga109-s supervision.
• Fast CPU inference — the recommended default OCR model for manga.
• Source: huggingface.co/genshiai-daichi/baberu-ocr`,
    es: `Baberu OCR (de genshiai-daichi): modelo multilingüe de 115 millones de parámetros (japonés, chino e inglés), diseñado específicamente para los globos de diálogo del manga.

• Entrenado con tipografía real de manga: texto vertical, horizontal y efectos de sonido.
• Interpreta mejor los diseños estilizados de los globos que un OCR de propósito general.
• Rápido en CPU; recomendado para manga.
• ⚠ Limitación: puede cortar los textos largos a mitad de una palabra (por ejemplo, «workhorse» podría quedar como «wo»). Reconoce bien cada globo, pero puede perder el final de los muy largos. La traducción suele reconstruir el texto faltante por el contexto. Para globos muy largos, prueba PP-OCRv6.
• Fuente: huggingface.co/genshiai-daichi/baberu-ocr`,
    id: `Baberu OCR (oleh genshiai-daichi) — model multibahasa 115M parameter (Jepang / Cina / Inggris) yang dirancang khusus untuk gelembung ucapan manga.

• Dilatih pada tata letak manga asli: teks vertikal, teks horizontal, dan efek suara (SFX).
• Membaca hingga 256 karakter per gelembung — teks narasi panjang dan dialog padat tidak lagi terpotong di tengah kalimat.
• Akurasi tinggi pada teks bergaya, efek suara, dan tulisan tangan melalui pelatihan Manga109-s.
• Cepat di CPU — model OCR default yang direkomendasikan untuk manga.
• Sumber: huggingface.co/genshiai-daichi/baberu-ocr`,
  },
  paddleocr_vl: {
    en: `In development — integration is still being tuned; the app works with it, but output may be unreliable.

PaddleOCR-VL 1.6 (by PaddlePaddle, ONNX port by iaa2005) — a vision-language OCR model (NaViT + ERNIE-4.5 decoder) that reads whole text regions at once, in many languages (zh / en / ru / more).

• Region-based: adjacent text boxes are recognized together in one pass with context — better on multi-line bubbles.
• Multi-language, strongest on zh/en; Japanese manga typesetting is handled better by manga-ocr or Baberu.
• Slow: roughly 10–25 s per page on CPU — a fallback model, not a daily driver.
• ~1.2 GB download.
• Source: huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
    es: `En desarrollo: la integración aún se está ajustando. El modelo funciona en la aplicación, pero sus resultados pueden no ser fiables.

PaddleOCR-VL 1.6 (de PaddlePaddle, conversión a ONNX de iaa2005): modelo OCR de visión y lenguaje (NaViT + decodificador ERNIE-4.5) que procesa regiones de texto completas en varios idiomas (chino, inglés, ruso y más).

• Procesa regiones: reconoce cuadros de texto cercanos en una sola pasada y con contexto; funciona mejor con globos de varias líneas.
• Multilingüe, con mejores resultados en chino e inglés. Para la tipografía del manga japonés, conviene más usar manga-ocr o Baberu.
• Lento: aproximadamente 10–25 s por página en CPU. Es una alternativa, no la opción recomendada para el uso diario.
• Descarga de aproximadamente 1,2 GB.
• Fuente: huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
    id: `Sedang disesuaikan — integrasinya masih dituning; aplikasi tetap bisa memakainya, tapi hasilnya mungkin belum akurat.

PaddleOCR-VL 1.6 (oleh PaddlePaddle, port ONNX oleh iaa2005) — model OCR vision-language (NaViT + decoder ERNIE-4.5) yang membaca seluruh region teks sekaligus, multibahasa (zh / en / ru / lainnya).

• Berbasis region: kotak teks yang berdekatan dikenali sekaligus dalam satu proses dengan konteks — lebih baik pada gelembung multi-baris.
• Multibahasa, terkuat di zh/en; tata letak manga Jepang lebih baik ditangani manga-ocr atau Baberu.
• Lambat: sekitar 10–25 detik per halaman di CPU — model cadangan, bukan untuk pemakaian harian.
• Unduhan ±1.2 GB.
• Sumber: huggingface.co/iaa2005/PaddleOCR-VL-1.6-ONNX`,
  },
};
