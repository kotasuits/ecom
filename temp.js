
document.addEventListener('DOMContentLoaded', () => {

    if (!localStorage.getItem('admin_token')) { location.href = 'loginkota.html'; return; }
    document.getElementById('logout-btn').onclick = () => { localStorage.clear(); location.href = 'loginkota.html'; };

    let orders = [];
    let currentWaOrder = null;

    // ─── WhatsApp modal ───────────────────────────────────────────────
    const waOverlay  = document.getElementById('wa-overlay');
    const waMsg      = document.getElementById('wa-msg');
    const waName     = document.getElementById('wa-rec-name');
    const waPhone    = document.getElementById('wa-rec-phone');
    const waAvatar   = document.getElementById('wa-rec-avatar');
    const waChar     = document.getElementById('wa-charcount');
    const waTemplBox = document.getElementById('wa-templates');

    const TEMPLATES = [
        { label: '👋 Greeting',       text: (o) => `Hi ${o.name}! 🙏 This is Kota Doria Wholesale. Thank you for your enquiry for ${o.designs?.length || 0} designs. We'd love to help you place your order!` },
        { label: '📦 Confirm Order',   text: (o) => `Hello ${o.name}, we have received your selection of ${o.designs?.length || 0} designs from Kota Doria. Please confirm your order quantity so we can process it. Minimum 30-50 pcs per design.` },
        { label: '📞 Request Call',    text: (o) => `Hi ${o.name}, this is Kota Doria Wholesale. Can we schedule a quick call to discuss your enquiry for ${o.designs?.length || 0} designs? Please let us know your preferred time.` },
        { label: '💰 Share Pricing',   text: (o) => { 
            let totalEst = 0;
            const designs = (o.designs||[]).map(d => {
                const selCount = Math.max(1, (d.selectedImages || []).length || (d.selectedImage ? 1 : 1));
                const itemPrice = Number(d.price) || 0;
                totalEst += (selCount * itemPrice);
                if (selCount > 1) return `• ${d.title} (${selCount} colors)\n  ₹${itemPrice.toLocaleString('en-IN')} x ${selCount} = ₹${(selCount * itemPrice).toLocaleString('en-IN')}/pc`;
                return `• ${d.title} — ₹${itemPrice.toLocaleString('en-IN')}/pc`;
            }).join('\n\n');
            return `Hi ${o.name}! Here is the pricing for your selected Kota Doria designs:\n\n${designs}\n\n*Estimated Order Total: ₹${totalEst.toLocaleString('en-IN')}*\n(Note: Wholesale MOQ is 30-50 pcs per color).\n\nInterested in placing an order? Reply to confirm! 🎀`; 
        } },
        { label: '✅ Order Ready',     text: (o) => `Dear ${o.name}, your Kota Doria order is ready for dispatch! Kindly confirm your delivery address and preferred courier. We look forward to serving you again! 🛍️` },
        { label: '🎉 Follow Up',       text: (o) => `Hi ${o.name}! 👋 Just following up on your Kota Doria enquiry for ${o.designs?.length || 0} designs. Let us know if you have any questions — we're happy to help!` },
    ];

    function openWaModal(order) {
        currentWaOrder = order;

        // Fill recipient
        const initials = order.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        waAvatar.textContent = initials;
        waName.textContent   = order.name;
        waPhone.textContent  = '📱 ' + order.phone;

        // Fill template chips
        waTemplBox.innerHTML = '';
        TEMPLATES.forEach(tpl => {
            const chip = document.createElement('button');
            chip.className   = 'tpl-chip';
            chip.textContent = tpl.label;
            chip.onclick = () => {
                waMsg.value = tpl.text(order);
                waChar.textContent = waMsg.value.length + ' chars';
            };
            waTemplBox.appendChild(chip);
        });

        // Pre-fill with greeting template
        waMsg.value = TEMPLATES[0].text(order);
        waChar.textContent = waMsg.value.length + ' chars';

        waOverlay.classList.add('open');
        setTimeout(() => waMsg.focus(), 300);
    }

    function closeWaModal() { waOverlay.classList.remove('open'); currentWaOrder = null; }

    document.getElementById('wa-close').onclick    = closeWaModal;
    waOverlay.addEventListener('click', e => { if (e.target === waOverlay) closeWaModal(); });
    waMsg.addEventListener('input', () => { waChar.textContent = waMsg.value.length + ' chars'; });

    document.getElementById('wa-send-btn').onclick = () => {
        const msg  = waMsg.value.trim();
        if (!msg) { waMsg.focus(); return; }
        const phone = currentWaOrder.phone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');

        // Update status to "contacted"
        const o = orders.find(x => x.id === currentWaOrder.id);
        if (o && (o.status === 'new' || o.status === 'seen')) {
            o.status = 'contacted'; saveOrders(); render();
            syncRemoteOrderUpdates('status', { id: o.id, status: 'contacted' });
        }
        closeWaModal();
        toast('💬 WhatsApp opened!', 'ok');
    };

    // ─── Load orders ──────────────────────────────────────────────────
    async function loadOrders() {
        const mode    = localStorage.getItem('admin_mode');
        const ghToken = localStorage.getItem('gh_token');
        const ghRepo  = localStorage.getItem('gh_repo');
        let remote = [];

        if (mode === 'github' && ghToken && ghRepo) {
            try {
                const r = await fetch(`https://api.github.com/repos/${ghRepo}/contents/orders.json?t=${Date.now()}`,
                    { headers:{ 'Authorization':`token ${ghToken}`, 'Accept':'application/vnd.github.v3+json' } });
                if (r.ok) {
                    const d = await r.json();
                    remote = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\s/g,'')))));
                }
            } catch {}
        } else if (mode === 'server') {
            try {
                const r = await fetch('api/orders', { headers:{ 'Authorization': localStorage.getItem('admin_token') } });
                if (r.ok) remote = await r.json();
            } catch {}
        }

        const local  = JSON.parse(localStorage.getItem('kd_orders') || '[]');
        const merged = [...remote];
        local.forEach(o => { if (!merged.find(x => x.id === o.id)) merged.push(o); });
        orders = merged.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        render();
    }

    function saveOrders() { localStorage.setItem('kd_orders', JSON.stringify(orders)); }

    // ─── Render ───────────────────────────────────────────────────────
    function render() {
        updateStats();
        const q    = document.getElementById('search-box').value.toLowerCase();
        const stat = document.getElementById('filter-status').value;
        const list = orders.filter(o => {
            const mQ = !q || o.name.toLowerCase().includes(q) || o.phone.includes(q);
            const mS = stat === 'all' || o.status === stat;
            return mQ && mS;
        });

        const container = document.getElementById('orders-list');
        if (!list.length) {
            container.innerHTML = `<div class="empty-orders"><div class="eo-ico">📭</div><p>${orders.length ? 'No results match your filter.' : 'No enquiries yet.<br>They appear here once customers submit from the catalog.'}</p></div>`;
            return;
        }
        container.innerHTML = '';
        list.forEach(o => container.appendChild(buildCard(o)));

        // Auto-mark new → seen
        const newlySeen = list.filter(o => o.status === 'new');
        if (newlySeen.length > 0) {
            newlySeen.forEach(o => o.status = 'seen');
            saveOrders();
            syncRemoteOrderUpdates('mark_seen', { ids: newlySeen.map(o => o.id) });
        }
    }

    function updateStats() {
        document.getElementById('s-total').textContent     = orders.length;
        document.getElementById('s-new').textContent       = orders.filter(o=>o.status==='new').length;
        document.getElementById('s-contacted').textContent = orders.filter(o=>o.status==='contacted').length;
        document.getElementById('s-closed').textContent    = orders.filter(o=>o.status==='closed').length;
    }

    function buildCard(order) {
        const card = document.createElement('div');
        card.className = `order-card status-${order.status}`;
        card.dataset.id = order.id;

        let grandTotal = 0;

        const initials    = order.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const date        = new Date(order.createdAt).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
        const sbMap       = { new:'sb-new', seen:'sb-seen', contacted:'sb-contacted', closed:'sb-closed' };
        const slMap       = { new:'🆕 New', seen:'👀 Seen', contacted:'📞 Contacted', closed:'✅ Closed' };
        const designsHtml = (order.designs||[]).map(d => {
            const allImgs      = d.images?.length ? d.images : (d.image ? [d.image] : []);
            let selImgs = d.selectedImages?.length ? d.selectedImages
                        : d.selectedImage         ? [d.selectedImage]
                        : [allImgs[0] || ''];
            selImgs = selImgs.filter(s => s); // remove empty

            const selCount   = Math.max(1, selImgs.length);
            const itemPrice  = Number(d.price||0);
            const itemTotal  = selCount * itemPrice;
            grandTotal += itemTotal;

            const gridClass = `n${Math.min(selCount, 4)}`;

            const picksHtml = selImgs.slice(0,4).map((s, i) => `
                <div class="dc-pick-item">
                    <img src="${s}" alt="Pick ${i+1}" onerror="this.style.display='none'">
                    <div class="dc-pick-star">★${i+1}</div>
                </div>`).join('');

            const selIdxArr = selImgs.map(s => allImgs.indexOf(s)).filter(i => i >= 0);

            let priceText = `₹${itemPrice.toLocaleString('en-IN')}`;
            if (selCount > 1) {
                priceText = `₹${itemPrice} x ${selCount} = ₹${itemTotal.toLocaleString('en-IN')}`;
            }

            return `<div class="design-chip"
                data-imgs='${JSON.stringify(allImgs)}'
                data-sel-idxs='${JSON.stringify(selIdxArr)}'
                data-title="${d.title.replace(/"/g,'&quot;')}"
                data-cat="${(d.category||'').replace(/-/g,' ')}"
                data-price="${d.price}">
                <div class="dc-picks-grid ${gridClass}">${picksHtml}</div>
                <div class="dc-name">${d.title}</div>
                <div class="dc-price">${priceText}</div>
                <div class="dc-zoom">
                    ${selCount > 1 ? `★ ${selCount} colors picked` : '★ 1 color picked'}
                </div>
            </div>`;
        }).join('');

        const waIcon = `<svg viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964.984-3.595c-.607-1.052-.927-2.246-.926-3.468.001-3.825 3.113-6.937 6.937-6.937 1.856.001 3.598.723 4.907 2.034 1.31 1.311 2.031 3.054 2.03 4.908-.001 3.825-3.113 6.938-6.937 6.938z"/></svg>`;

        card.innerHTML = `
            <!-- ── HEAD: always visible ── -->
            <div class="order-head">
                <div class="oh-avatar">${initials}</div>
                <div class="oh-info">
                    <div class="oh-name">${order.name}</div>
                    <div class="oh-phone">📱 ${order.phone}</div>
                </div>
                <div class="oh-meta">
                    <span class="sbadge ${sbMap[order.status]||'sb-new'}">${slMap[order.status]||order.status}</span>
                    <span class="oh-count">${(order.designs||[]).length} designs</span>
                    <span class="oh-date">${date}</span>
                    <!-- ✅ WhatsApp button ALWAYS visible here -->
                    <button class="wa-btn wa-head-btn" data-id="${order.id}" title="Send WhatsApp message to ${order.name}">${waIcon} WhatsApp</button>
                    <span class="chevron">▼</span>
                </div>
            </div>

            <!-- ── BODY: expandable ── -->
            <div class="order-body">
                <div class="designs-grid">${designsHtml}</div>
                <div class="order-meta">
                    <span>🆔 ${order.id}</span>
                    <span>💰 Est. ₹${grandTotal.toLocaleString('en-IN')}</span>
                    <span>📅 ${date}</span>
                </div>
                <div class="body-actions">
                    <span style="font-size:.78rem;color:rgba(255,255,255,.35)">Status:</span>
                    <select class="status-sel" data-id="${order.id}">
                        <option value="new"       ${order.status==='new'?'selected':''}>🆕 New</option>
                        <option value="seen"      ${order.status==='seen'?'selected':''}>👀 Seen</option>
                        <option value="contacted" ${order.status==='contacted'?'selected':''}>📞 Contacted</option>
                        <option value="closed"    ${order.status==='closed'?'selected':''}>✅ Closed</option>
                    </select>
                    <button class="wa-btn wa-body-btn" data-id="${order.id}">${waIcon} WhatsApp</button>
                    <button class="del-btn" data-id="${order.id}">🗑 Delete</button>
                </div>
            </div>`;

        // ── Expand/collapse (click head but not WA button) ──
        card.querySelector('.order-head').addEventListener('click', e => {
            if (e.target.closest('.wa-head-btn')) return;
            card.querySelector('.order-body').classList.toggle('open');
            card.querySelector('.chevron').classList.toggle('open');
        });

        // ── Design chip → gallery (opens with ONLY selected photos) ──
        card.querySelectorAll('.design-chip').forEach(chip => {
            chip.onclick = e => {
                e.stopPropagation();
                let imgs, selIdxs;
                try { imgs    = JSON.parse(chip.dataset.imgs    || '[]'); } catch { imgs = []; }
                try { selIdxs = JSON.parse(chip.dataset.selIdxs || '[0]'); } catch { selIdxs = [0]; }
                if (!imgs.length) return;

                // Only extract the photos that were actually picked
                let pickedImgs = selIdxs.map(i => imgs[i]).filter(Boolean);
                if (!pickedImgs.length) pickedImgs = [imgs[0] || ''];

                // Since we filtered, all photos in the array are picks!
                const newSelIdxs = pickedImgs.map((_, i) => i);

                openGallery({
                    images:      pickedImgs,
                    startIdx:    0,
                    selectedIdx: 0,
                    selIdxs:     newSelIdxs,
                    title:       chip.dataset.title,
                    category:    chip.dataset.cat,
                    price:       chip.dataset.price
                });
            };
        });

        // ── WA buttons (both head & body) ──
        card.querySelectorAll('.wa-btn').forEach(btn => {
            btn.onclick = e => {
                e.stopPropagation();
                openWaModal(order);
            };
        });

        // ── Status change ──
        card.querySelector('.status-sel').onchange = e => {
            e.stopPropagation();
            const o = orders.find(x => x.id === e.target.dataset.id);
            if (o) { 
                o.status = e.target.value; 
                saveOrders(); 
                updateStats(); 
                card.className = `order-card status-${o.status}`;
                syncRemoteOrderUpdates('status', { id: o.id, status: o.status });
            }
        };

        // ── Delete ──
        const delBtn = card.querySelector('.del-btn');
        if(delBtn) {
            delBtn.onclick = async e => {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm(`Delete enquiry from ${order.name}?`)) return;
                
                delBtn.disabled = true;
                delBtn.textContent = 'Deleting...';
                
                await syncRemoteOrderUpdates('delete', { id: order.id });

                orders = orders.filter(x => String(x.id) !== String(order.id));
                saveOrders();
                render();
                toast('🗑 Enquiry deleted', 'ok'); // Changed to specific confirm toast
            };
        }

        return card;
    }

    document.getElementById('search-box').addEventListener('input', render);
    document.getElementById('filter-status').addEventListener('change', render);

    // ─── Photo Gallery Lightbox ────────────────────────────────
    const photoLb    = document.getElementById('photo-lb');
    const lbMainImg  = document.getElementById('lb-main-img');
    const lbTitle    = document.getElementById('lb-title');
    const lbCat      = document.getElementById('lb-cat');
    const lbPrice    = document.getElementById('lb-price');
    const lbCounter  = document.getElementById('lb-counter');
    const lbThumbs   = document.getElementById('lb-thumbs');
    const lbDlBtn    = document.getElementById('lb-dl-btn');
    const lbPrev     = document.getElementById('lb-prev');
    const lbNext     = document.getElementById('lb-next');

    let lbImages = [], lbIdx = 0, lbMeta = {};

    function openGallery({ images, startIdx = 0, selectedIdx = 0, selIdxs = [], title, category, price }) {
        lbImages = images; lbIdx = 0;
        const allSelIdx = selIdxs.length ? selIdxs : [selectedIdx];
        lbMeta = { title, category, price, allSelIdx };
        lbTitle.textContent = title;
        lbCat.textContent   = category;
        lbPrice.textContent = `₹${Number(price).toLocaleString('en-IN')}/pc`;

        // Build thumbnail strip — gold ★ on ALL customer picks
        lbThumbs.innerHTML = '';
        if (images.length <= 1) {
            lbThumbs.style.display = 'none';
        } else {
            lbThumbs.style.display = 'flex';
            images.forEach((src, i) => {
                const isPick = allSelIdx.includes(i);
                const pickNum = allSelIdx.indexOf(i) + 1;
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative;flex-shrink:0';
                const t = document.createElement('img');
                t.className = 'lb-thumb' + (i === startIdx ? ' active' : '');
                t.src = src; t.alt = `Photo ${i+1}`;
                t.style.border = isPick ? '2px solid #fbbf24' : '';
                t.onclick = () => lbGoTo(i);
                wrap.appendChild(t);
                if (isPick) {
                    const star = document.createElement('div');
                    star.style.cssText = 'position:absolute;top:1px;right:1px;font-size:8px;background:rgba(251,191,36,0.92);color:#000;border-radius:3px;padding:1px 3px;font-weight:900;line-height:1.2';
                    star.textContent = `★${pickNum}`;
                    wrap.appendChild(star);
                }
                lbThumbs.appendChild(wrap);
            });
        }

        lbGoTo(startIdx);
        photoLb.classList.add('open');
    }

    function lbGoTo(idx) {
        lbIdx = Math.max(0, Math.min(idx, lbImages.length - 1));
        // Fade
        lbMainImg.classList.add('fading');
        setTimeout(() => {
            lbMainImg.src = lbImages[lbIdx];
            lbMainImg.classList.remove('fading');
        }, 100);
        lbCounter.textContent = `${lbIdx+1} / ${lbImages.length}`;
        lbPrev.disabled = lbIdx === 0;
        lbNext.disabled = lbIdx === lbImages.length - 1;
        // Sync thumbnails
        lbThumbs.querySelectorAll('.lb-thumb').forEach((t, i) => t.classList.toggle('active', i === lbIdx));
    }

    lbPrev.onclick = () => lbGoTo(lbIdx - 1);
    lbNext.onclick = () => lbGoTo(lbIdx + 1);
    document.getElementById('photo-lb-close').onclick = () => photoLb.classList.remove('open');
    photoLb.addEventListener('click', e => { if (e.target === photoLb) photoLb.classList.remove('open'); });
    document.addEventListener('keydown', e => {
        if (!photoLb.classList.contains('open')) return;
        if (e.key === 'Escape')      photoLb.classList.remove('open');
        if (e.key === 'ArrowLeft')   lbGoTo(lbIdx - 1);
        if (e.key === 'ArrowRight')  lbGoTo(lbIdx + 1);
    });

    // ── Download current photo ──
    lbDlBtn.onclick = async () => {
        const src  = lbImages[lbIdx];
        if (!src) return;
        lbDlBtn.disabled = true;
        lbDlBtn.textContent = 'Downloading…';
        try {
            const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src;
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            cv.getContext('2d').drawImage(img, 0, 0);
            const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.95));
            const slug = (lbMeta.title || 'photo').replace(/\s+/g,'_').toLowerCase();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${slug}_photo${lbIdx+1}.jpg`;
            a.click();
            URL.revokeObjectURL(a.href);
            toast(`⬇️ Downloaded photo ${lbIdx+1}`, 'ok');
        } catch { toast('Download failed — image may be cross-origin', 'err'); }
        finally { lbDlBtn.disabled = false; lbDlBtn.textContent = '⬇️ Download Photo'; }
    };

    // ─── Export CSV ───────────────────────────────────────────────────
    document.getElementById('export-btn').onclick = () => {
        if (!orders.length) { toast('No orders to export', 'err'); return; }
        const rows = [['ID','Name','Phone','Designs','Total ₹','Status','Date']];
        orders.forEach(o => {
            const names = (o.designs||[]).map(d=>d.title).join(' | ');
            const total = (o.designs||[]).reduce((s,d) => {
                const selCount = Math.max(1, (d.selectedImages || []).length || (d.selectedImage ? 1 : 1));
                return s + (Number(d.price||0) * selCount);
            }, 0);
            rows.push([o.id, o.name, o.phone, names, total, o.status, new Date(o.createdAt).toLocaleString('en-IN')]);
        });
        const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const a   = document.createElement('a');
        a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = `kota-doria-orders-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        toast('✅ CSV exported!', 'ok');
    };

    // ─── Toast ────────────────────────────────────────────────────────
    function toast(msg, type='') {
        const t = document.createElement('div');
        t.className = `ot ${type}`;
        t.textContent = msg;
        document.getElementById('o-toast').appendChild(t);
        setTimeout(() => t.remove(), 3500);
    // ─── Remote Sync Function ──────────────────────────────────────────
    async function syncRemoteOrderUpdates(action, data) {
        const mode    = localStorage.getItem('admin_mode');
        const ghToken = localStorage.getItem('gh_token');
        const ghRepo  = localStorage.getItem('gh_repo');

        if (mode === 'github' && ghToken && ghRepo) {
            try {
                const url = `https://api.github.com/repos/${ghRepo}/contents/orders.json`;
                const headers = { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' };
                const r = await fetch(url + '?t=' + Date.now(), { headers });
                if (r.ok) {
                    const d = await r.json();
                    let content = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\\s/g, '')))));
                    
                    if (action === 'delete') {
                        content = content.filter(o => String(o.id) !== String(data.id));
                    } else if (action === 'status') {
                        const idx = content.findIndex(o => String(o.id) === String(data.id));
                        if(idx !== -1) content[idx].status = data.status;
                    } else if (action === 'mark_seen') {
                        let changed = false;
                        data.ids.forEach(id => {
                            const idx = content.findIndex(o => String(o.id) === String(id));
                            if (idx !== -1 && content[idx].status === 'new') {
                                content[idx].status = 'seen';
                                changed = true;
                            }
                        });
                        if (!changed) return;
                    }

                    const body = {
                        message: `Admin action: ${action}`,
                        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
                        sha: d.sha
                    };
                    await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
                }
            } catch(err) { console.error('GitHub sync error', err); }
        } else if (mode === 'server') {
            try {
                if (action === 'delete') {
                    await fetch(`api/orders/${data.id}`, { method: 'DELETE', headers: { 'Authorization': localStorage.getItem('admin_token') } });
                } else if (action === 'status') {
                    await fetch(`api/orders/${data.id}`, { method: 'PUT', headers: { 'Authorization': localStorage.getItem('admin_token'), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: data.status }) });
                } else if (action === 'mark_seen') {
                    for(let id of data.ids) {
                        await fetch(`api/orders/${id}`, { method: 'PUT', headers: { 'Authorization': localStorage.getItem('admin_token'), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'seen' }) });
                    }
                }
            } catch(err) { console.error('Server sync error', err); }
        }
    }

    loadOrders();
});
