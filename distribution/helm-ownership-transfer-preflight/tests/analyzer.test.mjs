import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOwnership, parseResources, renderEvidenceHtml } from '../analyzer.mjs';

const cm = (name, owner = '', extra = '') => `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\n  namespace: test\n  annotations:\n    meta.helm.sh/release-name: ${owner}\n    meta.helm.sh/release-namespace: test\n${extra}`;
test('parses multi-document YAML', () => assert.equal(parseResources(`${cm('a','x')}\n---\n${cm('b','x')}`).length, 2));
test('normalizes cluster-scoped identity across API versions', () => {
  const [x] = parseResources('apiVersion: apiextensions.k8s.io/v1\nkind: CustomResourceDefinition\nmetadata:\n  name: widgets.example.io');
  assert.equal(x.namespace, '_cluster'); assert.equal(x.group, 'apiextensions.k8s.io');
});
test('blocks Helm issue 32218 transfer deletion shape', () => {
  const r = analyzeOwnership({oldManifest:cm('shared','release-a'),adoptingManifest:cm('shared','release-b'),liveInventory:cm('shared','release-a'),oldRelease:'release-a',newRelease:'release-b',oldNamespace:'test',newNamespace:'test'});
  assert.equal(r.status,'BLOCK'); assert.ok(r.findings.some(x=>x.code==='DELETE_AFTER_TRANSFER'));
});
test('blocks unexpected live owner', () => {
  const r = analyzeOwnership({oldManifest:'',adoptingManifest:cm('x','release-b'),liveInventory:cm('x','release-c'),oldRelease:'release-a',newRelease:'release-b'});
  assert.ok(r.findings.some(x=>x.code==='INVALID_OWNER'));
});
test('flags shared cluster resource', () => {
  const crd='apiVersion: apiextensions.k8s.io/v1\nkind: CustomResourceDefinition\nmetadata:\n  name: widgets.example.io';
  const r=analyzeOwnership({oldManifest:crd,adoptingManifest:crd,oldRelease:'a',newRelease:'b'});
  assert.ok(r.findings.some(x=>x.code==='SHARED_CLUSTER_RESOURCE'));
});
test('blocks duplicate target identity', () => {
  const r=analyzeOwnership({oldManifest:'',adoptingManifest:`${cm('x')}\n---\n${cm('x')}`,oldRelease:'a',newRelease:'b'});
  assert.ok(r.findings.some(x=>x.code==='DUPLICATE_TARGET_IDENTITY'));
});
test('passes disjoint manifests with matching new live owner', () => {
  const r=analyzeOwnership({oldManifest:cm('old','a'),adoptingManifest:cm('new','b'),liveInventory:cm('new','b'),oldRelease:'a',newRelease:'b'});
  assert.equal(r.status,'PASS');
});
test('reviews missing live evidence', () => {
  const r=analyzeOwnership({oldManifest:'',adoptingManifest:cm('new','b'),oldRelease:'a',newRelease:'b'});
  assert.equal(r.status,'REVIEW'); assert.ok(r.findings.some(x=>x.code==='LIVE_STATE_UNVERIFIED'));
});
test('renders standalone escaped HTML evidence', () => {
  const r=analyzeOwnership({oldManifest:'',adoptingManifest:cm('<x>','b'),oldRelease:'a',newRelease:'b'});
  const html=renderEvidenceHtml(r); assert.ok(html.startsWith('<!doctype html>')); assert.ok(html.includes('&lt;x&gt;'));
});
