import { useEffect,useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
export default function NotificationPreferences(){
 const {user}=useAuth();const [enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;if(!user?.id||!supabase)return;supabase.from('notification_preferences').select('email_enabled').eq('user_id',user.id).maybeSingle().then(({data,error})=>{if(!active)return;if(error)setError('Email preferences are not available yet.');else setEnabled(Boolean(data?.email_enabled));setLoading(false);});return()=>{active=false;};},[user?.id]);
 async function toggle(){if(busy)return;setBusy(true);setError('');const {error}=await supabase.from('notification_preferences').upsert({user_id:user.id,email_enabled:!enabled});if(error)setError('Could not save email preferences. Please try again.');else setEnabled(!enabled);setBusy(false);}
 return <section className="account-panel__actions"><h2>Email notifications</h2><label style={{display:'flex',gap:12,alignItems:'center'}}><input type="checkbox" checked={enabled} disabled={loading||busy} onChange={toggle}/><span>Email me about coaching requests and new messages</span></label><p style={{fontSize:12,color:'#aaa'}}>Emails contain a link back to Weightlisted, never your message text. Delivery will begin when our email service is enabled.</p>{error&&<p role="alert">{error}</p>}</section>;
}
