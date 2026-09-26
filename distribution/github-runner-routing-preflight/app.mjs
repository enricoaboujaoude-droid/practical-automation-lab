import { analyzeRouting, renderHtml } from "./core.mjs";
const workflow = document.querySelector("#workflow");
const inventory = document.querySelector("#inventory");
const output = document.querySelector("#output");
let report = null;
workflow.value = `jobs:\n  build:\n    strategy:\n      matrix:\n        arch: [x64, arm64]\n    runs-on: [self-hosted, linux, "\${{ matrix.arch }}"]\n    steps:\n      - run: echo ok`;
inventory.value = JSON.stringify({repository:"acme/widgets",runners:[{name:"linux-x64-1",labels:["linux","x64"],group:"production"},{name:"linux-x64-2",labels:["linux","x64"],group:"production"},{name:"linux-arm64-1",labels:["linux","arm64"],group:"production"}],groups:[{name:"production",repositories:["acme/widgets"]}]}, null, 2);
document.querySelector("#form").addEventListener("submit", (event) => { event.preventDefault(); try { report = analyzeRouting(workflow.value, JSON.parse(inventory.value)); output.textContent = JSON.stringify(report, null, 2); } catch (error) { report = null; output.textContent = error.message; } });
function download(name, content, type) { const link=document.createElement("a"); link.href=URL.createObjectURL(new Blob([content],{type})); link.download=name; link.click(); URL.revokeObjectURL(link.href); }
document.querySelector("#json").addEventListener("click",()=>report&&download("runner-routing-preflight.json",JSON.stringify(report,null,2),"application/json"));
document.querySelector("#html").addEventListener("click",()=>report&&download("runner-routing-preflight.html",renderHtml(report),"text/html"));
