import { analyzeOwnership, renderEvidenceHtml } from './analyzer.mjs';
const $ = id => document.getElementById(id);
const read = async id => $(id).files[0] ? $(id).files[0].text() : '';
let lastReport;
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    lastReport = analyzeOwnership({
      oldManifest: await read('old'), adoptingManifest: await read('adopting'), liveInventory: await read('live'),
      oldRelease: $('oldRelease').value.trim(), oldNamespace: $('oldNamespace').value.trim() || 'default',
      newRelease: $('newRelease').value.trim(), newNamespace: $('newNamespace').value.trim() || 'default'
    });
    $('result').textContent = JSON.stringify(lastReport, null, 2);
    $('status').textContent = lastReport.status;
    $('status').className = lastReport.status.toLowerCase();
    $('downloads').hidden = false;
    window.dispatchEvent(new CustomEvent('helmOwnershipPreflight:analysisComplete', { detail: { status: lastReport.status, findingCount: lastReport.summary.findings } }));
  } catch (error) {
    $('status').textContent = 'ERROR';
    $('result').textContent = error.message;
  }
});
function download(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
$('json').onclick = () => download('helm-ownership-preflight.json','application/json',JSON.stringify(lastReport,null,2));
$('html').onclick = () => download('helm-ownership-preflight.html','text/html',renderEvidenceHtml(lastReport));
