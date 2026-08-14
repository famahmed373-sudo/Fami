// Minimal single-file SPA that uses window.supabase (mock or real) to display shops and payments.
// Supports listing shops, adding/editing/deleting shops, and viewing/adding payments for a shop.
// Uses hash-based routing: #/  -> shops list, #/shop/{id} -> shop payments

(async function(){
  const APP_ID = 'fami-app';
  const app = document.getElementById('app') || (function(){
    const d = document.createElement('div'); d.id='app'; document.body.appendChild(d); return d; })();

  function el(tag, attrs={}, ...children){
    const e = document.createElement(tag);
    for(const k in attrs){ if(k.startsWith('on') && typeof attrs[k] === 'function'){ e.addEventListener(k.slice(2), attrs[k]); } else if(k==='html'){ e.innerHTML = attrs[k]; } else { e.setAttribute(k, attrs[k]); }}
    children.forEach(c => { if(c==null) return; if(typeof c === 'string') e.appendChild(document.createTextNode(c)); else e.appendChild(c); });
    return e;
  }

  function waitForSupabase(timeout = 3000){
    return new Promise((resolve)=>{
      if(window.supabase) return resolve(window.supabase);
      const start = Date.now();
      const iv = setInterval(()=>{
        if(window.supabase){ clearInterval(iv); return resolve(window.supabase); }
        if(Date.now() - start > timeout){ clearInterval(iv); return resolve(window.supabase || null); }
      }, 100);
    });
  }

  const supabase = await waitForSupabase(3000);
  if(!supabase){
    console.warn('Supabase not ready after wait; app will still try to use window.supabase when available.');
  }

  function nav(){
    return el('nav', {},
      el('a',{href:'#/', style:'margin-right:12px;'}, 'Shops'),
      el('a',{href:'#/add-shop', style:'margin-right:12px;'}, 'Add Shop'),
      el('a',{href:'#/logs', style:'margin-right:12px;'}, 'Logs')
    );
  }

  async function fetchShops(){
    try{
      const client = window.supabase;
      if(!client) throw new Error('supabase not available');
      const res = await client.from('shops').select();
      if(res.error) throw res.error;
      return res.data || [];
    }catch(err){ window.logger && window.logger.error('fetchShops', err); console.error(err); return []; }
  }

  async function fetchPayments(shop_id){
    try{
      const client = window.supabase;
      if(!client) throw new Error('supabase not available');
      const res = await client.from('payments').select();
      if(res.error) throw res.error;
      return (res.data || []).filter(p => String(p.shop_id) === String(shop_id));
    }catch(err){ window.logger && window.logger.error('fetchPayments', err); console.error(err); return []; }
  }

  async function addShop(data){
    try{
      const client = window.supabase;
      const res = await client.from('shops').insert(data);
      if(res.error) throw res.error;
      window.logger && window.logger.info('shop added', res.data);
      return res.data;
    }catch(err){ window.logger && window.logger.error('addShop', err); console.error(err); throw err; }
  }

  async function updateShop(id, changes){
    try{
      const client = window.supabase;
      const res = await client.from('shops').update(changes).eq('id', id);
      if(res.error) throw res.error;
      window.logger && window.logger.info('shop updated', res.data);
      return res.data;
    }catch(err){ window.logger && window.logger.error('updateShop', err); console.error(err); throw err; }
  }

  async function deleteShop(id){
    try{
      const client = window.supabase;
      const res = await client.from('shops').delete().eq('id', id);
      if(res.error) throw res.error;
      window.logger && window.logger.info('shop deleted', id);
      return res.data;
    }catch(err){ window.logger && window.logger.error('deleteShop', err); console.error(err); throw err; }
  }

  async function addPayment(data){
    try{
      const client = window.supabase;
      const res = await client.from('payments').insert(data);
      if(res.error) throw res.error;
      window.logger && window.logger.info('payment added', res.data);
      return res.data;
    }catch(err){ window.logger && window.logger.error('addPayment', err); console.error(err); throw err; }
  }

  function renderShopsList(shops){
    const list = el('div',{class:'shops-list'});
    if(!shops.length) list.appendChild(el('p',{}, 'No shops yet.')); 
    shops.forEach(s => {
      const item = el('div',{class:'shop-item'},
        el('a',{href:'#/shop/'+s.id, class:'shop-name'}, s.name + (s.occupied? ' (occupied)':' (vacant)')),
        el('div',{},
          el('button',{onClick: async ()=>{ const n = prompt('New name', s.name); if(n){ await updateShop(s.id, {name:n}); route(); } } }, 'Edit'),
          el('button',{onClick: async ()=>{ if(confirm('Delete shop?')){ await deleteShop(s.id); route(); } }}, 'Delete')
        )
      );
      list.appendChild(item);
    });
    return list;
  }

  function renderAddShopForm(){
    const nameInput = el('input',{type:'text', placeholder:'Shop name'});
    const rentInput = el('input',{type:'number', placeholder:'Rent amount'});
    const occInput = el('input',{type:'checkbox'});
    const form = el('div',{class:'form'},
      el('label',{}, 'Name:', nameInput), el('br'),
      el('label',{}, 'Rent:', rentInput), el('br'),
      el('label',{}, 'Occupied:', occInput), el('br'),
      el('button',{onClick: async ()=>{
        const name = nameInput.value.trim(); const rent = Number(rentInput.value) || 0; const occupied = occInput.checked;
        if(!name){ alert('Provide name'); return; }
        await addShop({ name, rent, occupied });
        window.location.hash = '#/';
      }}, 'Add Shop')
    );
    return form;
  }

  function renderAddPaymentForm(shopId){
    const amount = el('input',{type:'number', placeholder:'Amount'});
    const date = el('input',{type:'date'});
    const form = el('div',{class:'form'},
      el('label',{}, 'Amount:', amount), el('br'),
      el('label',{}, 'Date:', date), el('br'),
      el('button',{onClick: async ()=>{
        const a = Number(amount.value); const d = date.value || new Date().toISOString().slice(0,10);
        if(!a){ alert('Provide amount'); return; }
        await addPayment({ shop_id: shopId, amount: a, date: d });
        await route();
      }}, 'Add Payment')
    );
    return form;
  }

  async function renderShopPage(id){
    const shopId = id;
    const shops = await fetchShops();
    const shop = shops.find(s => String(s.id) === String(shopId));
    if(!shop) return el('div',{}, 'Shop not found');
    const payments = await fetchPayments(shopId);
    const container = el('div',{},
      el('h2',{}, 'Payments for: '+shop.name),
      el('div',{}, 'Rent: '+(shop.rent||0)),
      el('div',{}, el('h3',{}, 'Payments')),
      el('div',{}, payments.length? payments.map(p => el('div', {class:'payment-item'}, `#${p.id} — ${p.amount} on ${p.date}`)) : el('p',{}, 'No payments yet')),
      renderAddPaymentForm(shopId),
      el('div',{}, el('a',{href:'#/'}, 'Back to shops'))
    );
    return container;
  }

  async function renderLogs(){
    const buf = (window.logger && window.logger.getBuffer && window.logger.getBuffer()) || [];
    const container = el('div',{}, el('h2',{}, 'Recent Logs'));
    buf.slice().reverse().forEach(entry => {
      container.appendChild(el('div',{class:'log-entry'}, `[${entry.time}] ${entry.level.toUpperCase()}: ${entry.message}`));
    });
    container.appendChild(el('div',{}, el('a',{href:'#/'}, 'Back')));
    return container;
  }

  async function route(){
    const hash = window.location.hash || '#/';
    const parts = hash.slice(2).split('/').filter(Boolean);
    app.innerHTML = '';
    app.appendChild(nav());
    if(parts.length === 0){
      // home: shops list
      const shops = await fetchShops();
      app.appendChild(el('h1',{}, 'Shops'));
      app.appendChild(renderShopsList(shops));
    } else if(parts[0] === 'add-shop'){
      app.appendChild(el('h1',{}, 'Add Shop'));
      app.appendChild(renderAddShopForm());
    } else if(parts[0] === 'shop' && parts[1]){
      const id = parts[1];
      const page = await renderShopPage(id);
      app.appendChild(page);
    } else if(parts[0] === 'logs'){
      const page = await renderLogs();
      app.appendChild(page);
    } else {
      app.appendChild(el('div',{}, 'Page not found'));
    }
  }

  window.addEventListener('hashchange', route);
  // initial route
  route();

})();
