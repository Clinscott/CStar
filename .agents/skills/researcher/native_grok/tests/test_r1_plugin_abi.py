#!/usr/bin/env python3
"""R1 closed-schema, canonical-byte, and replay checks."""
from __future__ import annotations
import copy, hashlib, json, re, sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
SCHEMAS=("abstention.v1.schema.json","citation.v1.schema.json","evidence.v1.schema.json","invocation.v1.schema.json","plugin-manifest.v1.schema.json","proposal.v1.schema.json","result.v1.schema.json","terminal.v1.schema.json")
ZERO="0"*64
AUTH={"effect_authority":"cstar","lifecycle_authority":"cstar","plugin_output_authority":"evidence_only","result_authority":"cstar"}
class Invalid(Exception): pass
def canon(v): return (json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode("utf-8")
def digest(b): return hashlib.sha256(b).hexdigest()
def bind(d,k):
    u=dict(d); u.pop(k,None); out=dict(d); out[k]=digest(canon(u)); return out
def ref(root,ptr):
    if not ptr.startswith("#/"): raise Invalid("external ref")
    v=root
    for token in ptr[2:].split("/"): v=v[token.replace("~1","/").replace("~0","~")]
    return v
def val(x,s,root,path="$"):
    if "$ref" in s: return val(x,ref(root,s["$ref"]),root,path)
    if "const" in s and x!=s["const"]: raise Invalid(path+":const")
    if "enum" in s and x not in s["enum"]: raise Invalid(path+":enum")
    if "not" in s:
        try: val(x,s["not"],root,path)
        except Invalid: pass
        else: raise Invalid(path+":not")
    for branch in s.get("allOf",[]): val(x,branch,root,path)
    for key in ("anyOf","oneOf"):
        if key in s:
            matches=0
            for branch in s[key]:
                try: val(x,branch,root,path)
                except Invalid: pass
                else: matches+=1
            if (key=="oneOf" and matches!=1) or (key=="anyOf" and matches<1): raise Invalid(path+":"+key)
    t=s.get("type")
    if t=="object" and not isinstance(x,dict): raise Invalid(path+":object")
    if t=="array" and not isinstance(x,list): raise Invalid(path+":array")
    if t=="string" and not isinstance(x,str): raise Invalid(path+":string")
    if t=="integer" and (isinstance(x,bool) or not isinstance(x,int)): raise Invalid(path+":integer")
    if t=="boolean" and not isinstance(x,bool): raise Invalid(path+":boolean")
    if "required" in s:
        if not isinstance(x,dict): raise Invalid(path+":required")
        for k in s["required"]:
            if k not in x: raise Invalid(path+":missing:"+k)
    if isinstance(x,dict):
        props=s.get("properties",{})
        if s.get("additionalProperties") is False and set(x)-set(props): raise Invalid(path+":unknown")
        for k,v in props.items():
            if k in x: val(x[k],v,root,path+"."+k)
        if len(x)<s.get("minProperties",0) or len(x)>s.get("maxProperties",10**9): raise Invalid(path+":properties")
    if isinstance(x,list):
        if len(x)<s.get("minItems",0) or len(x)>s.get("maxItems",10**9): raise Invalid(path+":items")
        if s.get("uniqueItems") and len({json.dumps(i,sort_keys=True) for i in x})!=len(x): raise Invalid(path+":unique")
        if "items" in s:
            for i,v in enumerate(x): val(v,s["items"],root,f"{path}[{i}]")
    if isinstance(x,str):
        if len(x)<s.get("minLength",0) or len(x)>s.get("maxLength",10**9): raise Invalid(path+":length")
        if "pattern" in s and re.search(s["pattern"],x) is None: raise Invalid(path+":pattern")
    if isinstance(x,(int,float)) and not isinstance(x,bool):
        if x<s.get("minimum",-10**100) or x>s.get("maximum",10**100): raise Invalid(path+":range")
def load(path):
    raw=path.read_bytes(); value=json.loads(raw.decode("utf-8"))
    if raw!=canon(value): raise AssertionError("non-canonical JSON: "+str(path))
    if not isinstance(value,dict): raise AssertionError("non-object: "+str(path))
    return value
def closed(x,path="$"):
    if not isinstance(x,dict): return
    if x.get("type")=="object" and x.get("additionalProperties") is not False: raise AssertionError("open schema:"+path)
    for k,v in x.items(): closed(v,path+"."+k)
def evidence():
    return bind({"actual_identity":"unreported","authority":AUTH,"canonical_locator":"urn:corvus:evidence:1","claim_state":"OBSERVED","collector_attempt_count":0,"content_hash":ZERO,"credential_material_present":False,"evidence_id":"evidence-1","evidence_sha256":ZERO,"freshness_status":"current","observed_at":"2026-08-15T12:00:00Z","permission_class":"local_fixture","plugin_output_authority":"evidence_only","private_content_included":False,"query_hash":ZERO,"raw_source_included":False,"redaction_status":"not_required","requested_model":"gpt-5.6-luna","requested_reasoning":"max","schema":"researcher.evidence_receipt.v1","source_capability_id":"fixture.public","source_group":"local","source_receipt_hash":ZERO,"source_receipt_ref":"receipt://fixture/1","summary":"Bounded fixture observation."},"evidence_sha256")
def citation():
    return bind({"actual_identity":"unreported","authority":AUTH,"canonical_locator":"urn:corvus:evidence:1","citation_id":"citation-1","citation_sha256":ZERO,"claim_state":"OBSERVED","evidence_id":"evidence-1","locator_fragment":"fixture-1","observed_at":"2026-08-15T12:00:00Z","requested_model":"gpt-5.6-luna","requested_reasoning":"max","schema":"researcher.citation.v1","source_group":"local","source_receipt_hash":ZERO},"citation_sha256")
def abstention():
    return bind({"abstention_id":"abstention-1","abstention_sha256":ZERO,"actual_identity":"unreported","authority":AUTH,"bead_id":"bead-r1","code":"CAPABILITY_PROFILE_UNSATISFIED","decision_id":"decision-r1","evidence_refs":[],"execution_allowed":False,"plugin_id":"corvus.researcher.platform_neutral","reason":"Capability profile is not admitted.","requested_model":"gpt-5.6-luna","requested_reasoning":"max","retry_budget":0,"schema":"researcher.abstention.v1","set_id":"set-r1","source_capability_status":"NOT_ADMITTED__CAPABILITY_UNPROVEN","stage":"admission"},"abstention_sha256")
def invocation():
    return {"actual_identity":"unreported","as_of":"2026-08-15T12:00:00Z","authority":{"binding_source":"cstar_accepted_manifest_and_set","effect_authority":"cstar","lifecycle_authority":"cstar"},"bead_id":"bead-r1","budgets":{"max_model_calls":0,"max_network_calls":0,"max_output_bytes":4096,"max_provider_calls":0,"max_tool_calls":0},"decision_id":"decision-r1","deadline":{"on_timeout":"unknown","timeout_seconds":60},"freshness_window":{"unit":"hours","value":24},"idempotency_key":"effect-r1","mission_plan_sha256":ZERO,"operator_authorization_ref":"not-required","output_schema":"researcher.plugin_result.v1","plugin_binding_sha256":ZERO,"query":"bounded fixture query","requested_model":"gpt-5.6-luna","requested_reasoning":"max","request_id":"request-r1","retry_budget":0,"schema":"researcher.plugin_invocation.v1","set_id":"set-r1","source_capability_id":"fixture.public","target":{"kind":"fixture","public_scope":False,"scope":"fixture"}}
def result(kind):
    d={"actual_identity":"unreported","attempt_telemetry":{"attempts":0,"network_calls":0,"provider_calls":0,"retries":0,"tool_calls":0,"waits":0},"authority":AUTH,"bead_id":"bead-r1","budgets":{"max_model_calls":0,"max_network_calls":0,"max_output_bytes":4096,"max_provider_calls":0,"max_tool_calls":0},"decision_id":"decision-r1","elapsed_ms":0,"input_sha256":ZERO,"kind":kind,"output_sha256":ZERO,"plugin_binding_sha256":ZERO,"plugin_id":"corvus.researcher.platform_neutral","plugin_version":"1.0.0","requested_model":"gpt-5.6-luna","requested_reasoning":"max","request_id":"request-r1","result_id":"result-r1","result_sha256":ZERO,"retry_budget":0,"schema":"researcher.plugin_result.v1","set_id":"set-r1","source_receipt_hashes":[],"terminal_sha256":ZERO}
    d["receipt" if kind=="receipt" else "abstention"]=evidence() if kind=="receipt" else abstention()
    return bind(d,"result_sha256")
def proposal():
    return bind({"actual_identity":"unreported","authority":AUTH,"bead_id":"bead-r1","decision_id":"decision-r1","evidence_refs":["evidence-1"],"execution_allowed":False,"inferred_claims":[{"claim_id":"claim-inferred-1","evidence_refs":["evidence-1"],"inference_rule":"rule-1","state":"INFERRED","statement":"The bounded fixture is suitable for replay."}],"observed_claims":[{"claim_id":"claim-observed-1","evidence_refs":["evidence-1"],"state":"OBSERVED","statement":"The fixture has a stable canonical representation."}],"proposal_id":"proposal-r1","proposal_sha256":ZERO,"recommended_next_steps":[],"requested_model":"gpt-5.6-luna","requested_reasoning":"max","risks":[],"schema":"researcher.proposal.v1","set_id":"set-r1","unavailable_gaps":[]},"proposal_sha256")
def terminal():
    counters={k:0 for k in ("configuration_mutations","credential_reads","descendants","deployment_effects","forge_effects","git_publication","install_effects","network_calls","out_of_scope_writes","peer_messages","production_effects","protected_effects","provider_calls","retries","restart_effects","tool_calls","waits")}
    return bind({"actual_identity":"unreported","authority":AUTH,"bead_id":"bead-r1","canonical_encoding":"sorted-key-utf8-final-lf","decision_id":"decision-r1","defect":"capability_unproven","evidence_refs":[],"proposal_ref":"none","replay":{"mismatches":0,"pairs":100},"requested_model":"gpt-5.6-luna","requested_reasoning":"max","result_sha256":ZERO,"schema":"researcher.terminal.v1","set_id":"set-r1","scope_counters":counters,"source_capability_status":"NOT_ADMITTED__CAPABILITY_UNPROVEN","status":"TERMINAL","status_after_sha256":ZERO,"status_before_sha256":ZERO,"terminal_id":"terminal-r1","terminal_sha256":ZERO,"token_usage":{"status":"unavailable"},"verdict":"ABSTAINED"},"terminal_sha256")
def package(schemas):
    d={"files":[{"path":n,"sha256":digest(canon(schemas[n]))} for n in sorted(schemas)]}
    return digest(canon(d))
def manifest_hashes(m,schemas):
    p=package(schemas); u=dict(m); u["package_sha256"]=p; u.pop("manifest_sha256",None); return p,digest(canon(u))
def main():
    schemas={n:load(BASE/"schemas"/n) for n in SCHEMAS}; m=load(BASE/"manifest.json")
    if "--compute-manifest" in sys.argv:
        p,h=manifest_hashes(m,schemas); print(json.dumps({"manifest_sha256":h,"package_sha256":p},sort_keys=True)); return 0
    val(m,schemas["plugin-manifest.v1.schema.json"],schemas["plugin-manifest.v1.schema.json"])
    p,h=manifest_hashes(m,schemas)
    assert m["package_sha256"]==p,"package hash mismatch"; assert m["manifest_sha256"]==h,"manifest hash mismatch"
    for n,s in schemas.items(): closed(s,n); assert s.get("additionalProperties") is False
    assert m["source_capabilities"]==[] and m["network_policy"]["mode"]=="none" and m["credential_custody"]["mode"]=="none"
    assert "grok" not in (BASE/"manifest.json").read_text(encoding="utf-8").lower()
    fixtures={"abstention.v1.schema.json":abstention(),"citation.v1.schema.json":citation(),"evidence.v1.schema.json":evidence(),"invocation.v1.schema.json":invocation(),"proposal.v1.schema.json":proposal(),"result.v1.schema.json":result("receipt"),"terminal.v1.schema.json":terminal()}
    val(result("abstention"),schemas["result.v1.schema.json"],schemas["result.v1.schema.json"])
    for n,f in fixtures.items():
        val(f,schemas[n],schemas[n])
        bad=copy.deepcopy(f); bad["unknown_field"]=True
        try: val(bad,schemas[n],schemas[n])
        except Invalid: pass
        else: raise AssertionError("unknown field accepted:"+n)
        bad=copy.deepcopy(f); bad.pop(schemas[n]["required"][0],None)
        try: val(bad,schemas[n],schemas[n])
        except Invalid: pass
        else: raise AssertionError("malformed input accepted:"+n)
    values=list(fixtures.values())+[result("abstention")]; mismatches=0
    for i in range(100):
        raw=canon(values[i%len(values)]); mismatches+=digest(raw)!=digest(canon(json.loads(raw.decode("utf-8"))))
    assert mismatches==0
    print(json.dumps({"malformed_input_rejections":len(fixtures),"replay_mismatches":mismatches,"replay_pairs":100,"schema_count":len(schemas),"status":"PASS","tests_failed":0,"tests_passed":len(fixtures)*3+3,"unknown_field_rejections":len(fixtures)},sort_keys=True)); return 0
if __name__=="__main__":
    try: raise SystemExit(main())
    except (AssertionError,Invalid,KeyError,json.JSONDecodeError) as e:
        print(json.dumps({"status":"FAIL","defect":str(e)},sort_keys=True)); raise SystemExit(1)
