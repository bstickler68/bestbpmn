/** Bietet einen Text oder eine Grafik als Download an (Firefox, Edge, Chrome). */
export function download(name: string, data: Blob): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(data);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Erst später freigeben, sonst bricht mancher Browser den Download ab.
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Tauscht die Endung: `Antrag.bpmn` wird zu `Antrag.svg`. */
export function withExtension(fileName: string, extension: string): string {
  return fileName.replace(/\.(bpmn20\.xml|bpmn|xml)$/i, '') + extension;
}

/** Rechnet die SVG-Grafik des Diagramms in ein PNG um, standardmäßig doppelt so groß für scharfen Druck. */
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('svg'));
      image.src = url;
    });
    const width = Math.max(1, Math.ceil(image.width * scale));
    const height = Math.max(1, Math.ceil(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
