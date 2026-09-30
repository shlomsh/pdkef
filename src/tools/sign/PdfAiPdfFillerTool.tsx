// Separate product entry, one signing workspace: AI is absent from the ordinary
// Sign import graph and applied answers keep its existing draft/history/export.
import PdfSignTool from './PdfSignTool.tsx';
import AiPdfFillerPanel from './ai/AiPdfFillerPanel.tsx';
export default function PdfAiPdfFillerTool() {
  return <PdfSignTool shellMessages={{privacyLine: 'Manual editing stays on your device. AI sends a page and your facts only when requested.'}} renderPanel={session => <AiPdfFillerPanel session={session} />} />;
}
