import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRouting, parseWorkflow } from "../core.mjs";

const inventory = (overrides={}) => ({repository:"acme/widgets",runners:[{name:"a",labels:["linux","x64"],group:"prod"},{name:"b",labels:["linux","x64"],group:"prod"}],groups:[{name:"prod",repositories:["acme/widgets"]}],...overrides});
const workflow = (runsOn, extra="") => `jobs:\n  build:\n${extra}    runs-on: ${runsOn}\n    steps:\n      - run: true\n`;

test("exact labels with two runners pass",()=>assert.equal(analyzeRouting(workflow("[self-hosted, linux, x64]"),inventory()).status,"PASS"));
test("missing label blocks",()=>assert.equal(analyzeRouting(workflow("[self-hosted, linux, arm64]"),inventory()).status,"BLOCK"));
test("unknown group blocks",()=>assert.ok(analyzeRouting(`jobs:\n  build:\n    runs-on:\n      group: missing\n      labels: [linux]\n`,inventory()).findings.some((f)=>f.code==="RUNNER_GROUP_UNKNOWN")));
test("group repository denial blocks",()=>assert.ok(analyzeRouting(`jobs:\n  build:\n    runs-on:\n      group: prod\n      labels: [linux]\n`,inventory({groups:[{name:"prod",repositories:["acme/other"]}]})).findings.some((f)=>f.code==="GROUP_REPOSITORY_ACCESS")));
test("matrix expands and detects unsatisfied member",()=>{const text=workflow(`[self-hosted, linux, "\${{ matrix.arch }}"]`,`    strategy:\n      matrix:\n        arch: [x64, arm64]\n`);assert.equal(parseWorkflow(text).jobs[0].demands.length,2);assert.equal(analyzeRouting(text,inventory()).status,"BLOCK")});
test("matrix passes when every member has redundancy",()=>{const text=workflow(`[self-hosted, linux, "\${{ matrix.arch }}"]`,`    strategy:\n      matrix:\n        arch: [x64, arm64]\n`);const inv=inventory({runners:[{name:"x1",labels:["linux","x64"]},{name:"x2",labels:["linux","x64"]},{name:"a1",labels:["linux","arm64"]},{name:"a2",labels:["linux","arm64"]}]});assert.equal(analyzeRouting(text,inv).status,"PASS")});
test("single runner is review",()=>assert.equal(analyzeRouting(workflow("[self-hosted, linux, x64]"),inventory({runners:[{name:"only",labels:["linux","x64"]}]})).status,"REVIEW"));
test("bare self-hosted fallback is review",()=>assert.ok(analyzeRouting(workflow("self-hosted"),inventory()).findings.some((f)=>f.code==="BROAD_SELF_HOSTED_FALLBACK")));
test("unresolved expression is review",()=>assert.ok(analyzeRouting(workflow('"${{ inputs.runner }}"'),inventory()).findings.some((f)=>f.code==="DYNAMIC_ROUTING_EXPRESSION")));
test("GitHub-hosted job remains out of scope",()=>assert.equal(analyzeRouting(workflow("ubuntu-latest"),inventory({runners:[]})).status,"PASS"));
test("all eligible runners offline or busy is review",()=>assert.ok(analyzeRouting(workflow("[self-hosted, linux, x64]"),inventory({runners:[{name:"a",labels:["linux","x64"],status:"offline"},{name:"b",labels:["linux","x64"],busy:true}]})).findings.some((f)=>f.code==="NO_CURRENTLY_IDLE_RUNNER")));
