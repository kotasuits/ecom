document.addEventListener('DOMContentLoaded', () => {
    const productGrid = document.getElementById('product-grid');
    const POPUP_TRIGGER = 99999; // Disable auto popup for cart

    // ════════════════════════════════════════════
    //  FAVOURITES STATE
    // ════════════════════════════════════════════
    // Each item: { id, title, category, price, image }
    let favourites = JSON.parse(localStorage.getItem('kd_favourites') || '[]');

    function saveFavs() {
        localStorage.setItem('kd_favourites', JSON.stringify(favourites));
    }
    function isFaved(id) { return favourites.some(f => f.id === id); }

    let popupTriggered = false; // only fire the popup once per session

    // ── toggleFav: remove OR open picker ──
    function toggleFav(product, images) {
        const idx = favourites.findIndex(f => f.id === product.id);
        if (idx >= 0) {
            // Un-favourite directly
            favourites.splice(idx, 1);
            saveFavs();
            refreshFavUI();
            return;
        }
        // Adding: single image → add instantly, multiple → show picker
        if (images.length > 1) {
            openPhotoPicker(product, images);
        } else {
            pushFav(product, images, images[0] || '');
        }
    }

    // ── Actually push a favourite — selectedImages is always an array ──
    function pushFav(product, images, selectedImages) {
        // Normalise: single string → array (for single-image products)
        if (!Array.isArray(selectedImages)) selectedImages = [selectedImages];
        favourites.push({
            id:             product.id,
            title:          product.title,
            category:       product.category,
            price:          product.price,
            image:          selectedImages[0] || '',  // first pick → drawer thumb
            selectedImages: selectedImages,           // all customer's chosen photos
            images:         images                    // full gallery → admin
        });
        saveFavs();
        refreshFavUI();
        if (favourites.length === 1) openDrawer();
        if (!popupTriggered && favourites.length === POPUP_TRIGGER) {
            popupTriggered = true;
            setTimeout(() => openOrderModal(), 400);
        }
    }

    // ── Photo Picker Modal — MULTI-SELECT ──
    let ppPendingProduct = null, ppPendingImages = [], ppSelectedSrcs = new Set();

    function openPhotoPicker(product, images) {
        ppPendingProduct = product;
        ppPendingImages  = images;
        ppSelectedSrcs   = new Set();

        document.getElementById('pp-name').textContent = product.title;
        updatePpBtn();

        const grid = document.getElementById('pp-grid');
        grid.innerHTML = '';
        images.forEach((src, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'pp-thumb';
            wrap.innerHTML = `
                <img src="${src}" alt="Photo ${i+1}" loading="lazy">
                <div class="pp-check-ico">✓</div>
                <div class="pp-num">${i+1}</div>`;
            wrap.onclick = () => {
                // TOGGLE selection — multi-select
                if (ppSelectedSrcs.has(src)) {
                    ppSelectedSrcs.delete(src);
                    wrap.classList.remove('selected');
                } else {
                    ppSelectedSrcs.add(src);
                    wrap.classList.add('selected');
                }
                updatePpBtn();
            };
            grid.appendChild(wrap);
        });

        document.getElementById('pp-overlay').classList.add('open');
    }

    function updatePpBtn() {
        const n   = ppSelectedSrcs.size;
        const btn = document.getElementById('pp-add-btn');
        if (!btn) return;
        btn.disabled    = n === 0;
        btn.textContent = n === 0
            ? '🛒 Select photos to add'
            : `🛒 Add ${n} Photo${n !== 1 ? 's' : ''} to Cart`;
    }

    // ── Picker button/overlay event listeners ──
    (function wirePicker() {
        const overlay = document.getElementById('pp-overlay');
        const btnClose  = document.getElementById('pp-close');
        const btnCancel = document.getElementById('pp-cancel');
        const btnAdd    = document.getElementById('pp-add-btn');
        if (!overlay) return; // HTML not loaded

        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.remove('open');
        });
        btnClose.onclick  = () => overlay.classList.remove('open');
        btnCancel.onclick = () => overlay.classList.remove('open');
        btnAdd.onclick    = () => {
            if (ppSelectedSrcs.size === 0 || !ppPendingProduct) return;
            overlay.classList.remove('open');
            pushFav(ppPendingProduct, ppPendingImages, [...ppSelectedSrcs]);
            showToast(`🛒 ${ppSelectedSrcs.size} photo${ppSelectedSrcs.size !== 1 ? 's' : ''} added to cart!`);
        };
    })();

    // ── Toast helper (uses #success-toast element in index.html) ──
    function showToast(msg) {
        const el = document.getElementById('success-toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 3000);
    }
    function refreshHeartButtons() {
        document.querySelectorAll('.heart-btn').forEach(btn => {
            const id = btn.dataset.id;
            const faved = isFaved(id);
            btn.classList.toggle('faved', faved);
            btn.querySelector('.hic').textContent = faved ? '✅' : '🛒';
            btn.setAttribute('aria-label', faved ? 'Remove from cart' : 'Add to cart');
        });
        document.querySelectorAll('.product-card').forEach(card => {
            card.classList.toggle('faved-card', isFaved(card.dataset.id));
        });
    }

    // ════════════════════════════════════════════
    //  NAV COUNTER
    // ════════════════════════════════════════════
    const favCounter = document.getElementById('fav-counter');
    function updateCounter() {
        const n = favourites.length;
        favCounter.textContent = n;
        favCounter.classList.toggle('visible', n > 0);
    }

    // ════════════════════════════════════════════
    //  DRAWER
    // ════════════════════════════════════════════
    const favOverlay = document.getElementById('fav-overlay');
    const favDrawer  = document.getElementById('fav-drawer');
    const drawerBody = document.getElementById('drawer-body');
    const drawerCountEl = document.getElementById('drawer-count');
    const btnOrder   = document.getElementById('btn-place-order');

    function openDrawer()  { favOverlay.classList.add('open'); favDrawer.classList.add('open'); }
    function closeDrawer() { favOverlay.classList.remove('open'); favDrawer.classList.remove('open'); }

    document.getElementById('fav-nav-btn').onclick = openDrawer;
    document.getElementById('drawer-close').onclick = closeDrawer;
    favOverlay.onclick = closeDrawer;

    function renderDrawer() {
        const n = favourites.length;
        drawerCountEl.textContent = n;

        if (n === 0) {
            drawerBody.innerHTML = `<div class="drawer-empty"><div class="de-ico">🛒</div><p>Your cart is empty.<br>Add some designs!</p></div>`;
            btnOrder.disabled = true;
            btnOrder.textContent = `📋 Checkout`;
            return;
        }

        btnOrder.disabled    = false;
        btnOrder.textContent = `📋 Checkout (${n} item${n !== 1 ? 's' : ''})`;

        drawerBody.innerHTML = '';
        favourites.forEach((item, i) => {
            const row = document.createElement('div');
            row.className = 'fav-item';
            row.innerHTML = `
                <img class="fav-thumb" src="${item.image}" alt="${item.title}">
                <div class="fav-info">
                    <div class="fav-name">${item.title}</div>
                    <div class="fav-cat">${(item.category || '').replace(/-/g,' ')}</div>
                    <div class="fav-price">₹${Number(item.price).toLocaleString('en-IN')}</div>
                </div>
                <button class="fav-remove" title="Remove" data-i="${i}">✕</button>`;
            row.querySelector('.fav-remove').onclick = () => {
                favourites.splice(i, 1);
                saveFavs();
                refreshFavUI();
            };
            drawerBody.appendChild(row);
        });
    }

    function refreshFavUI() {
        updateCounter();
        renderDrawer();
        refreshHeartButtons();
    }

    document.getElementById('btn-clear-favs').onclick = () => {
        if (!favourites.length) return;
        if (confirm('Clear entire cart?')) {
            favourites = []; saveFavs(); refreshFavUI();
        }
    };

    btnOrder.onclick = openOrderModal;

    // ════════════════════════════════════════════
    //  ORDER MODAL
    // ════════════════════════════════════════════
    const orderOverlay = document.getElementById('order-overlay');
    const omSummary    = document.getElementById('om-summary');
    const omName       = document.getElementById('om-name');
    const omPhone      = document.getElementById('om-phone');

    const omTotalAmt = document.getElementById('om-total-amt');

    function openOrderModal() {
        omName.value  = '';
        omPhone.value = '';
        const addressEl = document.getElementById('om-address');
        if (addressEl) addressEl.value = '';

        omSummary.innerHTML = favourites.map(f => {
            const qty = f.selectedImages ? f.selectedImages.length : 1;
            const lineTotal = Number(f.price) * qty;
            return `
            <div class="checkout-item">
                <div class="checkout-item-img">
                    <img src="${f.image}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">
                    <div class="checkout-item-badge">${qty}</div>
                </div>
                <div class="checkout-item-info">
                    <div class="checkout-item-title">${f.title} (x${qty})</div>
                    <div style="font-size:0.75rem; color:#666;">${(f.category || '').replace(/-/g,' ')}</div>
                </div>
                <div class="checkout-item-price">₹${lineTotal.toLocaleString('en-IN')}</div>
            </div>
            `;
        }).join('');

        const totalAmt = favourites.reduce((s, f) => s + (Number(f.price) * (f.selectedImages ? f.selectedImages.length : 1)), 0);
        if (omTotalAmt) omTotalAmt.textContent = `₹${totalAmt.toLocaleString('en-IN')}`;

        orderOverlay.classList.add('open');
    }
    function closeOrderModal() { orderOverlay.classList.remove('open'); }

    // Auto-detect address
    const btnAutoAddress = document.getElementById('btn-auto-address');
    if (btnAutoAddress) {
        btnAutoAddress.onclick = () => {
            if (!navigator.geolocation) return showToast('Geolocation is not supported by your browser.');
            btnAutoAddress.textContent = '📍 Detecting...';
            btnAutoAddress.classList.add('loading');
            navigator.geolocation.getCurrentPosition(async (pos) => {
                try {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                    if (!res.ok) throw new Error();
                    const data = await res.json();
                    const addr = data.address || {};
                    const parts = [
                        addr.house_number, addr.road, addr.suburb, addr.city || addr.town || addr.village,
                        addr.state, addr.postcode
                    ].filter(Boolean);
                    const addressEl = document.getElementById('om-address');
                    if (addressEl) addressEl.value = parts.join(', ');
                } catch {
                    showToast('Failed to auto-detect address. Please enter manually.');
                } finally {
                    btnAutoAddress.textContent = '📍 Auto-detect';
                    btnAutoAddress.classList.remove('loading');
                }
            }, () => {
                showToast('Location permission denied.');
                btnAutoAddress.textContent = '📍 Auto-detect';
                btnAutoAddress.classList.remove('loading');
            });
        };
    }

    document.getElementById('om-cancel').onclick = closeOrderModal;
    orderOverlay.addEventListener('click', e => { if (e.target === orderOverlay) closeOrderModal(); });

    document.getElementById('om-submit').onclick = async () => {
        const name  = omName.value.trim();
        const phone = omPhone.value.trim();
        const addressEl = document.getElementById('om-address');
        const address = addressEl ? addressEl.value.trim() : '';

        if (!name)  { omName.focus();  shakeInput(omName);  return; }
        if (!phone) { omPhone.focus(); shakeInput(omPhone); return; }
        if (!/^[\d\s+\-]{7,15}$/.test(phone)) { shakeInput(omPhone); omPhone.placeholder = 'Enter valid number'; return; }
        if (addressEl && !address) { addressEl.focus(); shakeInput(addressEl); return; }

        const totalAmt = favourites.reduce((s, f) => s + (Number(f.price) * (f.selectedImages ? f.selectedImages.length : 1)), 0);

        let msg = `*New Order!*\n\n`;
        msg += `*Name:* ${name}\n`;
        msg += `*Phone:* ${phone}\n`;
        msg += `*Address:* ${address}\n\n`;
        msg += `*Items:*\n`;

        const siteUrl = window.location.href.split('#')[0]; // base URL

        favourites.forEach((f, i) => {
            const qty = f.selectedImages ? f.selectedImages.length : 1;
            const lineTotal = Number(f.price) * qty;
            msg += `${i+1}. ${f.title} (Qty: ${qty}) - Rs. ${lineTotal}\n`;

            const imgs = f.selectedImages && f.selectedImages.length ? f.selectedImages : [f.image];
            imgs.forEach((img, j) => {
                let imgUrl = img;
                if (imgUrl.startsWith('images/')) {
                    imgUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + imgUrl;
                } else if (!imgUrl.startsWith('http')) {
                    imgUrl = window.location.origin + '/' + imgUrl;
                }
                msg += `Photo ${j+1}: ${imgUrl}\n`;
            });
            msg += `Link: ${siteUrl}#${f.id}\n\n`;
        });

        msg += `*Total Amount:* Rs. ${totalAmt}\n`;

        const waLink = `https://wa.me/919664498112?text=${encodeURIComponent(msg)}`;

        const order = {
            id:        'ORD-' + Date.now(),
            name,
            phone,
            address,
            designs:   [...favourites],
            total:     totalAmt,
            status:    'new',
            createdAt: new Date().toISOString()
        };

        // Save to localStorage (orders list for admin panel)
        const orders = JSON.parse(localStorage.getItem('kd_orders') || '[]');
        orders.unshift(order);
        localStorage.setItem('kd_orders', JSON.stringify(orders));

        // Also try saving to server/GitHub if available
        try {
            const mode    = localStorage.getItem('admin_mode');
            const ghToken = localStorage.getItem('gh_token');
            const ghRepo  = localStorage.getItem('gh_repo');
            if (mode === 'github' && ghToken && ghRepo) {
                await saveOrderToGitHub(order, ghToken, ghRepo);
            } else if (mode === 'server') {
                await fetch('api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) }).catch(() => {});
            }
        } catch(_) { /* silently ignore — localStorage always works */ }

        closeOrderModal();
        closeDrawer();
        favourites = []; saveFavs(); refreshFavUI();
        
        window.open(waLink, '_blank');
        showToast('✅ Redirecting to WhatsApp... 🎉');
    };

    function shakeInput(el) {
        el.style.borderColor = '#e11d48';
        el.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(-3px)'},{transform:'translateX(0)'}], {duration:300});
        setTimeout(() => el.style.borderColor = '', 1500);
    }

    async function saveOrderToGitHub(order, ghToken, ghRepo) {
        // Append to orders.json in the GitHub repo
        const url = `https://api.github.com/repos/${ghRepo}/contents/orders.json`;
        const headers = { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' };
        let existing = [], sha = null;
        try {
            const r = await fetch(url + '?t=' + Date.now(), { headers });
            if (r.ok) { const d = await r.json(); sha = d.sha; existing = JSON.parse(decodeURIComponent(escape(atob(d.content.replace(/\s/g, ''))))); }
        } catch(_) {}
        existing.unshift(order);
        const body = { message: `New order: ${order.name}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(existing, null, 2)))) };
        if (sha) body.sha = sha;
        await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
    }

    // ════════════════════════════════════════════
    //  TOAST
    // ════════════════════════════════════════════
    function showToast(msg) {
        const t = document.getElementById('success-toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 4000);
    }

    // ════════════════════════════════════════════
    //  LIGHTBOX
    // ════════════════════════════════════════════
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-overlay';
    lightbox.innerHTML = `
        <button class="lightbox-close" aria-label="Close">✕</button>
        <button class="lightbox-arrow lightbox-prev" aria-label="Previous">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 18l-6-6 6-6"/></svg>
        </button>
        <img class="lightbox-img" src="" alt="Preview">
        <button class="lightbox-arrow lightbox-next" aria-label="Next">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 18l6-6-6-6"/></svg>
        </button>`;
    document.body.appendChild(lightbox);
    const lbImg  = lightbox.querySelector('.lightbox-img');
    const lbPrev = lightbox.querySelector('.lightbox-prev');
    const lbNext = lightbox.querySelector('.lightbox-next');
    let lbImages = [], lbIdx = 0;

    const updateLB = () => {
        lbImg.src = lbImages[lbIdx];
        lbPrev.style.display = lbImages.length > 1 ? 'flex' : 'none';
        lbNext.style.display = lbImages.length > 1 ? 'flex' : 'none';
    };
    const openLB = (imgs, idx) => { lbImages = Array.isArray(imgs) ? imgs : [imgs]; lbIdx = idx || 0; updateLB(); lightbox.classList.add('open'); };
    lbPrev.onclick = e => { e.stopPropagation(); lbIdx = (lbIdx - 1 + lbImages.length) % lbImages.length; updateLB(); };
    lbNext.onclick = e => { e.stopPropagation(); lbIdx = (lbIdx + 1) % lbImages.length; updateLB(); };
    lightbox.onclick = e => { if (e.target === lightbox || e.target.classList.contains('lightbox-close')) lightbox.classList.remove('open'); };
    document.addEventListener('keydown', e => {
        if (!lightbox.classList.contains('open')) return;
        if (e.key === 'Escape') lightbox.classList.remove('open');
        if (e.key === 'ArrowLeft') lbPrev.click();
        if (e.key === 'ArrowRight') lbNext.click();
    });

    // ════════════════════════════════════════════
    //  PRODUCT RENDERING
    // ════════════════════════════════════════════
    let allProducts = [], filteredProducts = [], currentPage = 0;
    const BATCH = 12;

    const showSkeletons = (n = 6) => {
        productGrid.innerHTML = Array(n).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-img skeleton"></div>
                <div class="skeleton-text skeleton"></div>
                <div class="skeleton-desc skeleton"></div>
                <div class="skeleton-price skeleton"></div>
            </div>`).join('');
    };

    const loadNextBatch = () => {
        const start = currentPage * BATCH, end = start + BATCH;
        const batch = filteredProducts.slice(start, end);
        if (batch.length) { displayProducts(batch, currentPage === 0); currentPage++; }
        sentinel.style.display = end >= filteredProducts.length ? 'none' : 'block';
    };

    const fetchProducts = async () => {
        try {
            const cb = '?t=' + Date.now();
            const res = await fetch('api/products' + cb).catch(() => fetch('data.json' + cb));
            if (!res.ok && res.url.includes('api')) return fetch('data.json' + cb).then(r => r.json());
            return await res.json();
        } catch { productGrid.innerHTML = '<p style="color:#6b6b6b;grid-column:1/-1;text-align:center;padding:3rem">Failed to load products.</p>'; return []; }
    };

    const dlIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

    const displayProducts = (items, clear = false) => {
        if (clear) productGrid.innerHTML = '';
        if (!items.length && clear) { productGrid.innerHTML = '<p style="color:#6b6b6b;grid-column:1/-1;text-align:center;padding:3rem">No products found.</p>'; return; }

        items.forEach(product => {
            const images  = (product.images?.length) ? product.images : (product.image ? [product.image] : []);
            const hasMany = images.length > 1;
            const fc      = c => (c || '').replace(/-/g,' ');
            const thumbs  = hasMany ? images.map((s,i) => `<img src="${s}" class="thumb-img${i===0?' active':''}" data-index="${i}" loading="lazy">`).join('') : '';
            const arrows  = hasMany ? `
                <button class="slide-arrow prev-arrow" aria-label="Prev"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 18l-6-6 6-6"/></svg></button>
                <button class="slide-arrow next-arrow" aria-label="Next"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 18l6-6-6-6"/></svg></button>` : '';

            const card = document.createElement('div');
            card.className = 'product-card card-animate';
            card.dataset.id = product.id;
            if (isFaved(product.id)) card.classList.add('faved-card');

            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${images[0]||''}" alt="${product.title}" class="main-img" loading="lazy">
                    <span class="card-category-badge">${fc(product.category)}</span>
                    ${images.length > 1 ? `<span class="img-count-badge">1 / ${images.length}</span>` : ''}
                    <button class="heart-btn${isFaved(product.id)?' faved':''}" data-id="${product.id}" aria-label="${isFaved(product.id)?'Remove from':'Add to'} cart">
                        <span class="hic">${isFaved(product.id)?'✅':'🛒'}</span>
                    </button>
                    ${arrows}
                </div>
                ${hasMany ? `<div class="thumbnail-strip">${thumbs}</div>` : ''}
                <div class="card-content">
                    <p class="card-category-label">${fc(product.category)}</p>
                    <h3 class="card-title">${product.title}</h3>
                    <p class="card-desc">${product.description||''}</p>
                    <div class="card-footer">
                        <span class="card-price"><sup>₹</sup>${Number(product.price).toLocaleString('en-IN')}</span>
                        <button class="save-btn" title="Download">${dlIcon} Save</button>
                    </div>
                </div>`;

            // Heart button
            const heartBtn = card.querySelector('.heart-btn');
            heartBtn.onclick = e => {
                e.stopPropagation();
                heartBtn.querySelector('.hic').classList.toggle('faved', !isFaved(product.id));
                toggleFav(product, images);
            };

            // Image sliding
            const mainImg   = card.querySelector('.main-img');
            const countBadge = card.querySelector('.img-count-badge');
            let curIdx = 0;
            if (hasMany) {
                const tList = card.querySelectorAll('.thumb-img');
                const prev  = card.querySelector('.prev-arrow');
                const next  = card.querySelector('.next-arrow');
                const go    = idx => { tList[curIdx].classList.remove('active'); curIdx = idx; mainImg.src = images[curIdx]; tList[curIdx].classList.add('active'); if (countBadge) countBadge.textContent = `${curIdx+1} / ${images.length}`; };
                tList.forEach(t => { t.onclick = e => go(+e.currentTarget.dataset.index); });
                if (prev) prev.onclick = e => { e.stopPropagation(); go((curIdx-1+images.length)%images.length); };
                if (next) next.onclick = e => { e.stopPropagation(); go((curIdx+1)%images.length); };
            }

            // Lightbox on image click
            mainImg.onclick = () => openLB(images, curIdx);

            // Save/download
            card.querySelector('.save-btn').onclick = async e => {
                e.preventDefault();
                const btn = e.currentTarget;
                const orig = btn.innerHTML; btn.innerHTML = 'Saving…'; btn.disabled = true;
                try {
                    const img = new Image(); img.crossOrigin = 'Anonymous'; img.src = mainImg.src;
                    await new Promise((r,j) => { img.onload=r; img.onerror=j; });
                    const cv = document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
                    const ctx = cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height); ctx.drawImage(img,0,0);
                    const blob = await new Promise(r => cv.toBlob(r,'image/jpeg',0.95));
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${product.title.replace(/\s+/g,'_')}_${curIdx+1}.jpg`; a.click();
                } catch { alert('Download error.'); }
                finally { btn.innerHTML=orig; btn.disabled=false; }
            };

            productGrid.appendChild(card);
        });
    };

    // Sentinel / infinite scroll
    const sentinel = document.createElement('div');
    sentinel.id = 'pagination-sentinel'; sentinel.style.cssText = 'height:20px;width:100%';
    document.querySelector('.catalog-section').appendChild(sentinel);
    const observer = new IntersectionObserver(es => { if (es[0].isIntersecting && filteredProducts.length) loadNextBatch(); }, { rootMargin:'200px' });
    observer.observe(sentinel);

    // ════════════════════════════════════════════
    //  CATEGORIES + INIT
    // ════════════════════════════════════════════
    const fetchCategories = async () => {
        try {
            const cb = '?t=' + Date.now();
            const res = await fetch('api/categories'+cb).catch(() => fetch('categories.json'+cb));
            if (!res.ok && res.url.includes('api')) return fetch('categories.json'+cb).then(r=>r.json());
            return await res.json();
        } catch { return ['embroidery','block-print','brush-paint','screen-print']; }
    };

    const initApp = async () => {
        showSkeletons(12);
        const [products, cats] = await Promise.all([fetchProducts(), fetchCategories()]);
        allProducts = products; filteredProducts = products;

        const catSel = document.getElementById('category-filter');
        catSel.innerHTML = '<option value="all">All Designs</option>' + cats.map(c => `<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1).replace('-',' ')}</option>`).join('');
        catSel.onchange = e => {
            const f = e.target.value;
            filteredProducts = f === 'all' ? allProducts : allProducts.filter(p => p.category === f);
            currentPage = 0; productGrid.innerHTML = ''; loadNextBatch();
        };

        loadNextBatch();
        refreshFavUI();

        if (window.location.hash) {
            const id = window.location.hash.substring(1);
            const idx = filteredProducts.findIndex(p => p.id === id);
            if (idx >= 0) {
                while (currentPage * BATCH <= idx && currentPage * BATCH < filteredProducts.length) {
                    loadNextBatch();
                }
                setTimeout(() => {
                    const el = document.querySelector(`.product-card[data-id="${id}"]`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.style.boxShadow = '0 0 0 4px #22c55e';
                        setTimeout(() => el.style.boxShadow = '', 2000);
                    }
                }, 800);
            }
        }
    };

    initApp();
});
