// ===== Phoenix Pull (Supabase) =====
// Security note: anon key is safe to expose IF you keep RLS policies tight (as in db.sql).

/* ---------- Setup Supabase ---------- */
const { createClient } = supabase;
if (!window.PHX_CONFIG) {
  alert("Missing config.js. Copy config.example.js -> config.js and fill your Supabase credentials.");
}
const supa = createClient(window.PHX_CONFIG.supabaseUrl, window.PHX_CONFIG.supabaseAnonKey);

/* ---------- UI Helpers ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function show(id){ document.getElementById(id).classList.remove('hidden') }
function hide(id){ document.getElementById(id).classList.add('hidden') }
function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed',bottom:'18px',left:'50%',transform:'translateX(-50%)',
    background:'rgba(0,0,0,.85)',color:'#fff',padding:'10px 14px',borderRadius:'10px',zIndex:9999
  });
  document.body.appendChild(t); setTimeout(()=>t.remove(),1400);
}

/* ---------- Data (categories & items) ---------- */
const DATA = {
  Pastries:[
    {name:'Croissant', note:'10–12 (depending on day)', shelf:'2 Days'},
    {name:'Chocolate Croissant', note:'6', shelf:'2 Days'},
    {name:'Cheese Danish', note:'6', shelf:'2 Days'},
    {name:'Birthday Cake Pop', note:'3 packs', shelf:'3 Days'},
    {name:'Dog Cake Pop', note:'3 packs', shelf:'3 Days'},
    {name:'Chocolate Cake Pop', note:'3 packs', shelf:'3 Days'},
    {name:'Vanilla Bean Danish', note:'6', shelf:'2 Days'},
    {name:'Vanilla Bean Scone', note:'1 pack', shelf:'2 Days'},
    {name:'Chocolate Chip Cookie', note:'5', shelf:'2 Days'},
    {name:'Blueberry Muffin', note:'1', shelf:'2 Days'},
    {name:'Banana Bread', note:'6', shelf:'2 Days'},
    {name:'Lemon Loaf', note:'5', shelf:'2 Days'},
    {name:'Pumpkin Loaf', note:'5', shelf:'2 Days'},
    {name:'Coffee Cake', note:'5', shelf:'2 Days'},
    {name:'Dog Cookies', note:'Have 5 at all times', shelf:'12 Days'}
  ],
  Sandwiches:[
    {name:'Bacon Gouda', note:'6', shelf:'3 Days'},
    {name:'Sausage Cheddar', note:'6', shelf:'3 Days'},
    {name:'Impossible', note:'4', shelf:'3 Days'},
    {name:'Double Smoked', note:'6', shelf:'3 Days'},
    {name:'Turkey Bacon', note:'4', shelf:'3 Days'},
    {name:'Spinach Feta', note:'6', shelf:'3 Days'},
    {name:'Ham and Cheese Croissant', note:'6–8 (depending on day)', shelf:'2 Days'},
    {name:'Tomato Mozz', note:'4', shelf:'2 Days'},
    {name:'Grilled Cheese', note:'4', shelf:'2 Days'},
    {name:'Pepper Egg Bites', note:'8', shelf:'7 Days'},
    {name:'Bacon Egg Bites', note:'8', shelf:'7 Days'},
    {name:'Potato Chive Bites', note:'8', shelf:'7 Days'},
    {name:'Jalapeno Chiken Pocket', note:'6', shelf:'3 Days'},
    {name:'Egg Pesto Mozzarella', note:'5', shelf:'3 Days'},
    {name:'Bacon Sausage and Egg Wrap', note:'3', shelf:'3 Days'}
  ]
};

/* ---------- State ---------- */
let session = null;
let profile = null;
const STORAGE_FILTERS = 'phoenix_filters_v1';
function getFilters(){
  try { return JSON.parse(localStorage.getItem(STORAGE_FILTERS) || '{}'); } catch { return {}; }
}
function saveFilters(o){ localStorage.setItem(STORAGE_FILTERS, JSON.stringify(o)); }

