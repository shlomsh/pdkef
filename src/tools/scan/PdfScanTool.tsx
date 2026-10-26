import BasePdfTool from '../../shell/BasePdfTool.tsx';

// SCAN-01 stub: replaced by the real island (docs/scan-to-pdf.md).
export default function PdfScanTool() {
  return <BasePdfTool hasFiles={false} onFilesAdded={() => {}} accept="image/jpeg,image/png" />;
}
