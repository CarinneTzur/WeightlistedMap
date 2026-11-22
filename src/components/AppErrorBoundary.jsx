import { Component } from 'react';
export default class AppErrorBoundary extends Component {
 state = { failed:false };
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error){console.error('Weightlisted could not render the page.',error);}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'#201f21',color:'#eee',fontFamily:'system-ui'}}><section style={{maxWidth:420}}><h1>Something went wrong</h1><p>Your page could not be displayed. Reload to try again. If you were sending a message, check your conversation before sending it again.</p><button type="button" className="ui-button" onClick={()=>window.location.reload()}>Reload page</button><p><a style={{color:'#a8cbe7'}} href="mailto:getweightlisted@gmail.com?subject=Weightlisted%20page%20error">Contact support</a></p></section></main>;
 }
}