/* ---------- Auth ---------- */
async function getSession(){ const { data } = await supa.auth.getSession(); return data.session; }
async function signIn(email, password){
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if(error) throw error; session = data.session; await afterAuth(); log('login', {});
}
async function signUp(email, password, display_name){
  const { data, error } = await supa.auth.signUp({ email, password });
  if(error) throw error;
  session = data.session;
  // ensure profile
  const uid = data.user?.id;
  if(uid){
    await supa.from('profiles').upsert({ id: uid, email, display_name, role:'user', active: true });
  }
  await afterAuth();
}
async function signOut(){ await supa.auth.signOut(); log('logout', {}); session = null; profile = null; route(); }

/* ---------- Profiles & Roles ---------- */
async function fetchProfile(){
  const uid = session?.user?.id;
  const { data, error } = await supa.from('profiles').select('*').eq('id', uid).single();
  if(error) throw error;
  return data;
}
function isAdmin(){ return profile?.role === 'admin'; }

/* ---------- Logs ---------- */
async function log(action, payload){
  try {
    const u = session?.user;
    await supa.from('interactions').insert({
      user_id: u?.id, user_email: u?.email, action, payload
    });
  } catch {}
}

/* ---------- Quantities persistence ---------- */
async function loadQuantities(){
  const u = session?.user; if(!u) return new Map();
  const { data, error } = await supa.from('quantities').select('*').eq('user_id', u.id);
  if(error) throw error;
  const map = new Map();
  for(const row of data){
    map.set(`${row.category}__${row.item_name}`, row);
  }
  return map;
}
async function upsertQuantity(category, item_name, changes){
  const u = session?.user; if(!u) return;
  const row = { user_id: u.id, category, item_name, ...changes };
  row.updated_at = new Date().toISOString();
  const { error } = await supa.from('quantities').upsert(row, { onConflict: 'user_id,category,item_name' });
  if(error) console.error(error);
}

