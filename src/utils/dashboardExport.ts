import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface ExportProgressState {
  progress: number;
  step: string;
  status: 'idle' | 'capturing' | 'formatting' | 'done' | 'error';
}

export type ExportProgressCallback = (progress: number, stageText: string) => void;

/**
 * Clean clone of element for high-fidelity export
 */
function prepareElementForCapture(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  // Ensure no interactive overlays or edit handles show in exported snapshot
  const buttonsToHide = clone.querySelectorAll('button, select, input, .no-export, .group-hover\\:opacity-100, [data-export-ignore="true"]');
  buttonsToHide.forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });
  return clone;
}

/**
 * Capture any HTML element to high-res canvas using html2canvas
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  options: {
    backgroundColor?: string;
    scale?: number;
    onProgress?: (state: ExportProgressState) => void;
  } = {}
): Promise<HTMLCanvasElement> {
  const scale = options.scale || 2.5;
  const backgroundColor = options.backgroundColor || '#161616';

  if (options.onProgress) {
    options.onProgress({ progress: 20, step: 'Preparing elements and fonts...', status: 'capturing' });
  }

  // Find and hide any temp controls
  const temporaryHidden: { el: HTMLElement; prevDisplay: string }[] = [];
  const controls = element.querySelectorAll<HTMLElement>('.no-export, button:not(.keep-export), [data-export-ignore="true"]');
  controls.forEach(ctrl => {
    temporaryHidden.push({ el: ctrl, prevDisplay: ctrl.style.display });
    ctrl.style.display = 'none';
  });

  try {
    if (options.onProgress) {
      options.onProgress({ progress: 50, step: 'Rasterizing vector charts and typography...', status: 'capturing' });
    }

    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor,
      logging: false,
      windowWidth: element.scrollWidth || 1280,
      windowHeight: element.scrollHeight || 900,
      onclone: (clonedDoc) => {
        // Ensure fonts and colors are cleanly preserved in clone
        const clonedRoot = clonedDoc.body;
        clonedRoot.style.fontFamily = 'IBM Plex Sans, Cairo, sans-serif';
      },
    });

    if (options.onProgress) {
      options.onProgress({ progress: 85, step: 'Rendering final high-res bitmap...', status: 'formatting' });
    }

    return canvas;
  } finally {
    // Restore controls
    temporaryHidden.forEach(item => {
      item.el.style.display = item.prevDisplay;
    });
  }
}

/**
 * Trigger browser file download for a Blob or DataURL
 */
