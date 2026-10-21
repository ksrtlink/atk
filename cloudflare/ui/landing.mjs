import {initializeAuth,account,signOut,token} from '/manage/auth.mjs';
import {signInURL} from '/manage/auth-navigation.mjs';
let homeVerified=false,homeReady=Promise.resolve(),submitting=false;
let tool = "link";
const linkTab = document.getElementById("hero-link-tab"), qrTab = document.getElementById("hero-qr-tab"), input = document.getElementById("hero-url"), error = document.getElementById("hero-create-error");
function selectTool(next) {
  tool = next;
  linkTab.setAttribute("aria-pressed", String(tool === "link"));
  qrTab.setAttribute("aria-pressed", String(tool === "qr"));
  document.getElementById("hero-tool-title").textContent = tool === "link" ? "Start with a long link." : "Make your next QR code.";
  document.getElementById("hero-tool-description").textContent = tool === "link" ? "Make it shorter. Keep it easy to share." : "One URL. Your shapes, colors, and style.";
  document.getElementById("hero-create-submit").textContent = tool === "link" ? "Shorten a link ↗" : "Design a QR code ↗";
  error.hidden = true;
}
linkTab.addEventListener("click", () => selectTool("link"));
qrTab.addEventListener("click", () => selectTool("qr"));
document.getElementById("hero-create-form").addEventListener("submit", async event => {
  event.preventDefault();
  if(submitting)return;
  try {
    const url = new URL(input.value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 4096) throw Error("Use a full HTTP or HTTPS website URL without embedded credentials.");
    submitting=true;document.getElementById("hero-create-submit").disabled=true;
    await homeReady;
    sessionStorage.setItem("tinytrail.create-draft", JSON.stringify({url:url.href, tool, createdAt:Date.now()}));
    location.assign(homeVerified ? "/manage/?create=1" : signInURL("/manage/?create=1",true));
  } catch (problem) { error.textContent = problem.message; error.hidden = false; }
  finally{submitting=false;document.getElementById("hero-create-submit").disabled=false;}
});

const homeAccount=document.getElementById('home-account');
function renderHomeAccount(verified=false){const user=account();verified=!!user&&verified;homeVerified=verified;homeAccount.hidden=!user;document.getElementById('home-signin').hidden=!!user;document.getElementById('home-account-email').textContent=user?.email||'';document.getElementById('home-account-summary').textContent=verified?'Signed in':'Verify email';document.getElementById('home-account-open').href=verified?'/manage/':'/signin/';document.getElementById('home-account-open').textContent=verified?'Open dashboard':'Verify your email';document.querySelector('[data-home-logo]').href=verified?'/manage/':'/';document.querySelector('[data-home-logo]').setAttribute('aria-label',verified?'Tinytrail dashboard':'Tinytrail home');for(const link of document.querySelectorAll('[data-account-cta]')){if(!link.dataset.accountLabel)link.dataset.accountLabel=link.textContent.trim();link.href=user?(verified?'/manage/':'/signin/'):'/signin/?mode=signup';link.textContent=user?(verified?'Open dashboard ↗':'Verify email ↗'):link.dataset.accountLabel;}document.getElementById('footer-account').href=verified?'/manage/':'/signin/';document.getElementById('footer-account').textContent=verified?'Open dashboard ↗':'Sign in ↗';document.getElementById('home-session-note').textContent=user?(verified?'Welcome back. Your links and QR codes are ready.':'One more step: verify your email to open your workspace.'):'A private library for you. A shared workspace for your team.';}
document.getElementById('home-signout').onclick=()=>{signOut();sessionStorage.removeItem('tinytrail.workspace');sessionStorage.removeItem('tinytrail.create-draft');homeAccount.open=false;renderHomeAccount();};
async function refreshHomeAccount(){try{const r=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)return;await initializeAuth(await r.json());if(!account()){renderHomeAccount();return;}const result=await fetch('/api/me',{headers:{Authorization:'Bearer '+await token()},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});if(result.status===401)signOut();renderHomeAccount(result.ok);}catch{renderHomeAccount();}}
homeReady=refreshHomeAccount();await homeReady;window.addEventListener('pageshow',e=>{if(e.persisted)homeReady=refreshHomeAccount();});