/* ---------- Admin UI ---------- */
async function renderUsers(){
  const { data, error } = await supa.from('profiles').select('id,email,display_name,role,active,created_at').order('created_at', { ascending: false });
  if(error){ $('#usersTable').innerHTML = `<p class="text-muted">Error loading users.</p>`; return; }
  const rows = data.map(u => `
    <tr class="border-b border-line/60">
      <td class="py-2">${u.display_name || u.email}</td>
      <td class="py-2 text-muted text-sm">${u.email}</td>
      <td class="py-2"><span class="px-2 py-1 rounded-full border border-line ${u.role==='admin'?'bg-green-900/40 text-green-200':''}">${u.role}</span></td>
      <td class="py-2">${u.active ? '✅' : '⛔'}</td>
      <td class="py-2 text-sm text-muted">${new Date(u.created_at).toLocaleString()}</td>
      <td class="py-2">
        <div class="flex gap-2">
          <button class="tap rounded-xl border-2 border-brand text-brand px-3" data-act="toggle" data-id="${u.id}">${u.active?'Deactivate':'Activate'}</button>
          <button class="tap rounded-xl border-2 border-brand text-brand px-3" data-act="role" data-id="${u.id}">Role</button>
        </div>
      </td>
    </tr>
  `).join('');
  $('#usersTable').innerHTML = `
    <table class="w-full text-left">
      <thead><tr class="text-muted text-sm">
        <th class="py-2">Name</th><th class="py-2">Email</th><th class="py-2">Role</th><th class="py-2">Active</th><th class="py-2">Created</th><th class="py-2">Actions</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="py-4 text-muted">No users</td></tr>'}</tbody>
    </table>`;

  // actions
  $('#usersTable').onclick = async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const id = btn.dataset.id; const act = btn.dataset.act;
    if(act==='toggle'){
      const { data, error } = await supa.from('profiles').select('active').eq('id', id).single();
      if(!error){
        await supa.from('profiles').update({ active: !data.active }).eq('id', id);
        renderUsers();
      }
    }
    if(act==='role'){
      const role = prompt('Set role for user (admin/user):', 'user'); if(!role) return;
      if(!['admin','user'].includes(role)) return alert('Invalid role');
      await supa.from('profiles').update({ role }).eq('id', id);
      renderUsers();
    }
  };
}
async function renderLogs(){
  const who = $('#logUserFilter').value;
  const act = $('#logActionFilter').value;
  let q = supa.from('interactions').select('*').order('created_at', { ascending: false }).limit(1000);
  if(who !== 'all') q = q.eq('user_email', who);
  if(act !== 'all') q = q.eq('action', act);
  const { data, error } = await q;
  if(error){ $('#logsTable').innerHTML = `<p class="text-muted">Error loading logs.</p>`; return; }
  const rows = data.map(l => `
    <tr class="border-b border-line/60">
      <td class="py-2">${new Date(l.created_at).toLocaleString()}</td>
      <td class="py-2">${l.user_email || ''}</td>
      <td class="py-2">${l.action}</td>
      <td class="py-2 text-xs text-muted"><code>${escapeHtml(JSON.stringify(l.payload))}</code></td>
    </tr>
  `).join('');
  $('#logsTable').innerHTML = `
    <table class="w-full text-left">
      <thead><tr class="text-muted text-sm">
        <th class="py-2">When</th><th class="py-2">User</th><th class="py-2">Action</th><th class="py-2">Data</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="py-4 text-muted">No logs</td></tr>'}</tbody>
    </table>`;
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
async function renderLogFilters(){
  // list all users (admin only)
  const { data, error } = await supa.from('profiles').select('email').order('email');
  const opts = ['<option value="all">All users</option>']
    .concat((data||[]).map(u => `<option value="${u.email}">${u.email}</option>`));
  $('#logUserFilter').innerHTML = opts.join('');
}

/* ---------- App (Pull UI) ---------- */
function buildChips(){
  const chips = $('#chips'); chips.innerHTML = '';
  const mk = (label, cat, active=false) => `<button class="chip ${active?'active':''} tap rounded-full border border-line px-4 bg-[#0f0f16] font-bold text-sm"
                                            data-cat="${cat}">${label}</button>`;
  chips.insertAdjacentHTML('beforeend', mk('All', 'all', true));
  Object.keys(DATA).forEach(cat => chips.insertAdjacentHTML('beforeend', mk(cat, cat)));
  chips.addEventListener('click', e=>{
    const btn = e.target.closest('.chip'); if(!btn) return;
    $$('#chips .chip').forEach(c=> c.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
    const f = getFilters(); f.cat = btn.dataset.cat; saveFilters(f);
  });
  const f = getFilters(); if(f.cat){
    $$('#chips .chip').forEach(c=> c.classList.toggle('active', c.dataset.cat===f.cat));
  }
}

function card(cat, item, qty=0, restock=false){
  return `<div class="bg-panel border border-line rounded-2xl shadow-card">
    <div class="flex items-center justify-between gap-3 p-3">
      <div>
        <div class="font-extrabold">${item.name}</div>
        <div class="text-muted text-sm">${item.note||''} · ${item.shelf||''}</div>
      </div>
      <label class="flex items-center gap-2"><input type="checkbox" class="restock accent-brand" ${restock?'checked':''}/> <span class="text-sm">Restock</span></label>
    </div>
    <div class="h-px bg-line/70"></div>
    <div class="flex items-center gap-2 p-3">
      <div class="text-muted text-sm">Pull</div>
      <div class="ml-auto flex items-center gap-2">
        <button class="btn dec tap rounded-xl border border-line bg-[#0f0f16] text-xl font-extrabold">–</button>
        <input class="num w-[90px] tap text-center bg-[#0f0f16] border border-line rounded-xl text-lg" type="number" inputmode="numeric" min="0" step="1" value="${qty}" />
        <button class="btn inc tap rounded-xl border border-line bg-[#0f0f16] text-xl font-extrabold">+</button>
      </div>
    </div>
  </div>`;
}

async function renderApp(){
  $('#list').innerHTML = '<div class="text-muted">Loading…</div>';
  const qmap = await loadQuantities();
  let html = '';
  for(const cat of Object.keys(DATA)){
    html += `<div class="space-y-4" data-section="${cat}">`;
    for(const it of DATA[cat]){
      const key = `${cat}__${it.name}`;
      const row = qmap.get(key);
      const qty = row?.qty || 0;
      const restock = row?.restock || false;
      html += card(cat, it, qty, restock);
    }
    html += `</div>`;
  }
  $('#list').innerHTML = html;
  $('#who').textContent = `@${profile?.display_name || session?.user?.email || ''}`;
  attachAppHandlers();
  applyFilters();
  updateTotal();
}

function currentCat(){ const a = $('#chips .chip.active'); return a ? a.dataset.cat : 'all'; }
function applyFilters(){
  const q = $('#search').value.trim().toLowerCase();
  const onlyQty = $('#onlyQty').checked;
  const cat = currentCat();
  $$('#list [data-section]').forEach(sec => {
    sec.querySelectorAll('.bg-panel').forEach(card => {
      const name = card.querySelector('.font-extrabold').textContent.toLowerCase();
      const qty = Number(card.querySelector('.num').value || 0);
      const isCat = sec.dataset.section === cat || cat === 'all';
      const matchQ = !q || name.includes(q);
      const matchQty = !onlyQty || qty > 0;
      card.style.display = (isCat && matchQ && matchQty) ? '' : 'none';
    });
  });
  const f = getFilters(); f.onlyQty = onlyQty; f.search = q; saveFilters(f);
}
function updateTotal(){
  let total = 0;
  $$('#list .num').forEach(n => total += Number(n.value || 0));
  $('#total').textContent = total;
}
function attachAppHandlers(){
  // restore filters
  const f = getFilters();
  if(f.search) $('#search').value = f.search;
  if(typeof f.onlyQty === 'boolean') $('#onlyQty').checked = f.onlyQty;

  $('#search').addEventListener('input', applyFilters);
  $('#onlyQty').addEventListener('input', applyFilters);

  // long-press repeaters
  function withRepeat(button, step){
    let t, rep;
    const fire = ()=>{
      const card = button.closest('.bg-panel');
      const num = card.querySelector('.num');
      num.value = Math.max(0, Number(num.value || 0) + step);
      const sec = card.closest('[data-section]').dataset.section;
      const name = card.querySelector('.font-extrabold').textContent;
      upsertQuantity(sec, name, { qty: Number(num.value) });
      updateTotal();
      vibrate(10);
    };
    const start = ()=>{ fire(); t = setTimeout(()=> rep = setInterval(fire, 90), 350) };
    const end = ()=>{ clearTimeout(t); clearInterval(rep); };
    button.addEventListener('mousedown', start); document.addEventListener('mouseup', end);
    button.addEventListener('touchstart', (e)=>{ e.preventDefault(); start(); }, {passive:false});
    button.addEventListener('touchend', end);
  }
  $$('#list .inc').forEach(b=> withRepeat(b, +1));
  $$('#list .dec').forEach(b=> withRepeat(b, -1));

  // number input direct
  $('#list').addEventListener('input', (e)=>{
    if(e.target.classList.contains('num')){
      const card = e.target.closest('.bg-panel');
      const sec = card.closest('[data-section]').dataset.section;
      const name = card.querySelector('.font-extrabold').textContent;
      const v = Math.max(0, Number(e.target.value || 0));
      e.target.value = v;
      upsertQuantity(sec, name, { qty: v });
      updateTotal();
    }
  });
  // restock toggle
  $('#list').addEventListener('change', (e)=>{
    if(e.target.classList.contains('restock')){
      const card = e.target.closest('.bg-panel');
      const sec = card.closest('[data-section]').dataset.section;
      const name = card.querySelector('.font-extrabold').textContent;
      upsertQuantity(sec, name, { restock: e.target.checked });
    }
  });

  // actions
  $('#send').onclick = openModal;
  $('#close').onclick = closeModal;
  $('#modal').addEventListener('click', (e)=>{ if(e.target.id==='modal') closeModal(); });
  $('#copy').onclick = copyBoth;
  $('#copyPull').onclick = copyPull;
  $('#copyRestock').onclick = copyRestock;
  $('#clear').onclick = clearAll;
  $('#print').onclick = ()=> window.print();
}
function vibrate(ms){ if(navigator.vibrate) try{ navigator.vibrate(ms); }catch{} }

function itemsToPull(){
  const items = [];
  $$('#list [data-section]').forEach(sec => {
    const cat = sec.dataset.section;
    sec.querySelectorAll('.bg-panel').forEach(card => {
      const name = card.querySelector('.font-extrabold').textContent;
      const qty = Number(card.querySelector('.num').value || 0);
      if(qty > 0) items.push({ name, qty });
    });
  });
  items.sort((a,b)=> a.name.localeCompare(b.name));
  return items;
}
function itemsToRestock(){
  const items = [];
  $$('#list [data-section]').forEach(sec => {
    sec.querySelectorAll('.bg-panel').forEach(card => {
      const name = card.querySelector('.font-extrabold').textContent;
      const checked = card.querySelector('.restock').checked;
      if(checked) items.push({ name });
    });
  });
  items.sort((a,b)=> a.name.localeCompare(b.name));
  return items;
}

function openModal(){
  const pulls = itemsToPull();
  const restocks = itemsToRestock();
  const pullHtml = pulls.length ? pulls.map(i=>`<div class='flex justify-between py-2 border-b border-dashed border-line/70'><div>${i.name}</div><div class='font-extrabold'>${i.qty}</div></div>`).join('') : '<p class="text-muted">No pull items.</p>';
  const restockHtml = restocks.length ? restocks.map(i=>`<div class='flex justify-between py-2 border-b border-dashed border-line/70'><div>${i.name}</div><div class='font-extrabold'>✓</div></div>`).join('') : '<p class="text-muted">No restock items.</p>';
  $('#summary').innerHTML = `<div class="space-y-3">
    <div><h4 class="text-brand font-bold mb-1">Items to Pull</h4>${pullHtml}</div>
    <div><h4 class="text-brand font-bold mb-1">Items to Restock</h4>${restockHtml}</div>
  </div>`;
  $('#modal').classList.remove('hidden');
  $('#modal').classList.add('flex');
  log('send_summary', { pulls, restocks });
}
function closeModal(){
  $('#modal').classList.add('hidden');
  $('#modal').classList.remove('flex');
}
function copyBoth(){
  const pulls = itemsToPull().map(i=> `${i.name}: ${i.qty}`).join('\n') || '(none)';
  const restocks = itemsToRestock().map(i=> `${i.name}`).join('\n') || '(none)';
  const text = `Items to Pull\n${pulls}\n\nItems to Restock\n${restocks}`;
  navigator.clipboard.writeText(text).then(()=> toast('Copied')).catch(()=> alert('Copy failed'));
}
function copyPull(){
  const pulls = itemsToPull().map(i=> `${i.name}: ${i.qty}`).join('\n') || '(none)';
  navigator.clipboard.writeText(pulls).then(()=> toast('Copied Pull')).catch(()=> alert('Copy failed'));
}
function copyRestock(){
  const restocks = itemsToRestock().map(i=> `${i.name}`).join('\n') || '(none)';
  navigator.clipboard.writeText(restocks).then(()=> toast('Copied Restock')).catch(()=> alert('Copy failed'));
}
async function clearAll(){
  if(!confirm('Set all quantities to 0?')) return;
  // local clear and server clear
  $$('#list .num').forEach(n => n.value = 0);
  updateTotal(); applyFilters();
  const u = session?.user; if(!u) return;
  await supa.from('quantities').update({ qty: 0 }).eq('user_id', u.id);
  toast('Cleared');
}

/* ---------- Routing ---------- */
function blockIfInactive(){
  if(profile && profile.active === false){
    alert('Your account is deactivated. Contact an admin.');
    signOut();
    return true;
  }
  return false;
}
async function afterAuth(){
  profile = await fetchProfile().catch(()=> null);
  if(blockIfInactive()) return;
  route();
}
async function route(){
  session = await getSession();
  if(!session){
    hide('view-admin'); hide('view-app'); show('view-login');
    const hint = $('#loginHint');
    hint.textContent = 'Tip: Sign up if you don’t have an account.';
    wireLogin();
    return;
  }
  profile = await fetchProfile().catch(()=> null);
  if(blockIfInactive()) return;
  hide('view-login');
  // admin view or app view?
  if(location.hash === '#admin' && isAdmin()){
    show('view-admin'); hide('view-app');
    wireAdmin();
    await renderUsers();
    await renderLogFilters();
    await renderLogs();
  }else{
    show('view-app'); hide('view-admin');
    buildChips();
    await renderApp();
    wireAppNav();
  }
}
function wireLogin(){
  // open signup
  $('#toSignup').onclick = () => $('#signupDialog').showModal();
  $('#signupForm').onsubmit = async (e)=>{
    e.preventDefault();
    const email = $('#signupEmail').value.trim();
    const pw = $('#signupPass').value;
    const name = $('#signupName').value.trim();
    try{
      await signUp(email, pw, name);
      $('#signupDialog').close();
    }catch(err){ alert(err.message || 'Sign up failed'); }
  };
  // reset pw (email link)
  $('#resetPw').onclick = async ()=>{
    const email = prompt('Enter your email to receive a reset link:');
    if(!email) return;
    const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if(error) alert(error.message); else toast('Reset email sent');
  };
  // sign in
  $('#loginForm').onsubmit = async (e)=>{
    e.preventDefault();
    try{
      await signIn($('#loginEmail').value.trim(), $('#loginPass').value);
    }catch(err){ alert(err.message || 'Login failed'); }
  };
}
function wireAdmin(){
  $('#gotoApp').onclick = ()=> { location.hash = ''; route(); }
  $('#logoutA').onclick = signOut;
  $('#inviteForm').onsubmit = async (e)=>{
    e.preventDefault();
    const email = $('#inviteEmail').value.trim();
    const role = $('#inviteRole').value;
    if(!email) return;
    // Create a placeholder profile so you can set role/active before user logs in.
    const { data: u } = await supa.from('profiles').select('id').eq('email', email).maybeSingle();
    if(!u){
      // Cannot create auth.users here without service key; we create a profile row only.
      await supa.from('profiles').insert({ id: crypto.randomUUID(), email, display_name: email.split('@')[0], role, active: true });
    }else{
      await supa.from('profiles').update({ role }).eq('id', u.id);
    }
    $('#inviteEmail').value = '';
    await renderUsers(); await renderLogFilters(); toast('Invited / updated');
  };
  $('#logUserFilter').onchange = renderLogs;
  $('#logActionFilter').onchange = renderLogs;
  $('#exportCSV').onclick = async ()=>{
    const { data, error } = await supa.from('interactions').select('*').order('created_at', { ascending: false }).limit(5000);
    if(error) return alert('Export failed');
    const header = ['created_at','user_email','action','payload'];
    const rows = data.map(l => [l.created_at, l.user_email || '', l.action, JSON.stringify(l.payload||{}).replaceAll('\n',' ')]);
    const csv = [header.join(','), ...rows.map(r=> r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='logs.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#clearLogs').onclick = async ()=>{
    if(!confirm('Clear ALL logs?')) return;
    await supa.from('interactions').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    await renderLogs(); toast('Logs cleared');
  };
}
function wireAppNav(){
  $('#adminBtn').onclick = ()=> { if(isAdmin()){ location.hash = '#admin'; route(); } else { toast('Admins only'); } };
  $('#logout').onclick = signOut;
}

/* ---------- Init ---------- */
route();
