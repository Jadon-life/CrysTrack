/** Normal-page transport only. Bound both headers and JSON-body consumption;
 * an abort is ambiguous after delivery, never proof that an outcome did not commit. */
export async function offlineJSON(url:string,init:RequestInit={},deadlineMs=15000){
  const controller=new AbortController();const external=init.signal;
  const cancel=()=>controller.abort();
  if(external?.aborted)cancel();else external?.addEventListener('abort',cancel,{once:true});
  const deadline=setTimeout(cancel,deadlineMs);
  try{
    const response=await fetch(url,{...init,cache:'no-store',signal:controller.signal});
    const data:unknown=await response.json();
    return{response,data};
  }finally{clearTimeout(deadline);external?.removeEventListener('abort',cancel);}
}
