// TEMPORARY build-only diagnostic. Synthetic prompts; no CrysTrack data or key is logged.
// This branch must never be merged into main.
const key = process.env.OPENROUTER_API_KEY;
const privacy = { zdr: true, data_collection: 'deny', require_parameters: true, allow_fallbacks: true };
async function probe(name, extra = {}) {
  if (!key) { console.log('[AI_PROBE]', JSON.stringify({test:name,result:'NO_KEY'})); return; }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type':'application/json', 'X-Title':'CrysTrack synthetic build diagnostic' },
      body: JSON.stringify({
        model:'openrouter/free',
        messages:[{role:'system',content:'Synthetic connectivity test. No personal data. Reply with OK.'},{role:'user',content:'OK'}],
        max_tokens:96,
        provider:privacy,
        ...extra,
      }),
      signal:AbortSignal.timeout(15000),
      cache:'no-store',
    });
    const reply=await response.json().catch(()=>null);
    const msg=typeof reply?.error?.message==='string'?reply.error.message.toLowerCase():'';
    const diagnostic = msg.includes('no endpoints')||msg.includes('no providers') ? 'NO_ELIGIBLE_PROVIDER'
      : msg.includes('privacy')||msg.includes('data policy') ? 'PRIVACY_ROUTING'
      : msg.includes('credit')||msg.includes('balance') ? 'CREDIT_OR_BALANCE'
      : msg.includes('rate limit') ? 'RATE_LIMIT'
      : msg.includes('invalid')&&msg.includes('key') ? 'INVALID_KEY'
      : reply?.error ? 'UPSTREAM_ERROR' : 'NONE';
    const output=reply?.choices?.[0]?.message?.content;
    console.log('[AI_PROBE]',JSON.stringify({test:name,status:response.status,upstreamCode:typeof reply?.error?.code==='number'?reply.error.code:null,diagnostic,hasOutput:typeof output==='string'&&output.trim().length>0,finishReason:typeof reply?.choices?.[0]?.finish_reason==='string'?reply.choices[0].finish_reason:null}));
  } catch(e) {
    console.log('[AI_PROBE]',JSON.stringify({test:name,status:0,diagnostic:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK_OR_PARSE_ERROR'}));
  }
}
await probe('free-chat-with-privacy-and-reasoning',{reasoning:{effort:'low',exclude:true}});
await probe('free-json-schema-with-privacy',{response_format:{type:'json_schema',json_schema:{name:'crystrack_probe',strict:true,schema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}}}});
await probe('free-basic-with-strict-privacy',{provider:{zdr:true,data_collection:'deny',allow_fallbacks:true}});
await probe('free-basic-with-zdr-only',{provider:{zdr:true,allow_fallbacks:true}});
await probe('free-basic-with-data-deny-only',{provider:{data_collection:'deny',allow_fallbacks:true}});
await probe('free-basic-without-provider-filter',{provider:{allow_fallbacks:true}});


await probe('free-chat-exact-production-without-zdr',{
  reasoning:{effort:'low',exclude:true},
  provider:{data_collection:'deny',require_parameters:true,allow_fallbacks:true}
});
await probe('free-chat-reasoning-without-require',{
  reasoning:{effort:'low',exclude:true},
  provider:{data_collection:'deny',allow_fallbacks:true}
});
await probe('free-json-schema-require-without-zdr',{
  response_format:{type:'json_schema',json_schema:{name:'crystrack_probe',strict:true,schema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}}},
  provider:{data_collection:'deny',require_parameters:true,allow_fallbacks:true}
});
await probe('free-json-schema-without-require-or-zdr',{
  response_format:{type:'json_schema',json_schema:{name:'crystrack_probe',strict:true,schema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}}},
  provider:{data_collection:'deny',allow_fallbacks:true}
});

const schema = {type:'json_schema',json_schema:{name:'crystrack_probe',strict:true,schema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}}};
const messages=[{role:'system',content:'Return exactly a JSON object matching the required schema with status equal to ok; no other text.'},{role:'user',content:'Test only, no private data: return status ok.'}];
await probe('analysis-json-schema-500-tokens', {messages, max_tokens:500,response_format:schema,provider:{data_collection:'deny',require_parameters:true,allow_fallbacks:true}});
await probe('analysis-json-schema-500-reasoning-medium', {messages,reasoning_effort:'medium',max_tokens:500,response_format:schema,provider:{data_collection:'deny',require_parameters:true,allow_fallbacks:true}});
