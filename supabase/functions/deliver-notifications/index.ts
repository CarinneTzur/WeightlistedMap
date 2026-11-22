import { createClient } from "npm:@supabase/supabase-js@2";
// Invoke from a trusted scheduler. Never expose the dispatch secret to Vite.
Deno.serve(async request => {
 if(request.method!=="POST") return new Response("Method not allowed",{status:405});
 const secret=Deno.env.get("NOTIFICATION_DISPATCH_SECRET");
 if(!secret||request.headers.get("Authorization")!==`Bearer ${secret}`) return new Response("Unauthorized",{status:401});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),apiKey=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("NOTIFICATION_FROM"),site=Deno.env.get("APP_SITE_URL");
 if(!url||!key||!apiKey||!from||!site||Deno.env.get("NOTIFICATION_DELIVERY_ENABLED")!=="true")return new Response("Delivery not configured",{status:503});
 const siteUrl=new URL(site);if(siteUrl.protocol!=="https:")return new Response("HTTPS site required",{status:503});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:jobs,error}=await db.from("notification_outbox").select("*").is("delivered_at",null).lt("attempts",5).gte("created_at",new Date(Date.now()-23*3600000).toISOString()).order("created_at").limit(20);
 if(error)return new Response("Queue unavailable",{status:500});
 let delivered=0;
 for(const job of jobs||[]){
  // Conditional update claims each attempt even if schedulers overlap.
  const claim=await db.from("notification_outbox").update({attempts:job.attempts+1}).eq("id",job.id).eq("attempts",job.attempts).is("delivered_at",null).select("id");
  if(claim.error||!claim.data?.length)continue;
  try{
   const pref=await db.from("notification_preferences").select("email_enabled").eq("user_id",job.recipient_id).maybeSingle();
   if(pref.error)throw Error("Preferences unavailable");
   const conversation=await db.from("marketplace_conversations").select("blocked_by_client,read_by_client_at,read_by_coach_at,client_user_id").eq("id",job.conversation_id).maybeSingle();
   if(conversation.error)throw Error("Conversation unavailable");
   const row=conversation.data;
   const readAt=row?.client_user_id===job.recipient_id?row?.read_by_client_at:row?.read_by_coach_at;
   if(!pref.data?.email_enabled||!row||row.blocked_by_client||(job.event_kind!=="accepted"&&readAt&&Date.parse(readAt)>=Date.parse(job.created_at))){await db.from("notification_outbox").update({delivered_at:new Date().toISOString(),last_error:"Skipped: opted out, read, blocked, or removed"}).eq("id",job.id);continue;}
   const account=await db.auth.admin.getUserById(job.recipient_id);
   if(account.error||!account.data.user?.email)throw Error("Recipient unavailable");
   const subject=job.event_kind==="request"?"You have a new coaching request":job.event_kind==="accepted"?"Your coaching request was accepted":"You have a new Weightlisted message";
   const response=await fetch("https://api.resend.com/emails",{method:"POST",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`weightlisted-${job.id}`},body:JSON.stringify({from,to:[account.data.user.email],subject,text:`${subject}.\n\nSign in to Weightlisted to view it: ${siteUrl.origin}/\n\nManage email notifications in your account settings.\nSupport: getweightlisted@gmail.com`})});
   if(!response.ok)throw Error(`Email provider returned ${response.status}`);
   const saved=await db.from("notification_outbox").update({delivered_at:new Date().toISOString(),last_error:null}).eq("id",job.id);
   if(saved.error)throw Error("Delivery receipt could not be saved");
   delivered++;
  }catch(failure){await db.from("notification_outbox").update({last_error:failure instanceof Error?failure.message:"Delivery failed"}).eq("id",job.id);}
 }
 return Response.json({delivered,processed:jobs?.length||0});
});
