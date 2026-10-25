// Evaluation report PDF. Uses the ONE report template (lib/reportFlow.js) and the shared evaluation sections (lib/evalSections.js),
// so it looks the same as the evaluation part of the DEM-AREA-SDG report and the technical report.
import { newReportDoc, Flow, APP_NAME } from "../../lib/reportFlow";
import { addEvaluation } from "../../lib/evalSections";
import { reportVersionLine } from "../../lib/reportVersion";

export { APP_NAME };

export async function generateEvalPdf({ e, spatial }) {
  const doc = newReportDoc();
  const f = new Flow(doc, { label: "Model Evaluation Report" });
  f.disclaimer = "This report presents results stored by the DEM-Correction benchmark. Please cross-verify them, as results can contain errors.";
  f.title("Model evaluation report", "How far to trust the elevation correction");
  f.indexAll = true;   // this report is only the evaluation, so list every part in the contents
  const indexPage = f.reserveContents("Contents", "What is in this report and where to find it.", { same: true });
  addEvaluation(f, { e, spatial });
  f.fillIndex(indexPage);
  f.versionLine = await reportVersionLine();
  f.finish();
  doc.save("dem-correction-evaluation-report.pdf");
}