export function triggerFileDownload(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export Entire Dashboard as High-Res PNG
 */
export async function exportDashboardAsPng(
  dashboardElement: HTMLElement,
  titleOrOptions: string | {
    title: string;
    datasetName?: string;
    themeBg?: string;
  },
  onProgressState?: (state: ExportProgressState) => void
): Promise<void> {
  const title = typeof titleOrOptions === 'string' ? titleOrOptions : titleOrOptions.title;
  const datasetName = typeof titleOrOptions === 'object' ? titleOrOptions.datasetName : undefined;
  const themeBg = typeof titleOrOptions === 'object' ? titleOrOptions.themeBg || '#161616' : '#161616';

  if (onProgressState) {
    onProgressState({ progress: 10, step: 'Initializing PNG export engine...', status: 'capturing' });
  }

  const canvas = await captureElementToCanvas(dashboardElement, {
    backgroundColor: themeBg,
    scale: 2.5,
    onProgress: onProgressState,
  });

  // Create formatted export canvas with header banner and timestamp
  const finalCanvas = document.createElement('canvas');
  const ctx = finalCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2D context');

  const headerHeight = 70;
  const footerHeight = 40;
  const padding = 24;

  finalCanvas.width = canvas.width + padding * 2;
  finalCanvas.height = canvas.height + headerHeight + footerHeight + padding * 2;

  // Background
  ctx.fillStyle = themeBg;
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  // Top Accent Line (IBM Blue)
  ctx.fillStyle = '#0f62fe';
  ctx.fillRect(0, 0, finalCanvas.width, 6);

  // Header Banner
  ctx.font = 'bold 28px "IBM Plex Sans", Cairo, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, padding, 42);

  ctx.font = '14px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#33b1ff';
  const subtitle = `IBM CARBON ANALYTICS • DATASET: ${datasetName || 'Active'} • EXPORTED: ${new Date().toLocaleString()}`;
  ctx.fillText(subtitle, padding, 62);

  // Draw main dashboard canvas
  ctx.drawImage(canvas, padding, headerHeight + padding);

  // Footer Banner
  ctx.fillStyle = '#393939';
  ctx.fillRect(padding, finalCanvas.height - footerHeight, finalCanvas.width - padding * 2, 1);

  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#8d8d8d';
  ctx.fillText('CONFIDENTIAL & PROPRIETARY • GENERATED VIA IBM CARBON DATA PLATFORM', padding, finalCanvas.height - 15);

  if (onProgressState) {
    onProgressState({ progress: 95, step: 'Saving PNG image to disk...', status: 'formatting' });
  }

  const cleanFileName = `Dashboard_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
  const dataUrl = finalCanvas.toDataURL('image/png');
  triggerFileDownload(dataUrl, cleanFileName);

  if (onProgressState) {
    onProgressState({ progress: 100, step: 'Export complete!', status: 'done' });
  }
}

/**
 * Export Entire Dashboard as PDF Document
 */
export async function exportDashboardAsPdf(
  dashboardElement: HTMLElement,
  titleOrOptions: string | {
    title: string;
    datasetName?: string;
    themeBg?: string;
    isAr?: boolean;
    orientation?: 'landscape' | 'portrait';
  },
  onProgressState?: (state: ExportProgressState) => void
): Promise<void> {
  const title = typeof titleOrOptions === 'string' ? titleOrOptions : titleOrOptions.title;
  const datasetName = typeof titleOrOptions === 'object' ? titleOrOptions.datasetName : undefined;
  const themeBg = typeof titleOrOptions === 'object' ? titleOrOptions.themeBg || '#161616' : '#161616';
  const orientation = typeof titleOrOptions === 'object' && titleOrOptions.orientation ? titleOrOptions.orientation : 'landscape';

  if (onProgressState) {
    onProgressState({ progress: 10, step: 'Initializing PDF generation engine...', status: 'capturing' });
  }

  const canvas = await captureElementToCanvas(dashboardElement, {
    backgroundColor: themeBg,
    scale: 2.0,
    onProgress: onProgressState,
  });

  if (onProgressState) {
    onProgressState({ progress: 80, step: 'Formatting PDF pages and vector layout...', status: 'formatting' });
  }

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  // Header
  const isDark = !['#ffffff', '#f4f4f4'].includes(themeBg.toLowerCase());
  pdf.setFillColor(isDark ? 22 : 244, isDark ? 22 : 244, isDark ? 22 : 244);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Top Color Accent
  pdf.setFillColor(15, 98, 254);
  pdf.rect(0, 0, pageWidth, 2.5, 'F');

  // Header Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(isDark ? 255 : 22, isDark ? 255 : 22, isDark ? 255 : 22);
  pdf.text(title, margin, 12);

  // Subtitle
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(isDark ? 168 : 100, isDark ? 168 : 100, isDark ? 168 : 100);
  pdf.text(
    `IBM Carbon Analytics Hub | Dataset: ${datasetName || 'Primary'} | Date: ${new Date().toLocaleDateString()}`,
    margin,
    17
  );

  // Scale dashboard image to fit PDF page
  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const startY = 22;
  const maxAvailableHeight = pageHeight - startY - 14;

  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  if (imgHeight <= maxAvailableHeight) {
    // Fits single page
    pdf.addImage(imgData, 'JPEG', margin, startY, imgWidth, imgHeight);
  } else {
    // Multi-page slicing
    let heightLeft = imgHeight;
    let position = startY;

    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.setFillColor(isDark ? 22 : 244, isDark ? 22 : 244, isDark ? 22 : 244);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
  }

  // Footer on each page
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(140, 140, 140);
    pdf.text(
      `Page ${i} of ${totalPages} • Generated via IBM Carbon Data & AI Platform`,
      margin,
      pageHeight - 5
    );
  }

  if (onProgressState) {
    onProgressState({ progress: 95, step: 'Building PDF document file...', status: 'formatting' });
  }

  const cleanFileName = `Dashboard_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(cleanFileName);

  if (onProgressState) {
    onProgressState({ progress: 100, step: 'PDF Export complete!', status: 'done' });
  }
}

/**
 * Export a Single Chart or KPI Card as High-Res PNG
 */
export async function exportSingleWidgetAsPng(
  chartCardElement: HTMLElement,
  widgetTitle: string,
  onProgressState?: (state: ExportProgressState) => void,
  themeBg: string = '#262626'
): Promise<void> {
  if (onProgressState) {
    onProgressState({ progress: 20, step: 'Capturing chart snapshot...', status: 'capturing' });
  }

  const canvas = await captureElementToCanvas(chartCardElement, {
    backgroundColor: themeBg,
    scale: 3.0,
    onProgress: onProgressState,
  });

  if (onProgressState) {
    onProgressState({ progress: 90, step: 'Generating PNG image...', status: 'formatting' });
  }

  const cleanFileName = `Chart_${widgetTitle.replace(/\s+/g, '_')}_${Date.now()}.png`;
  const dataUrl = canvas.toDataURL('image/png');
  triggerFileDownload(dataUrl, cleanFileName);

  if (onProgressState) {
    onProgressState({ progress: 100, step: 'Chart PNG downloaded!', status: 'done' });
  }
}

export const exportSingleChartAsPng = exportSingleWidgetAsPng;

/**
 * Export a Single Chart as Formatted PDF
 */
export async function exportSingleWidgetAsPdf(
  chartCardElement: HTMLElement,
  widgetTitle: string,
  onProgressState?: (state: ExportProgressState) => void,
  themeBg: string = '#262626'
): Promise<void> {
  if (onProgressState) {
    onProgressState({ progress: 20, step: 'Capturing chart layout...', status: 'capturing' });
  }

  const canvas = await captureElementToCanvas(chartCardElement, {
    backgroundColor: themeBg,
    scale: 2.5,
    onProgress: onProgressState,
  });

  if (onProgressState) {
    onProgressState({ progress: 75, step: 'Rendering PDF layout...', status: 'formatting' });
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a5',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const isDark = !['#ffffff', '#f4f4f4'].includes(themeBg.toLowerCase());

  pdf.setFillColor(isDark ? 38 : 244, isDark ? 38 : 244, isDark ? 38 : 244);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Accent Line
  pdf.setFillColor(15, 98, 254);
  pdf.rect(0, 0, pageWidth, 2, 'F');

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(isDark ? 255 : 22, isDark ? 255 : 22, isDark ? 255 : 22);
  pdf.text(widgetTitle, margin, 10);

  // Subtitle
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`IBM Carbon Analytics Single Chart Snapshot • ${new Date().toLocaleString()}`, margin, 14);

  // Chart Image
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const startY = 18;
  const finalHeight = Math.min(imgHeight, pageHeight - startY - 10);

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', margin, startY, imgWidth, finalHeight);

  // Footer
  pdf.setFontSize(6);
  pdf.setTextColor(140, 140, 140);
  pdf.text('IBM Carbon Data & AI Platform • Single Chart Export', margin, pageHeight - 4);

  if (onProgressState) {
    onProgressState({ progress: 95, step: 'Saving PDF file...', status: 'formatting' });
  }

  const cleanFileName = `Chart_${widgetTitle.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  pdf.save(cleanFileName);

  if (onProgressState) {
    onProgressState({ progress: 100, step: 'Chart PDF downloaded!', status: 'done' });
  }
}

export const exportSingleChartAsPdf = exportSingleWidgetAsPdf;

